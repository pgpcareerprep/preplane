// External mentor discovery via Firecrawl (free tier) + Gemini Flash.
//
// Pipeline:
//   1. Query expansion (Gemini Flash) — fall back to hand-built site: queries.
//   2. Firecrawl /v2/search across LinkedIn / Topmate / ADPList / Superpeer.
//   3. Firecrawl /v2/scrape — markdown + JSON schema extraction.
//   4. Validation pass (Gemini Flash) — keep only fields literally present in the
//      scraped markdown. Regex post-filter on email/phone. Never fabricate.
//   5. Dedupe + rank.
//
// Returns the same envelope as before — `{ mentors: [...] }` — with extra
// optional fields: email, phone, years_experience, pricing, source_url.

import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";

const corsHeaders: Record<string, string> = buildCorsHeaders(new Request("https://lmpmagic.lovable.app"));

type Body = {
  role?: string;
  company?: string;
  industry?: string;
  skills?: string[];
  seniority?: string;
  jdText?: string;
  limit?: number;
  platforms?: Platform[];
  region?: string;
};

const REGION_LABEL: Record<string, string> = {
  in: "India",
  us: "United States",
  uk: "United Kingdom",
  eu: "Europe",
  sg: "Singapore",
  ae: "United Arab Emirates",
};


type Platform = "Topmate" | "ADPList" | "LinkedIn" | "Superpeer";
const ALL_PLATFORMS: Platform[] = ["LinkedIn", "Topmate", "ADPList", "Superpeer"];

type Pricing = { amount: number; currency: string; unit: string } | null;

type DiscoveredMentor = {
  name: string;
  current_role: string;
  company: string;
  industry: string;
  skills: string[];
  seniority_level: string;
  years_experience: number | null;
  email: string | null;
  phone: string | null;
  pricing: Pricing;
  platform: Platform;
  linkedin: string | null;
  booking_url: string | null;
  source_url: string;
};

const FIRECRAWL = "https://api.firecrawl.dev/v2";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const AI_MODEL = "google/gemini-3-flash-preview";

// ─── helpers ────────────────────────────────────────────────────────────────

function platformFromUrl(url: string): Platform | null {
  const u = url.toLowerCase();
  if (u.includes("linkedin.com/in/")) return "LinkedIn";
  if (u.includes("topmate.io/")) return "Topmate";
  if (u.includes("adplist.org/")) return "ADPList";
  if (u.includes("superpeer.com/")) return "Superpeer";
  return null;
}

function cleanLinkedin(v: string | null | undefined): string | null {
  if (!v) return null;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[?#].*$/, "").replace(/\/+$/, "");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const next = s
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/^[a-z]{2,3}\.linkedin\.com\/in\//i, "")
      .replace(/^linkedin\.com\/in\//i, "");
    if (next === s) break;
    s = next;
  }
  if (!s) return null;
  return `https://www.linkedin.com/in/${s}`;
}

function normToken(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function tokensOf(s: string): string[] {
  return normToken(s).split(" ").filter((t) => t.length > 2);
}

function fuzzyContains(hay: string, needle: string): boolean {
  const h = normToken(hay);
  const n = normToken(needle);
  if (!h || !n) return false;
  if (h.includes(n)) return true;
  const ht = new Set(h.split(" "));
  return n.split(" ").every((w) => ht.has(w));
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+()\d][\d\s().-]{6,18}\d$/;

function sanitizeEmail(v: unknown, hay: string): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!EMAIL_RE.test(s)) return null;
  // Must literally appear in the scraped text.
  if (!hay.toLowerCase().includes(s.toLowerCase())) return null;
  return s;
}

function sanitizePhone(v: unknown, hay: string): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!PHONE_RE.test(s)) return null;
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  // Either the raw form or just the digits must appear in the scrape.
  const lowHay = hay.toLowerCase();
  if (!lowHay.includes(s.toLowerCase()) && !lowHay.replace(/\D/g, "").includes(digits)) return null;
  return s;
}

function sanitizePricing(v: unknown, hay: string): Pricing {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const amount = typeof o.amount === "number" ? o.amount : Number(o.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const currency = (typeof o.currency === "string" && o.currency.trim()) || "INR";
  const unit = (typeof o.unit === "string" && o.unit.trim()) || "session";
  // The amount must literally appear in the scraped markdown (with or without separators).
  const a = String(Math.round(amount));
  const lowHay = hay.toLowerCase().replace(/[,\s]/g, "");
  if (!lowHay.includes(a)) return null;
  return { amount, currency, unit };
}

function sanitizeYears(v: unknown, hay: string): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 60) return null;
  const a = String(Math.round(n));
  if (!new RegExp(`\\b${a}\\s*(\\+)?\\s*(years|yrs|y)\\b`, "i").test(hay)) return null;
  return n;
}

// ─── Gemini Flash via Lovable AI Gateway ───────────────────────────────────

async function callGemini(
  apiKey: string,
  system: string,
  user: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const res = await fetch(AI_GATEWAY, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.warn(`gemini ${res.status}: ${await res.text().catch(() => "")}`);
      return null;
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? null;
  } catch (e) {
    console.warn(`gemini err: ${(e as Error).message}`);
    return null;
  }
}

async function expandQueries(
  apiKey: string | null,
  role: string,
  company: string,
  industry: string,
  skills: string[],
  seniority: string,
  jdText: string,
): Promise<string[]> {
  // Hand-built fallbacks — guarantee at least one query per supported site
  // so the URL set is never dominated by a single platform.
  const fallback: string[] = [];
  if (role) {
    if (company) fallback.push(`site:linkedin.com/in "${role}" "${company}"`);
    if (industry) fallback.push(`site:linkedin.com/in "${role}" "${industry}"`);
    fallback.push(`site:linkedin.com/in "${role}"${seniority ? ` "${seniority}"` : ""}`);
    if (company) fallback.push(`"ex-${company}" "${role}" site:linkedin.com/in`);
    fallback.push(`site:topmate.io "${role}"${industry ? ` "${industry}"` : ""}`);
    fallback.push(`site:adplist.org mentor "${role}"`);
    if (industry) fallback.push(`site:superpeer.com "${role}" "${industry}"`);
  }

  if (!apiKey) return fallback;

  const sys =
    "You produce Google search queries that surface real professional profiles. " +
    "Return ONLY a JSON object: {\"queries\": string[]}. Exactly 8 queries: 2 site:linkedin.com/in, " +
    "2 site:topmate.io, 2 site:adplist.org, 2 site:superpeer.com. " +
    "Always include the role verbatim, in quotes. Never invent companies or domains.";
  const user = JSON.stringify({
    role, company, industry, skills: skills.slice(0, 8), seniority,
    jd_excerpt: jdText.slice(0, 2000),
  });
  const raw = await callGemini(apiKey, sys, user);
  if (!raw) return fallback;
  try {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j?.queries) ? j.queries : [];
    const cleaned = arr
      .filter((q: unknown): q is string => typeof q === "string" && q.includes("site:"))
      .slice(0, 8);
    // Always concat fallbacks so each platform is represented.
    const merged = Array.from(new Set([...cleaned, ...fallback]));
    return merged.length ? merged : fallback;
  } catch {
    return fallback;
  }
}


async function validateExtraction(
  apiKey: string | null,
  markdown: string,
  extracted: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (!apiKey) return extracted;
  const sys =
    "You verify whether each field in an extracted profile is literally supported by the source markdown. " +
    "Return ONLY a JSON object with the same shape as the input. For each field, KEEP the value only if it " +
    "appears verbatim (or as an obvious normalised form, e.g. trimmed whitespace) in the markdown. " +
    "Otherwise set it to null. NEVER invent emails, phones, prices, companies, or roles. " +
    "Treat skills as an array of strings actually mentioned on the page; drop any not present.";
  const user = JSON.stringify({
    markdown: markdown.slice(0, 6000),
    extracted,
  });
  const raw = await callGemini(apiKey, sys, user);
  if (!raw) return extracted;
  try {
    const j = JSON.parse(raw);
    if (j && typeof j === "object") return j as Record<string, unknown>;
  } catch {
    /* fall through */
  }
  return extracted;
}

// ─── Firecrawl ─────────────────────────────────────────────────────────────

type SearchHit = { url: string; title: string; description: string };

async function firecrawlSearch(query: string, apiKey: string, limit = 5): Promise<SearchHit[]> {
  const signal = AbortSignal.timeout(8000);
  try {
    const res = await fetch(`${FIRECRAWL}/search`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, limit }),
    });
    if (!res.ok) {
      console.warn(`firecrawl search ${res.status} for "${query}"`);
      return [];
    }
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const items: any[] = data?.data?.web ?? data?.data ?? data?.web ?? [];
    return items
      .map((x) => ({
        url: typeof x?.url === "string" ? x.url : "",
        title: typeof x?.title === "string" ? x.title : "",
        description: typeof x?.description === "string"
          ? x.description
          : (typeof x?.snippet === "string" ? x.snippet : ""),
      }))
      .filter((h) => h.url);
  } catch (e) {
    console.warn(`firecrawl search err: ${(e as Error).message}`);
    return [];
  }
}

// Build a LinkedIn mentor straight from search snippet — LinkedIn blocks
// Firecrawl /scrape with HTTP 403, so we never try to fetch the profile page.
function buildLinkedInFromSnippet(hit: SearchHit): DiscoveredMentor | null {
  if (!/linkedin\.com\/in\//i.test(hit.url)) return null;
  const title = (hit.title || "").replace(/\s*[\|·]\s*LinkedIn.*$/i, "").trim();
  if (!title) return null;
  const parts = title.split(/\s+[-–—]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length < 2) return null;
  let role = "";
  let company = "";
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(" - ");
    const m = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (m) {
      role = m[1].trim();
      company = m[2].trim();
    } else if (parts.length >= 3) {
      role = parts[1].trim();
      company = parts.slice(2).join(" - ").trim();
    } else {
      role = rest.trim();
    }
  }
  // Try to glean company from description "… at Acme · …"
  if (!company && hit.description) {
    const m = hit.description.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,60})/);
    if (m) company = m[1].trim().replace(/[.,;:]+$/, "");
  }
  return {
    name,
    current_role: role,
    company,
    industry: "",
    skills: [],
    seniority_level: "Mid",
    years_experience: null,
    email: null,
    phone: null,
    pricing: null,
    platform: "LinkedIn",
    linkedin: cleanLinkedin(hit.url),
    booking_url: null,
    source_url: hit.url,
  };
}

// Build a minimal mentor from a Topmate / ADPList / Superpeer search snippet
// when a full scrape fails or times out. Keeps the result list non-empty
// instead of dropping the platform entirely.
function buildPlatformFromSnippet(hit: SearchHit, platform: Platform): DiscoveredMentor | null {
  const title = (hit.title || "")
    .replace(/\s*[\|·]\s*(Topmate|ADPList|Superpeer).*$/i, "")
    .trim();
  if (!title) return null;
  const parts = title.split(/\s+[-–—|·]\s+/);
  const name = (parts[0] || "").trim();
  if (!name || name.length < 2) return null;
  let role = "";
  let company = "";
  if (parts.length >= 2) {
    const rest = parts.slice(1).join(" - ");
    const m = rest.match(/^(.+?)\s+(?:at|@)\s+(.+)$/i);
    if (m) { role = m[1].trim(); company = m[2].trim(); }
    else { role = rest.trim(); }
  }
  if (!company && hit.description) {
    const m = hit.description.match(/\b(?:at|@)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,60})/);
    if (m) company = m[1].trim().replace(/[.,;:]+$/, "");
  }
  return {
    name,
    current_role: role,
    company,
    industry: "",
    skills: [],
    seniority_level: "Mid",
    years_experience: null,
    email: null,
    phone: null,
    pricing: null,
    platform,
    linkedin: null,
    booking_url: hit.url,
    source_url: hit.url,
  };
}

// deno-lint-ignore no-explicit-any
async function firecrawlScrape(url: string, apiKey: string): Promise<any | null> {
  const signal = AbortSignal.timeout(20000);
  try {
    const res = await fetch(`${FIRECRAWL}/scrape`, {
      method: "POST",
      signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        formats: [
          "markdown",
          {
            type: "json",
            prompt:
              "Extract the profile owner's professional info as it literally appears on the page. " +
              "Return null for any field NOT literally present. Do not guess. Do not infer email or phone " +
              "from the person's name. Do not invent companies, roles, prices, or experience.",
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                current_role: { type: "string" },
                company: { type: "string" },
                industry: { type: "string" },
                skills: { type: "array", items: { type: "string" } },
                seniority_level: { type: "string" },
                years_experience: { type: "number" },
                email: { type: "string" },
                phone: { type: "string" },
                pricing: {
                  type: "object",
                  properties: {
                    amount: { type: "number" },
                    currency: { type: "string" },
                    unit: { type: "string" },
                  },
                },
                linkedin: { type: "string" },
                booking_url: { type: "string" },
              },
            },
          },
        ],
      }),
    });
    if (!res.ok) {
      console.warn(`firecrawl scrape ${res.status} for ${url}`);
      return null;
    }
    const data = await res.json();
    return data?.data ?? data;
  } catch (e) {
    console.warn(`firecrawl scrape err: ${(e as Error).message}`);
    return null;
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = buildCorsHeaders(req)["Access-Control-Allow-Origin"];
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? null;
  if (!FIRECRAWL_API_KEY) {
    return new Response(
      JSON.stringify({ mentors: [], error: "Firecrawl is not connected. Link the Firecrawl connector in Connectors." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let body: Body = {};
  try { body = await req.json(); } catch { body = {}; }
  const role = (body.role || "").trim();
  const company = (body.company || "").trim();
  const industry = (body.industry || "").trim();
  const seniority = (body.seniority || "").trim();
  const jdText = typeof body.jdText === "string" ? body.jdText : "";
  const skills = Array.isArray(body.skills) ? body.skills.filter((s) => typeof s === "string") : [];
  const limit = Math.min(Math.max(body.limit || 12, 3), 20);
  const requestedPlatforms = Array.isArray(body.platforms)
    ? body.platforms.filter((p): p is Platform => ALL_PLATFORMS.includes(p as Platform))
    : ALL_PLATFORMS;
  const activePlatforms = requestedPlatforms.length ? requestedPlatforms : ALL_PLATFORMS;

  if (!role && skills.length === 0) {
    return new Response(JSON.stringify({ mentors: [], error: "role or skills required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const effectiveRole = role || skills[0] || "";
  const region = typeof body.region === "string" ? body.region.toLowerCase() : "global";
  const regionLabel = region !== "global" ? (REGION_LABEL[region] || "") : "";

  // 1. Query expansion
  const queries = await expandQueries(LOVABLE_API_KEY, effectiveRole, company, industry, skills, seniority, jdText);
  const platformDomain: Record<Platform, string> = {
    LinkedIn: "linkedin.com/in",
    Topmate: "topmate.io",
    ADPList: "adplist.org",
    Superpeer: "superpeer.com",
  };
  const regionSuffix = regionLabel ? ` "${regionLabel}"` : "";
  const contextTerms = [company, industry, ...skills.slice(0, 2)].filter(Boolean).join(" ");
  const guaranteedQueries = activePlatforms.flatMap((p) => {
    const domain = platformDomain[p];
    const platformSpecific = queries
      .filter((q) => q.toLowerCase().includes(domain))
      .map((q) => regionLabel && !q.toLowerCase().includes(regionLabel.toLowerCase()) ? `${q}${regionSuffix}` : q)
      .slice(0, 2);
    const fallback = `site:${domain} "${effectiveRole}" ${contextTerms || "mentor coach"}${regionSuffix}`;
    return Array.from(new Set([...platformSpecific, fallback]));
  });

  // 2. Search guaranteed per-platform queries. Group hits by platform.
  const byPlatform: Record<Platform, SearchHit[]> = { LinkedIn: [], Topmate: [], ADPList: [], Superpeer: [] };
  const seenUrls = new Set<string>();
  let searchResults = await Promise.all(
    guaranteedQueries.slice(0, 10).map((q) => firecrawlSearch(q, FIRECRAWL_API_KEY, 8)),
  );
  if (searchResults.flat().length === 0 && effectiveRole) {
    const broadQueries = activePlatforms.map((p) =>
      p === "LinkedIn" ? `site:linkedin.com/in ${effectiveRole} mentor coach ${company || industry || skills.slice(0, 2).join(" ")}`
        : p === "Topmate" ? `site:topmate.io ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
        : p === "ADPList" ? `site:adplist.org ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
        : `site:superpeer.com ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
    );
    searchResults = await Promise.all(broadQueries.map((q) => firecrawlSearch(q, FIRECRAWL_API_KEY, 8)));
  }
  for (const hits of searchResults) {
    for (const h of hits) {
      const p = platformFromUrl(h.url);
      if (!p) continue;
      if (!activePlatforms.includes(p)) continue;
      if (seenUrls.has(h.url)) continue;
      seenUrls.add(h.url);
      byPlatform[p].push(h);
    }
  }

  // 2a. LinkedIn → build mentors from snippets (no scrape; LinkedIn 403s Firecrawl).
  const mentors: DiscoveredMentor[] = [];
  for (const h of activePlatforms.includes("LinkedIn") ? byPlatform.LinkedIn.slice(0, 12) : []) {
    const m = buildLinkedInFromSnippet(h);
    if (!m) continue;
    const hay = `${h.title} ${h.description}`;
    const roleHit = effectiveRole
      ? (fuzzyContains(hay, effectiveRole) || tokensOf(effectiveRole).some((t) => hay.toLowerCase().includes(t)))
      : true;
    const companyHit = company ? fuzzyContains(hay, company) : false;
    const industryHit = industry ? fuzzyContains(hay, industry) : false;
    const skillHit = skills.some((s) => fuzzyContains(hay, s));
    if (!roleHit && !companyHit && !industryHit && !skillHit) continue;
    mentors.push(m);
  }

  // 2b. Round-robin Topmate/ADPList/Superpeer URLs for scraping (9 slots).
  const ordered: string[] = [];
  const urlHits = new Map<string, SearchHit>();
  const scrapePlatforms: Platform[] = ["Topmate", "ADPList", "Superpeer"].filter((p): p is Platform => activePlatforms.includes(p as Platform));
  let added = true;
  while (added && ordered.length < 9) {
    added = false;
    for (const p of scrapePlatforms) {
      const next = byPlatform[p].shift();
      if (next) { ordered.push(next.url); urlHits.set(next.url, next); added = true; if (ordered.length >= 9) break; }
    }
  }

  if (ordered.length === 0 && mentors.length === 0) {
    const counts = `LinkedIn snippets:${byPlatform.LinkedIn.length}, Topmate:${byPlatform.Topmate.length}, ADPList:${byPlatform.ADPList.length}, Superpeer:${byPlatform.Superpeer.length}`;
    return new Response(JSON.stringify({ mentors: [], error: `No web results matched the role/company/industry. (${counts})` }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 3. Scrape non-LinkedIn targets in parallel
  const targets = ordered;
  const scraped = await Promise.all(
    targets.map((u) => firecrawlScrape(u, FIRECRAWL_API_KEY).then((r) => ({ url: u, r }))),
  );

  // 4. Normalise + validate (Topmate / ADPList / Superpeer only here)
  for (const { url, r } of scraped) {
    const platform = platformFromUrl(url);
    if (!platform || platform === "LinkedIn") continue;
    if (!r) {
      // Scrape failed/timed out — fall back to the search snippet so the
      // platform still contributes a result.
      const hit = urlHits.get(url);
      if (hit) {
        const m = buildPlatformFromSnippet(hit, platform);
        if (m) mentors.push(m);
      }
      continue;
    }

    const rawJ = (r.json ?? r.extract ?? {}) as Record<string, unknown>;
    const md: string = typeof r.markdown === "string" ? r.markdown : "";
    const meta = (r.metadata ?? {}) as Record<string, unknown>;

    // Use Firecrawl's structured extraction directly for speed; sensitive fields
    // still pass verbatim guards below before they are returned.
    const j = rawJ;

    const titleStr = typeof meta.title === "string" ? meta.title : "";
    const name = String(j.name || titleStr || "").split(/[|\-—•·]/)[0].trim();
    if (!name || name.length < 2) {
      const hit = urlHits.get(url);
      if (hit) { const m = buildPlatformFromSnippet(hit, platform); if (m) mentors.push(m); }
      continue;
    }

    const currentRole = String(j.current_role || "").trim();
    const comp = String(j.company || "").trim();
    const ind = String(j.industry || "").trim();
    const skillsArr = Array.isArray(j.skills) ? (j.skills as unknown[]).map(String).slice(0, 12) : [];
    const seniorityLv = String(j.seniority_level || "").trim() || "Mid";

    // Relevance gate. LinkedIn pages are often sparse so accept them when the
    // mentor surfaced via a site:linkedin.com query (URL platform alone).
    const hay = `${currentRole} ${comp} ${ind} ${md.slice(0, 2000)}`;
    const roleHit = effectiveRole
      ? (fuzzyContains(hay, effectiveRole) || tokensOf(effectiveRole).some((t) => hay.toLowerCase().includes(t)))
      : true;
    const companyHit = company ? fuzzyContains(hay, company) : false;
    const industryHit = industry ? fuzzyContains(hay, industry) : false;
    const skillHit = skills.some((s) => fuzzyContains(hay, s));
    const linkedinPass = platform === "LinkedIn"; // trust query-targeted site:linkedin matches
    if (!roleHit && !companyHit && !industryHit && !skillHit && !linkedinPass) continue;


    const linkedin =
      platform === "LinkedIn" ? cleanLinkedin(url) : cleanLinkedin(typeof j.linkedin === "string" ? j.linkedin : null);
    const booking =
      platform !== "LinkedIn" ? url : (typeof j.booking_url === "string" ? j.booking_url : null);

    // Verbatim guards for sensitive fields.
    const email = sanitizeEmail(j.email, md);
    const phone = sanitizePhone(j.phone, md);
    const pricing = sanitizePricing(j.pricing, md);
    const years = sanitizeYears(j.years_experience, md);

    mentors.push({
      name,
      current_role: currentRole || titleStr,
      company: comp,
      industry: ind,
      skills: skillsArr,
      seniority_level: seniorityLv,
      years_experience: years,
      email,
      phone,
      pricing,
      platform,
      linkedin,
      booking_url: booking,
      source_url: url,
    });
  }

  // 5. Score: company > role > industry > platform
  const platformRank: Record<Platform, number> = { LinkedIn: 4, Topmate: 3, ADPList: 2, Superpeer: 1 };
  mentors.sort((a, b) => {
    const score = (m: DiscoveredMentor) =>
      (company && fuzzyContains(`${m.company} ${m.current_role}`, company) ? 100 : 0) +
      (effectiveRole && fuzzyContains(`${m.current_role}`, effectiveRole) ? 50 : 0) +
      (industry && fuzzyContains(`${m.industry} ${m.current_role}`, industry) ? 20 : 0) +
      platformRank[m.platform];
    return score(b) - score(a);
  });

  // Dedupe by linkedin || email || name+company
  const seen = new Set<string>();
  const deduped: DiscoveredMentor[] = [];
  for (const m of mentors) {
    const k = (m.linkedin || m.email || `${m.name}|${m.company}`).toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(m);
    if (deduped.length >= limit) break;
  }

  return new Response(JSON.stringify({ mentors: deduped }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
