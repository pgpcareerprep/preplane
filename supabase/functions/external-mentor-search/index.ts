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
import { assertZeroSpendConfig, MIN_CONFIDENCE } from "../_shared/providers/config.ts";
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
import { loadSecret } from "../_shared/providers/secrets.ts";
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

    const GEMINI_API_KEY = (await loadSecret("GEMINI_API_KEY")) ?? Deno.env.get("GEMINI_API_KEY")?.trim() ?? null;

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
      GEMINI_API_KEY, role, company, industry, skills, seniority, jdText, limit, activePlatforms,
    ).catch((e) => {
      log.warn("gemini_discovery_parallel_failed", { err_msg: (e as Error).message });
      return [] as DiscoveredMentor[];
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
    let searchResults = await Promise.all(
      guaranteedQueries.slice(0, 10).map((q) => cachedSearch(q, 8, log)),
    );

    if (searchResults.flat().length === 0 && effectiveRole) {
      const broadQueries = activePlatforms.map((p) =>
        p === "LinkedIn" ? `site:linkedin.com/in ${effectiveRole} mentor coach ${company || industry || skills.slice(0, 2).join(" ")}`
          : p === "Topmate" ? `site:topmate.io ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
          : p === "ADPList" ? `site:adplist.org ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`
          : `site:superpeer.com ${effectiveRole} mentor ${company || industry || skills.slice(0, 2).join(" ")}`,
      );
      searchResults = await Promise.all(broadQueries.map((q) => cachedSearch(q, 8, log)));
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

    // When web search returns nothing, try Gemini grounding results immediately.
    if (totalHits === 0) {
      log.info("gemini_grounding_fallback", {});
      const geminiMentors = await geminiDiscoveryPromise;
      if (geminiMentors.length) {
        return new Response(JSON.stringify({ mentors: geminiMentors }), {
          status: 200, headers: { ...corsH, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ mentors: [], error: "no_free_provider_result", reason: "no_free_provider_result" }), {
        status: 200, headers: { ...corsH, "Content-Type": "application/json" },
      });
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
    if (geminiExtra.length) {
      const existingKeys = new Set(deduped.map((m) => dedupeKey(m)));
      for (const m of geminiExtra) {
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
