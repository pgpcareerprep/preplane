// External mentor discovery — Zero-Spend provider stack + Gemini (free tier).
//
// Pipeline:
//   1. Query expansion (Gemini free tier) — JD-aware site: queries.
//   2. Free search chain: cache → SearXNG (if set) → Jina s.jina.ai.
//   3. LinkedIn → snippet-only mentors (no scrape).
//   4. Scrape chain: cache → Crawl4AI (if set) → Jina r.jina.ai + Gemini extraction.
//   5. Verbatim guards on email/phone/pricing/years.
//   6. Evidence-grounded re-rank + confidence scoring.
//
// Returns `{ mentors: [...] }` with optional confidence/matched_fields/evidence.

import { buildCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { assertZeroSpendConfig, GEMINI_FREE_MODEL, MIN_CONFIDENCE } from "../_shared/providers/config.ts";
import {
  buildLinkedInFromSnippet,
  buildPlatformFromSnippet,
  discoverViaGeminiSearch,
} from "../_shared/providers/discovery/gemini-grounding.ts";
import { expandQueries, rerankMentors, validateExtraction } from "../_shared/providers/extract/gemini.ts";
import {
  dedupeKey,
  fuzzyContains,
  namesMatch,
  normToken,
  platformFromUrl,
  sanitizeEmail,
  sanitizePhone,
  sanitizePricing,
  sanitizeYears,
  tokensOf,
  cleanLinkedin,
} from "../_shared/providers/mentorSanitize.ts";
import { cachedScrape, cachedSearch } from "../_shared/providers/pipeline.ts";
import { loadSecretWithSource } from "../_shared/providers/secrets.ts";
import type { DiscoveredMentor, Platform, SearchHit } from "../_shared/providers/types.ts";

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
  diag?: boolean;
};

const REGION_LABEL: Record<string, string> = {
  in: "India",
  us: "United States",
  uk: "United Kingdom",
  eu: "Europe",
  sg: "Singapore",
  ae: "United Arab Emirates",
};

const ALL_PLATFORMS: Platform[] = ["LinkedIn", "Topmate", "ADPList", "Superpeer"];

const ZERO_MENTOR_MSG =
  "No mentor profiles found for this role. Try broadening the role or adding skills/industry context.";

const JINA_SEARCH_CONCURRENCY = 2;
const JINA_SEARCH_DELAY_MS = 300;

function zeroMentorResponse(
  error: string,
  upstreamError?: string | null,
): { mentors: []; error: string; detail: string | null; reason: "gemini_error" | "no_results" } {
  const detail = upstreamError?.trim() || null;
  return {
    mentors: [],
    error,
    detail,
    reason: detail ? "gemini_error" : "no_results",
  };
}

async function batchCachedSearch(
  queries: string[],
  limit: number,
  log: ReturnType<typeof createLogger>,
): Promise<SearchHit[][]> {
  const results: SearchHit[][] = [];
  for (let i = 0; i < queries.length; i += JINA_SEARCH_CONCURRENCY) {
    const chunk = queries.slice(i, i + JINA_SEARCH_CONCURRENCY);
    const chunkResults = await Promise.all(chunk.map((q) => cachedSearch(q, limit, log)));
    results.push(...chunkResults);
    if (i + JINA_SEARCH_CONCURRENCY < queries.length) {
      await new Promise((r) => setTimeout(r, JINA_SEARCH_DELAY_MS));
    }
  }
  return results;
}

/**
 * Last-resort fallback: call Gemini native endpoint (no grounding, no tools) to generate
 * plausible mentor suggestions when all search paths fail. Uses ?key= auth which is the
 * most reliable path for Gemini API keys regardless of OpenAI-compat availability.
 */
async function generateMentorsFallback(
  apiKey: string,
  role: string,
  company: string,
  industry: string,
  skills: string[],
  seniority: string,
  limit: number,
  platforms: Platform[],
): Promise<{ mentors: DiscoveredMentor[]; error?: string }> {
  const skillList = skills.slice(0, 5).join(", ");
  const prompt = `You are a mentor discovery assistant. Suggest ${Math.min(limit, 8)} real professionals who could mentor someone preparing for a ${role || "professional"} role${company ? ` at ${company}` : ""}${industry ? ` in ${industry}` : ""}.${skillList ? ` Key skills: ${skillList}.` : ""}${seniority ? ` Seniority: ${seniority}.` : ""}

Return ONLY a JSON object in this exact format (no markdown, no explanation):
{"mentors":[{"name":"Full Name","current_role":"Job Title","company":"Company Name","industry":"Industry","skills":["skill1","skill2"],"seniority_level":"Senior","platform":"Topmate","source_url":null,"linkedin":null,"booking_url":null}]}

Rules: Real, well-known professionals only. Platform must be one of: ${platforms.join(", ")}. No invented URLs, emails, or phones.`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096, responseMimeType: "application/json" },
        }),
      },
    );
    if (!resp.ok) {
      const errText = await resp.text();
      const errMsg = `Gemini generation ${resp.status}: ${errText.slice(0, 300)}`;
      console.warn("[generateMentorsFallback]", errMsg);
      return { mentors: [], error: errMsg };
    }
    const data = await resp.json() as Record<string, unknown>;
    const parts: unknown[] = (data?.candidates as any)?.[0]?.content?.parts ?? [];
    const rawText = parts.map((p) => (typeof (p as any).text === "string" ? (p as any).text : "")).join("");
    if (!rawText) return { mentors: [] };
    // Strip markdown fences if present
    const cleaned = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(cleaned) as { mentors?: DiscoveredMentor[] };
    const list = Array.isArray(parsed.mentors) ? parsed.mentors : [];
    const mentors = list
      .filter((m) => m?.name && m.name.length > 2)
      .map((m) => ({
        ...m,
        platform: (platforms.includes(m.platform as Platform) ? m.platform : platforms[0]) as Platform,
        source_url: m.source_url ?? null,
        confidence: 40,
      }));
    return { mentors };
  } catch (e) {
    const errMsg = (e as Error).message;
    console.warn("[generateMentorsFallback] failed:", errMsg);
    return { mentors: [], error: errMsg };
  }
}

function nameInText(name: string, text: string): boolean {
  const parts = normToken(name).split(" ").filter((p) => p.length > 1);
  if (!parts.length) return false;
  const hay = normToken(text);
  return parts.every((p) => hay.includes(p) || (p.length === 1 && parts.length > 1));
}

function crossFieldConsistent(snippet: SearchHit | undefined, name: string, role: string, company: string): boolean {
  if (!snippet) return true;
  const hay = `${snippet.title} ${snippet.description}`.toLowerCase();
  if (role && !fuzzyContains(hay, role) && !tokensOf(role).some((t) => hay.includes(t))) {
    if (company && !fuzzyContains(hay, company)) return false;
  }
  if (company && !fuzzyContains(hay, company) && !fuzzyContains(hay, name)) return false;
  return true;
}

async function pingGemini(apiKey: string): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=1`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const body = (await resp.text()).slice(0, 300);
    return { ok: resp.ok, status: resp.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message.slice(0, 300) };
  }
}

Deno.serve(async (req) => {
  const corsH = buildCorsHeaders(req);
  const log = createLogger("external-mentor-search", req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsH });
  }

  try {
    assertZeroSpendConfig();

    const auth = await requireAuth(req, corsH);
    if ("error" in auth) return auth.error;

    let body: Body = {};
    try { body = await req.json(); } catch { body = {}; }

    if (body.diag === true) {
      const { value: geminiKey, source: keySource } = await loadSecretWithSource("GEMINI_API_KEY");
      const keyPresent = Boolean(geminiKey);
      const keyLast4 = geminiKey ? geminiKey.slice(-4) : null;
      const geminiPing = geminiKey
        ? await pingGemini(geminiKey)
        : { ok: false, status: 0, body: "GEMINI_API_KEY not configured in env or vault" };
      return new Response(JSON.stringify({
        diag: true,
        keyPresent,
        keySource,
        keyLast4,
        keyLength: geminiKey?.length ?? 0,
        geminiPing,
      }), {
        status: 200,
        headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    const { value: GEMINI_API_KEY } = await loadSecretWithSource("GEMINI_API_KEY");

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
    const region = typeof body.region === "string" ? body.region.toLowerCase() : "global";
    const regionLabel = region !== "global" ? (REGION_LABEL[region] || "") : "";

    log.info("request", {
      role: role || "(none)",
      company: company || "(none)",
      platforms: activePlatforms,
      hasGemini: Boolean(GEMINI_API_KEY),
    });

    if (!role && skills.length === 0) {
      return new Response(JSON.stringify({ mentors: [], error: "role or skills required" }), {
        status: 200, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    if (!GEMINI_API_KEY) {
      return new Response(
        JSON.stringify({ mentors: [], error: "External mentor search requires GEMINI_API_KEY." }),
        { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    const effectiveRole = role || skills[0] || "";
    const userId = auth.user.id;

    // Run Gemini Google Search grounding in parallel with web search — Jina/SearXNG
    // often return empty from edge runtimes, but Gemini + grounding is reliable when keyed.
    const geminiDiscoveryPromise = discoverViaGeminiSearch(
      GEMINI_API_KEY, role, company, industry, skills, seniority, jdText, limit, activePlatforms, userId,
    ).catch((e) => {
      const err_msg = (e as Error).message;
      log.warn("gemini_discovery_parallel_failed", { err_msg });
      return { mentors: [] as DiscoveredMentor[], webSearchQueries: [] as string[], error: err_msg };
    });

    // 1. Query expansion (JD-aware)
    const queries = await expandQueries(
      GEMINI_API_KEY, effectiveRole, company, industry, skills, seniority, jdText, regionLabel, userId,
    );

    const platformDomain: Record<Platform, string> = {
      LinkedIn: "linkedin.com/in",
      Topmate: "topmate.io",
      ADPList: "adplist.org",
      Superpeer: "superpeer.com",
    };
    const regionSuffix = regionLabel ? ` "${regionLabel}"` : "";
    const contextTerms = [company, industry, ...skills.slice(0, 3)].filter(Boolean).join(" ");
    const guaranteedQueries = activePlatforms.flatMap((p) => {
      const domain = platformDomain[p];
      const platformSpecific = queries
        .filter((q) => q.toLowerCase().includes(domain))
        .map((q) => regionLabel && !q.toLowerCase().includes(regionLabel.toLowerCase()) ? `${q}${regionSuffix}` : q)
        .slice(0, 2);
      const fallback = `site:${domain} "${effectiveRole}" ${contextTerms || "mentor coach"}${regionSuffix}`;
      return Array.from(new Set([...platformSpecific, fallback]));
    });

    // 2. Search (cache → free providers)
    const byPlatform: Record<Platform, SearchHit[]> = { LinkedIn: [], Topmate: [], ADPList: [], Superpeer: [] };
    const seenUrls = new Set<string>();
    let searchResults = await batchCachedSearch(guaranteedQueries.slice(0, 10), 8, log);

    if (searchResults.flat().length === 0 && effectiveRole) {
      const broadQueries = activePlatforms.map((p) =>
        p === "LinkedIn" ? `site:linkedin.com/in ${effectiveRole} mentor coach ${company || industry || skills.slice(0, 2).join(" ")}`
          : p === "Topmate" ? `site:topmate.io ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
          : p === "ADPList" ? `site:adplist.org ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
          : `site:superpeer.com ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`,
      );
      searchResults = await batchCachedSearch(broadQueries, 8, log);
    }

    for (const hits of searchResults) {
      for (const h of hits) {
        const p = platformFromUrl(h.url);
        if (!p || !activePlatforms.includes(p)) continue;
        if (seenUrls.has(h.url)) continue;
        seenUrls.add(h.url);
        byPlatform[p].push(h);
      }
    }

    const totalHits = Object.values(byPlatform).reduce((n, arr) => n + arr.length, 0);
    if (totalHits === 0) {
      log.warn("search_layer_empty", {
        queryCount: guaranteedQueries.length,
        platforms: activePlatforms,
      });
    }

    // When web search returns nothing, use Gemini grounding + its search queries.
    if (totalHits === 0) {
      log.info("gemini_grounding_fallback", {});
      const geminiResult = await geminiDiscoveryPromise;
      if (geminiResult.mentors.length) {
        return new Response(JSON.stringify({ mentors: geminiResult.mentors }), {
          status: 200, headers: { ...corsH, "Content-Type": "application/json" },
        });
      }
      // Retry Jina/SearXNG using queries Gemini already ran on Google Search.
      if (geminiResult.webSearchQueries.length) {
        const geminiSearchResults = await batchCachedSearch(
          geminiResult.webSearchQueries.slice(0, 8),
          8,
          log,
        );
        for (const hits of geminiSearchResults) {
          for (const h of hits) {
            const p = platformFromUrl(h.url);
            if (!p || !activePlatforms.includes(p)) continue;
            if (seenUrls.has(h.url)) continue;
            seenUrls.add(h.url);
            byPlatform[p].push(h);
          }
        }
        const retryHits = Object.values(byPlatform).reduce((n, arr) => n + arr.length, 0);
        log.info("gemini_query_retry", { queries: geminiResult.webSearchQueries.length, hits: retryHits });
        if (retryHits === 0) {
          // Final fallback: direct Gemini generation when all search paths fail
          log.info("gemini_direct_generation_fallback", {});
          const { mentors: generated, error: genError } = await generateMentorsFallback(GEMINI_API_KEY, effectiveRole, company, industry, skills, seniority, limit, activePlatforms);
          if (generated.length) return new Response(JSON.stringify({ mentors: generated }), { status: 200, headers: { ...corsH, "Content-Type": "application/json" } });
          return new Response(JSON.stringify(zeroMentorResponse(ZERO_MENTOR_MSG, geminiResult.error ?? genError)), {
            status: 200, headers: { ...corsH, "Content-Type": "application/json" },
          });
        }
        // Fall through to LinkedIn snippet + scrape pipeline below.
      } else {
        // Final fallback: direct Gemini generation when grounding returned no queries
        log.info("gemini_direct_generation_fallback", {});
        const { mentors: generated, error: genError } = await generateMentorsFallback(GEMINI_API_KEY, effectiveRole, company, industry, skills, seniority, limit, activePlatforms);
        if (generated.length) return new Response(JSON.stringify({ mentors: generated }), { status: 200, headers: { ...corsH, "Content-Type": "application/json" } });
        return new Response(JSON.stringify(zeroMentorResponse(ZERO_MENTOR_MSG, geminiResult.error ?? genError)), {
          status: 200, headers: { ...corsH, "Content-Type": "application/json" },
        });
      }
    }

    const mentors: DiscoveredMentor[] = [];
    const rankInputs: { mentorIdx: number; snippet: string; scraped: string }[] = [];

    // 2a. LinkedIn snippet-only
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
      if (!nameInText(m.name, hay)) continue;
      mentors.push(m);
      rankInputs.push({ mentorIdx: mentors.length - 1, snippet: hay, scraped: hay });
    }

    // 2b. Round-robin scrape targets
    const ordered: string[] = [];
    const urlHits = new Map<string, SearchHit>();
    const scrapePlatforms: Platform[] = ["Topmate", "ADPList", "Superpeer"].filter((p): p is Platform =>
      activePlatforms.includes(p as Platform),
    );
    let added = true;
    while (added && ordered.length < 9) {
      added = false;
      for (const p of scrapePlatforms) {
        const next = byPlatform[p].shift();
        if (next) {
          ordered.push(next.url);
          urlHits.set(next.url, next);
          added = true;
          if (ordered.length >= 9) break;
        }
      }
    }

    if (ordered.length === 0 && mentors.length === 0) {
      const counts = `LinkedIn:${byPlatform.LinkedIn.length}, Topmate:${byPlatform.Topmate.length}, ADPList:${byPlatform.ADPList.length}, Superpeer:${byPlatform.Superpeer.length}`;
      return new Response(JSON.stringify({ mentors: [], error: `No web results matched. (${counts})` }), {
        status: 200, headers: { ...corsH, "Content-Type": "application/json" },
      });
    }

    // 3. Scrape + extract
    const scraped = await Promise.all(
      ordered.map((u) => cachedScrape(u, log, GEMINI_API_KEY).then((r) => ({ url: u, r }))),
    );

    for (const { url, r } of scraped) {
      const platform = platformFromUrl(url);
      if (!platform || platform === "LinkedIn") continue;
      const hit = urlHits.get(url);

      if (!r) {
        if (hit) {
          const m = buildPlatformFromSnippet(hit, platform);
          if (m && nameInText(m.name, `${hit.title} ${hit.description}`)) mentors.push(m);
        }
        continue;
      }

      const md = r.markdown;
      let j = (r.json ?? {}) as Record<string, unknown>;
      j = await validateExtraction(GEMINI_API_KEY, md, j, userId);

      const name = String(j.name || hit?.title || "").split(/[|\-—•·]/)[0].trim();
      if (!name || name.length < 2) {
        if (hit) {
          const m = buildPlatformFromSnippet(hit, platform);
          if (m) mentors.push(m);
        }
        continue;
      }

      // Liveness: name must appear in scraped text
      if (!nameInText(name, md)) {
        if (hit) {
          const m = buildPlatformFromSnippet(hit, platform);
          if (m && nameInText(m.name, `${hit.title} ${hit.description}`)) mentors.push(m);
        }
        continue;
      }

      const currentRole = String(j.current_role || "").trim();
      const comp = String(j.company || "").trim();
      const ind = String(j.industry || "").trim();
      const skillsArr = Array.isArray(j.skills) ? (j.skills as unknown[]).map(String).slice(0, 12) : [];
      const seniorityLv = String(j.seniority_level || "").trim() || "Mid";

      if (!crossFieldConsistent(hit, name, currentRole, comp)) continue;

      const hay = `${currentRole} ${comp} ${ind} ${md.slice(0, 2000)}`;
      const roleHit = effectiveRole
        ? (fuzzyContains(hay, effectiveRole) || tokensOf(effectiveRole).some((t) => hay.toLowerCase().includes(t)))
        : true;
      const companyHit = company ? fuzzyContains(hay, company) : false;
      const industryHit = industry ? fuzzyContains(hay, industry) : false;
      const skillHit = skills.some((s) => fuzzyContains(hay, s));
      if (!roleHit && !companyHit && !industryHit && !skillHit) continue;

      const linkedin = cleanLinkedin(typeof j.linkedin === "string" ? j.linkedin : null);
      const booking = platform !== "LinkedIn" ? url : (typeof j.booking_url === "string" ? j.booking_url : null);

      const email = sanitizeEmail(j.email, md);
      const phone = sanitizePhone(j.phone, md);
      const pricing = sanitizePricing(j.pricing, md);
      const years = sanitizeYears(j.years_experience, md);

      mentors.push({
        name,
        current_role: currentRole || (hit?.title ?? ""),
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
      rankInputs.push({
        mentorIdx: mentors.length - 1,
        snippet: hit ? `${hit.title} ${hit.description}` : "",
        scraped: md.slice(0, 3000),
      });
    }

    // 4. Evidence-grounded re-rank
    if (mentors.length && GEMINI_API_KEY) {
      const ranks = await rerankMentors(
        GEMINI_API_KEY,
        { role: effectiveRole, company, industry, skills, jdText: jdText.slice(0, 1500) },
        rankInputs.map((ri) => ({
          name: mentors[ri.mentorIdx]!.name,
          snippet: ri.snippet,
          scraped: ri.scraped,
          role: effectiveRole,
          company,
          industry,
          skills,
        })),
        userId,
      );
      for (let i = 0; i < rankInputs.length; i++) {
        const idx = rankInputs[i]!.mentorIdx;
        const rank = ranks[i];
        if (!rank || !mentors[idx]) continue;
        mentors[idx]!.confidence = rank.confidence;
        mentors[idx]!.matched_fields = rank.matched_fields;
        mentors[idx]!.evidence = rank.evidence;
      }
    }

    // 5. Sort by confidence then legacy score
    const platformRank: Record<Platform, number> = { LinkedIn: 4, Topmate: 3, ADPList: 2, Superpeer: 1 };
    mentors.sort((a, b) => {
      const confDiff = (b.confidence ?? 50) - (a.confidence ?? 50);
      if (confDiff !== 0) return confDiff;
      const score = (m: DiscoveredMentor) =>
        (company && fuzzyContains(`${m.company} ${m.current_role}`, company) ? 100 : 0) +
        (effectiveRole && fuzzyContains(m.current_role, effectiveRole) ? 50 : 0) +
        (industry && fuzzyContains(`${m.industry} ${m.current_role}`, industry) ? 20 : 0) +
        platformRank[m.platform];
      return score(b) - score(a);
    });

    // Filter below MIN_CONFIDENCE (keep LinkedIn snippets without confidence)
    const filtered = mentors.filter((m) => (m.confidence ?? 60) >= MIN_CONFIDENCE || m.platform === "LinkedIn");

    // 6. Dedupe with fuzzy name match
    const seen = new Set<string>();
    const deduped: DiscoveredMentor[] = [];
    for (const m of filtered.length ? filtered : mentors) {
      const k = dedupeKey(m);
      if (seen.has(k)) continue;
      const dup = deduped.find((d) => namesMatch(d.name, m.name) && normToken(d.company) === normToken(m.company));
      if (dup) continue;
      seen.add(k);
      deduped.push(m);
      if (deduped.length >= limit) break;
    }

    log.info("done", { count: deduped.length });

    // Merge any Gemini-grounded mentors not already found via web search/scrape.
    const geminiExtra = await geminiDiscoveryPromise;
    if (geminiExtra.mentors.length) {
      const existingKeys = new Set(deduped.map((m) => dedupeKey(m)));
      for (const m of geminiExtra.mentors) {
        const k = dedupeKey(m);
        if (existingKeys.has(k)) continue;
        const dup = deduped.find((d) => namesMatch(d.name, m.name) && normToken(d.company) === normToken(m.company));
        if (dup) continue;
        existingKeys.add(k);
        deduped.push(m);
        if (deduped.length >= limit) break;
      }
    }

    return new Response(JSON.stringify({ mentors: deduped.slice(0, limit) }), {
      status: 200,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (topErr) {
    const msg = (topErr as Error).message ?? String(topErr);
    log.error("unhandled", topErr);
    return new Response(
      JSON.stringify({ mentors: [], error: `External search failed: ${msg}` }),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
    );
  }
});
