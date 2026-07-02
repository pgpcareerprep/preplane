// External mentor discovery — fetchers + LinkedIn cache.
// Errors surface as MatchingError objects; never throw.

import type { ExternalDiscoveryConfig } from "./externalDiscoveryConfig";
import type { MatchingError } from "./mentorMatching";

export type FetchResult = {
  mentors: ExternalMentor[];
  errors: MatchingError[];
  reason?: "gemini_error" | "no_results";
  detail?: string | null;
};

export type ExternalPlatform = "Topmate" | "ADPList" | "LinkedIn" | "Superpeer";

export type ExternalPricing = { amount: number; currency: string; unit: string };

export type ExternalMentor = {
  mentor_id: string;
  source: "external";
  platform: ExternalPlatform;
  name: string;
  current_role: string;
  company: string;
  industry: string;
  skills: string[];
  seniority_level: string;
  company_prestige_score: 1 | 2 | 3 | 4 | 5;
  last_active_days: number;
  sessions_taken: number | null;
  rating: number | null;
  remuneration_inr?: number;
  /** Verbatim-verified contact + experience metadata from web discovery. */
  email?: string | null;
  phone?: string | null;
  years_experience?: number | null;
  pricing?: ExternalPricing | null;
  source_url?: string;
  /** Evidence-grounded relevance from external-mentor-search (optional). */
  confidence?: number;
  matched_fields?: string[];
  evidence?: string;
  external_links: {
    platform: string;
    booking: string | null;
    linkedin: string | null;
  };
};

export type JdLike = {
  role?: string;
  company?: string;
  industry?: string;
  required_skills?: string[];
  seniority_level?: string;
};

// ─── Query generation ──────────────────────────────────────────────────────

export function generateExternalQueries(jd: JdLike): string[] {
  const role = jd.role?.trim();
  const company = jd.company?.trim();
  const industry = jd.industry?.trim();

  const candidates = [
    role && company ? `${role} ${company} mentor` : null,
    role && industry ? `${role} ${industry} mentor` : null,
    role && company ? `ex-${company} ${role}` : null,
    role ? `${role} interview prep coach` : null,
    role ? `${role} mentor Topmate` : null,
    role && industry ? `${role} ${industry} career coach` : null,
  ];

  const queries = candidates.filter((q): q is string => !!q && !q.includes("undefined"));
  return queries;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "ext_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function hashQuery(q: string): string {
  let h = 0;
  for (let i = 0; i < q.length; i++) h = (h * 31 + q.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

function getCache<T>(key: string, ttlMs: number): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { t, v } = JSON.parse(raw);
    if (typeof t !== "number" || Date.now() - t > ttlMs) return null;
    return v as T;
  } catch {
    return null;
  }
}

function setCache<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value }));
  } catch {
    /* ignore quota */
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TIER1 = ["google", "apple", "meta", "amazon", "microsoft", "netflix", "openai", "nvidia", "mckinsey", "bcg", "bain", "goldman", "jpmorgan", "stripe"];
const TIER2 = ["swiggy", "zomato", "flipkart", "razorpay", "paytm", "uber", "atlassian", "adobe", "salesforce", "oracle", "linkedin", "airbnb", "spotify", "shopify", "datadog", "vercel", "cred", "phonepe", "freshworks"];

function inferPrestige(company: string): 1 | 2 | 3 | 4 | 5 {
  const c = (company || "").toLowerCase();
  if (!c) return 1;
  if (TIER1.some((t) => c.includes(t))) return 5;
  if (TIER2.some((t) => c.includes(t))) return 4;
  if (/labs|ai|tech|studio|ventures/.test(c)) return 2;
  return 3;
}

function inferSeniority(role: string): string {
  const r = (role || "").toLowerCase();
  if (/(ceo|cto|cfo|coo|chief)/.test(r)) return "C-Suite";
  if (/(vp|vice president)/.test(r)) return "VP";
  if (/director/.test(r)) return "Director";
  if (/(lead|senior|sr\.|principal|staff)/.test(r)) return "Senior";
  if (/(junior|jr\.|associate|intern)/.test(r)) return "Junior";
  return "Mid";
}

function inferSkillsFromRole(role: string): string[] {
  const r = (role || "").toLowerCase();
  const out: string[] = [];
  if (/product/.test(r)) out.push("Product Strategy", "Roadmapping");
  if (/growth/.test(r)) out.push("Growth", "Analytics");
  if (/design/.test(r)) out.push("Design", "UX");
  if (/engineer|developer|sde|swe/.test(r)) out.push("Engineering", "System Design");
  if (/data|analyt/.test(r)) out.push("Analytics", "SQL");
  if (/market/.test(r)) out.push("Marketing", "Brand");
  if (/sales|account/.test(r)) out.push("Sales", "Negotiation");
  return out;
}

// ─── Per-platform fetchers ─────────────────────────────────────────────────

async function fetchPlatform(
  platform: ExternalPlatform,
  endpoint: string,
  queries: string[],
  ttlHours: number,
  delayMs: number,
): Promise<FetchResult> {
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const collected: ExternalMentor[] = [];
  const errors: MatchingError[] = [];

  for (const q of queries) {
    const cacheKey = `${platform.toLowerCase()}_cache_${hashQuery(q)}`;
    const cached = getCache<ExternalMentor[]>(cacheKey, ttlMs);
    if (cached) {
      collected.push(...cached);
      continue;
    }
    try {
      const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (res.status === 429) {
        await sleep(delayMs * 2);
        errors.push({ source: "EXT", message: `${platform}: rate-limited (429) for "${q}"`, recoverable: true });
        continue;
      }
      if (!res.ok) {
        errors.push({ source: "EXT", message: `${platform}: HTTP ${res.status} for "${q}"`, recoverable: true });
        continue;
      }
      let data: unknown;
      try {
        data = await res.json();
      } catch (parseErr) {
        const m = parseErr instanceof Error ? parseErr.message : String(parseErr);
        errors.push({ source: "EXT", message: `${platform}: invalid JSON (${m})`, recoverable: false });
        continue;
      }
      if (Array.isArray(data)) {
        for (const r of data) {
          collected.push(toExternalMentor(platform, r as Record<string, unknown>));
        }
      }
      setCache(cacheKey, collected);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      errors.push({ source: "EXT", message: `${platform}: ${m}`, recoverable: true });
    }
    await sleep(delayMs);
  }
  return { mentors: collected, errors };
}

function toExternalMentor(platform: ExternalPlatform, r: Record<string, unknown>): ExternalMentor {
  const name = String(r.name || r.full_name || "Unknown");
  const role = String(r.role || r.title || r.headline || "");
  const company = String(r.company || r.current_company || "");
  const industry = String(r.industry || r.domain || "");
  const skillsRaw = r.skills || r.tags || r.topics || r.categories || [];
  const skills = Array.isArray(skillsRaw) ? skillsRaw.map(String) : [];
  return {
    mentor_id: uuid(),
    source: "external",
    platform,
    name,
    current_role: role,
    company,
    industry,
    skills: skills.length ? skills : inferSkillsFromRole(role),
    seniority_level: inferSeniority(role),
    company_prestige_score: inferPrestige(company),
    last_active_days: typeof r.last_active_days === "number" ? r.last_active_days : 30,
    sessions_taken: typeof r.session_count === "number" ? r.session_count : null,
    rating: typeof r.rating === "number" ? r.rating : null,
    remuneration_inr: typeof r.price_inr === "number" ? r.price_inr : undefined,
    external_links: {
      platform,
      booking: typeof r.booking_url === "string" ? r.booking_url : null,
      linkedin: typeof r.linkedin === "string" ? r.linkedin : null,
    },
  };
}

// ─── Live external discovery (Firecrawl-backed edge function) ────────────

import { supabase } from "@/integrations/supabase/client";
import { linkedinHref } from "@/lib/linkedinUrl";
import { geminiApiBlockedMessage, isGeminiApiBlocked, isGeminiKeyError, geminiKeyRejectedMessage } from "@/lib/extErrorMessage";

export type GeminiProbeDiag = { ok: boolean; status: number; body: string; blocked: boolean };

export type ExternalMentorDiag = {
  diag: true;
  keyPresent: boolean;
  keySource: string | null;
  keyLast4: string | null;
  keyLength: number;
  geminiPing: { ok: boolean; status: number; body: string };
  geminiGeneratePing?: GeminiProbeDiag | null;
  geminiGroundingPing?: GeminiProbeDiag | null;
  geminiOpenAiCompatPing?: GeminiProbeDiag | null;
  jinaKeyPresent: boolean;
  jinaKeySource: string | null;
  jinaKeyLast4: string | null;
  jinaKeyLength: number;
  jinaPing: { ok: boolean; status: number; body: string };
  searxngUrlPresent: boolean;
};

/** Live config check — what the deployed edge function sees for Gemini/Jina. */
export async function fetchExternalMentorDiag(): Promise<ExternalMentorDiag> {
  const { data, error } = await supabase.functions.invoke("external-mentor-search", {
    body: { diag: true },
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object" || !(data as ExternalMentorDiag).diag) {
    throw new Error("Unexpected diagnostic response from external-mentor-search");
  }
  return data as ExternalMentorDiag;
}

export function formatExternalMentorDiagSummary(d: ExternalMentorDiag): string {
  const lines = [
    `Gemini key: ${d.keyPresent ? `present (${d.keySource}, …${d.keyLast4}, len ${d.keyLength})` : "missing"}`,
    `  models list: ${d.geminiPing.ok ? "OK" : `HTTP ${d.geminiPing.status}`}`,
  ];
  if (d.geminiGeneratePing) {
    lines.push(`  generateContent: ${d.geminiGeneratePing.ok ? "OK" : `HTTP ${d.geminiGeneratePing.status}${d.geminiGeneratePing.blocked ? " — BLOCKED" : ""}`}`);
  }
  if (d.geminiGroundingPing) {
    lines.push(`  google_search grounding: ${d.geminiGroundingPing.ok ? "OK" : `HTTP ${d.geminiGroundingPing.status}${d.geminiGroundingPing.blocked ? " — BLOCKED" : ""}`}`);
  }
  if (d.geminiOpenAiCompatPing) {
    lines.push(`  OpenAI-compat: ${d.geminiOpenAiCompatPing.ok ? "OK" : `HTTP ${d.geminiOpenAiCompatPing.status}${d.geminiOpenAiCompatPing.blocked ? " — BLOCKED" : ""}`}`);
  }
  lines.push(
    `Jina: ${d.jinaKeyPresent ? `present (${d.jinaKeySource}, …${d.jinaKeyLast4})` : "missing"} — ping ${d.jinaPing.ok ? "OK" : `HTTP ${d.jinaPing.status}`}`,
    `SearXNG URL: ${d.searxngUrlPresent ? "configured" : "not set"}`,
  );
  const blocked =
    d.geminiGeneratePing?.blocked ||
    d.geminiGroundingPing?.blocked ||
    d.geminiOpenAiCompatPing?.blocked ||
    isGeminiApiBlocked(d.geminiPing.body) ||
    isGeminiApiBlocked(d.geminiGeneratePing?.body) ||
    isGeminiApiBlocked(d.geminiGroundingPing?.body);
  if (blocked) {
    lines.push("→ Key is set but Google blocks API calls. Fix key restrictions in Google Cloud Console (see toast/help).");
  } else if (d.keyPresent && !d.geminiGeneratePing?.ok) {
    lines.push(`→ generateContent failed: ${(d.geminiGeneratePing?.body || d.geminiPing.body).slice(0, 100)}`);
  }
  if (!d.jinaKeyPresent) {
    lines.push("→ JINA_API_KEY missing — web search layer may return zero hits.");
  } else if (!d.jinaPing.ok) {
    lines.push(`→ Jina failed: ${d.jinaPing.body.slice(0, 100)}`);
  }
  return lines.join("\n");
}

type AIDiscoveredMentor = {
  name: string;
  current_role: string;
  company: string;
  industry: string;
  skills: string[];
  seniority_level: string;
  platform: ExternalPlatform;
  linkedin: string | null;
  booking_url: string | null;
  email?: string | null;
  phone?: string | null;
  years_experience?: number | null;
  pricing?: ExternalPricing | null;
  source_url?: string;
  confidence?: number;
  matched_fields?: string[];
  evidence?: string;
};

type AISearchInput = {
  role?: string;
  company?: string;
  industry?: string;
  skills?: string[];
  seniority?: string;
  jdText?: string;
  limit?: number;
};

const ALL_LIVE_PLATFORMS: ExternalPlatform[] = ["LinkedIn", "Topmate", "ADPList", "Superpeer"];

let aiSearchInput: AISearchInput | null = null;

/** Set context for the next AI external-discovery call. */
export function setExternalSearchContext(input: AISearchInput) {
  aiSearchInput = input;
}

function purgeStaleEmptyExternalCaches() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key?.startsWith("ai_ext_cache_")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { v?: unknown[] };
      if (Array.isArray(parsed?.v) && parsed.v.length === 0) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* ignore */
  }
}

async function aiDiscover(platform: ExternalPlatform, ttlHours: number, platforms?: ExternalPlatform[], region?: string): Promise<FetchResult> {
  purgeStaleEmptyExternalCaches();
  const ttlMs = ttlHours * 60 * 60 * 1000;
  const ctx = aiSearchInput || {};
  const activePlatforms = platforms?.length ? platforms : [platform];
  const cacheKey = `ai_ext_cache_${hashQuery(JSON.stringify({ ...ctx, platforms: activePlatforms, region }))}`;
  const cached = getCache<ExternalMentor[]>(cacheKey, ttlMs);
  if (cached && cached.length > 0) {
    return { mentors: cached, errors: [] };
  }

  try {
    const { data, error } = await supabase.functions.invoke("external-mentor-search", {
      body: { ...ctx, jdText: (ctx.jdText || "").slice(0, 4000), limit: 12, platforms: activePlatforms, region },
    });

    if (error) {
      return { mentors: [], errors: [{ source: "EXT", message: `${platform}: ${error.message}`, recoverable: false }] };
    }
    const dataError = typeof (data as { error?: unknown })?.error === "string" ? (data as { error: string }).error : null;
    const dataDetail = typeof (data as { detail?: unknown })?.detail === "string" ? (data as { detail: string }).detail : null;
    const dataReasonRaw = typeof (data as { reason?: unknown })?.reason === "string" ? (data as { reason: string }).reason : null;
    const apiReason =
      dataReasonRaw === "gemini_error" || dataReasonRaw === "no_results" ? dataReasonRaw : undefined;
    if (dataDetail) {
      console.warn("[external] mentor-search detail:", dataDetail);
    }
    if (dataError) {
      // Translate known Gemini/provider API error codes to actionable messages.
      let friendlyErr = dataError;
      if (apiReason === "gemini_error" && dataDetail) {
        friendlyErr = isGeminiApiBlocked(dataDetail)
          ? geminiApiBlockedMessage(dataDetail)
          : isGeminiKeyError(dataDetail)
            ? geminiKeyRejectedMessage(dataDetail)
            : `External search failed: ${dataDetail}`;
      } else if (dataError === "no_free_provider_result" || dataError.includes("no free provider")) {
        friendlyErr = "External AI search quota exceeded or unavailable. Verify GEMINI_API_KEY in Supabase Edge Function secrets.";
      } else if (dataError.includes("GEMINI_API_KEY") || dataError.includes("Neither is configured")) {
        friendlyErr = "External mentor search is not configured. Set GEMINI_API_KEY (or FIRECRAWL_API_KEY) in Supabase Edge Function secrets.";
      } else if (dataError.includes("Gemini search returned no results")) {
        friendlyErr = "Gemini search returned no results for this role. Try broadening the role or adding more context.";
      }
      const recoverable = dataError === "no_free_provider_result" || dataError.startsWith("No web results") || dataError.includes("no results");
      return {
        mentors: [],
        errors: [{ source: "EXT", message: friendlyErr, recoverable }],
        reason: apiReason,
        detail: dataDetail,
      };
    }
    const list: AIDiscoveredMentor[] = Array.isArray(data?.mentors) ? data.mentors : [];
    if (list.length === 0) {
      const detail = dataDetail || "External discovery returned no mentors for this role.";
      return {
        mentors: [],
        errors: [{ source: "EXT", message: detail, recoverable: true }],
        reason: apiReason,
        detail: dataDetail,
      };
    }
    const mentors: ExternalMentor[] = list.map((m) => ({
      mentor_id: uuid(),
      source: "external",
      platform: (m.platform || platform) as ExternalPlatform,
      name: m.name,
      current_role: m.current_role || "",
      company: m.company || "",
      industry: m.industry || "",
      skills: Array.isArray(m.skills) ? m.skills : [],
      seniority_level: m.seniority_level || inferSeniority(m.current_role || ""),
      company_prestige_score: inferPrestige(m.company || ""),
      last_active_days: 30,
      sessions_taken: null,
      rating: null,
      email: m.email ?? null,
      phone: m.phone ?? null,
      years_experience: typeof m.years_experience === "number" ? m.years_experience : null,
      pricing: m.pricing ?? null,
      // Carry pricing through legacy field too so existing UI rows still render.
      remuneration_inr:
        m.pricing && (m.pricing.currency || "INR").toUpperCase() === "INR" ? m.pricing.amount : undefined,
      source_url: m.source_url,
      confidence: typeof m.confidence === "number" ? m.confidence : undefined,
      matched_fields: Array.isArray(m.matched_fields) ? m.matched_fields : undefined,
      evidence: typeof m.evidence === "string" ? m.evidence : undefined,
      external_links: {
        platform: ((m.platform || platform) as string).toLowerCase(),
        booking: m.booking_url || null,
        linkedin: m.linkedin ? linkedinHref(m.linkedin) : null,
      },
    }));
    // Never cache empty results — a failed run should not block retries for hours.
    if (mentors.length > 0) setCache(cacheKey, mentors);
    return { mentors, errors: [] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { mentors: [], errors: [{ source: "EXT", message: `${platform}: ${msg}`, recoverable: false }] };
  }
}

export async function fetchTopmate(_queries: string[], config: ExternalDiscoveryConfig): Promise<FetchResult> {
  return aiDiscover("Topmate", config.ttl.topmate);
}

export async function fetchADPList(_queries: string[], config: ExternalDiscoveryConfig): Promise<FetchResult> {
  return aiDiscover("ADPList", config.ttl.adplist);
}

export async function fetchSuperpeer(_queries: string[], _config: ExternalDiscoveryConfig): Promise<FetchResult> {
  return aiDiscover("Superpeer", 6);
}

export async function fetchExternalMentors(_queries: string[], config: ExternalDiscoveryConfig): Promise<FetchResult> {
  const configuredPlatforms: ExternalPlatform[] = [
    config.linkedin ? "LinkedIn" : null,
    config.topmate ? "Topmate" : null,
    config.adplist ? "ADPList" : null,
    config.superpeer ? "Superpeer" : null,
  ].filter((p): p is ExternalPlatform => !!p);
  const activePlatforms = Array.from(new Set([...configuredPlatforms, ...ALL_LIVE_PLATFORMS]));
  const ttlHours = Math.min(
    ...activePlatforms.map((p) => p === "LinkedIn" ? config.ttl.linkedin : p === "ADPList" ? config.ttl.adplist : config.ttl.topmate),
  );
  return aiDiscover("LinkedIn", ttlHours || 6, activePlatforms, config.region);
}

// ─── LinkedIn cache (admin-uploaded dataset) ───────────────────────────────

const LI_KEY = "linkedin_cached_dataset";
const LI_META = "linkedin_cache_meta";

export type LinkedinCacheMeta = { uploadedAt: number; count: number };

export function getLinkedinCacheMeta(): LinkedinCacheMeta | null {
  try {
    const raw = localStorage.getItem(LI_META);
    return raw ? (JSON.parse(raw) as LinkedinCacheMeta) : null;
  } catch {
    return null;
  }
}

export function clearLinkedinCache() {
  try {
    localStorage.removeItem(LI_KEY);
    localStorage.removeItem(LI_META);
  } catch {
    /* ignore */
  }
}

export function saveLinkedinCache(records: Array<Record<string, unknown>>): number {
  const normalised: ExternalMentor[] = records.map((r) => toExternalMentor("LinkedIn", r));
  try {
    localStorage.setItem(LI_KEY, JSON.stringify(normalised));
    const meta: LinkedinCacheMeta = { uploadedAt: Date.now(), count: normalised.length };
    localStorage.setItem(LI_META, JSON.stringify(meta));
  } catch {
    /* ignore quota */
  }
  return normalised.length;
}

function loadLinkedinCache(ttlHours: number): ExternalMentor[] {
  try {
    const meta = getLinkedinCacheMeta();
    if (!meta) return [];
    if (Date.now() - meta.uploadedAt > ttlHours * 60 * 60 * 1000) {
       
      console.warn("[external] LinkedIn cache expired");
      return [];
    }
    const raw = localStorage.getItem(LI_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ExternalMentor[];
  } catch {
    return [];
  }
}

export async function fetchLinkedIn(queries: string[], config: ExternalDiscoveryConfig): Promise<FetchResult> {
  const cache = loadLinkedinCache(config.ttl.linkedin);
  if (cache.length === 0) {
    // Fallback to AI-backed live discovery when no admin-uploaded dataset exists
    return aiDiscover("LinkedIn", config.ttl.linkedin, undefined, config.region);
  }
  if (queries.length === 0) return { mentors: cache.slice(0, 50), errors: [] };

  const terms = queries.flatMap((q) => q.toLowerCase().split(/\s+/)).filter((t) => t.length > 2);
  const mentors = cache.filter((m) => {
    const hay = `${m.name} ${m.current_role} ${m.company} ${m.industry}`.toLowerCase();
    return terms.some((t) => hay.includes(t));
  });
  return { mentors, errors: [] };
}
