/**
 * Shared mentor-matching pipeline.
 *
 * Extracted from `src/components/lmp/detail/MentorsTab.tsx` so the same
 * scoring / ranking logic can be reused outside the LMP detail flow
 * (e.g. the "Run Mentor" quick-match modal on /mentors).
 *
 * NOTHING in this module is allowed to import React or any LMP-specific code.
 * It must stay pure so both the LMP MentorsTab and the standalone modal
 * produce identical results for the same JD input.
 */

import { type Mentor, type MentorSource } from "@/lib/mentor";
import { TOTAL_LIMIT } from "@/lib/config/thresholds";
import { type ALUMentor } from "@/lib/alumniStore";
import { type ExternalMentor, type ExternalPlatform } from "@/lib/externalMentors";
import { type ScoringWeights } from "@/lib/scoringWeights";
import { getMentorCompanyTiers } from "@/lib/mentorCompanyTiers";

export type MatchMode = "balanced" | "industry" | "role" | "company";

export type ScoringCandidate = {
  id: string;
  name: string;
  role: string;
  company: string;
  allCompanies: string[];
  skills: string[];
  seniority_level: string;
  industry?: string;
  last_active_days?: number;
  linkedin?: string;
  email?: string;
  phone?: string;
  remunerationInr?: number;
  source: "MU" | "ALU" | "EXT";
  // External-only metadata that should pass through scoring → Mentor
  platform?: ExternalPlatform;
  external_links?: { platform: string; booking: string | null; linkedin: string | null };
  sessions_taken?: number | null;
  rating?: number | null;
  possibleDuplicate?: boolean;
  /** Extra badges merged into Mentor.decisionTags (e.g. "Previously aligned"). */
  extraTags?: { emoji: string; label: string }[];
  /** True when the backend already accepted an external web result as relevant. */
  web_relevance?: boolean;
};

export type JdInfo = {
  jdSkills: string[];
  jdRole: string;
  jdSeniority: string;
  jdCompany: string;
  jdIndustry: string;
  gapSkills: string[];
  companySignals?: {
    namedCompanies: string[];
    stageKeywords: string[];
    typeKeywords: string[];
  };
};

// ─── Normalisation ───

function daysSince(iso?: string | null): number | undefined {
  if (!iso) return undefined;
  const t = new Date(iso).getTime();
  if (isNaN(t)) return undefined;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

export function inferSeniorityFromRole(role: string): string {
  const r = role.toLowerCase();
  if (r.includes("ceo") || r.includes("cto") || r.includes("cfo") || r.includes("coo") || r.includes("chief")) return "C-Suite";
  if (r.includes("vp") || r.includes("vice president")) return "VP";
  if (r.includes("director")) return "Director";
  if (r.includes("lead") || r.includes("senior") || r.includes("sr.") || r.includes("principal") || r.includes("staff")) return "Senior";
  if (r.includes("junior") || r.includes("jr.") || r.includes("associate") || r.includes("intern")) return "Junior";
  if (r.includes("manager") || r.includes("head")) return "Mid";
  return "Mid";
}

export function normaliseDbMentor(m: any): ScoringCandidate {
  const src: "MU" | "ALU" = m.source === "ALU" ? "ALU" : "MU";
  return {
    id: m.id || `db_${Math.random().toString(36).slice(2)}`,
    name: m.name || "",
    role: m.designation || m.role || "",
    company: m.company || "",
    allCompanies: [m.company].filter(Boolean),
    skills: Array.isArray(m.skill_tags) ? m.skill_tags : [],
    seniority_level: m.seniority || inferSeniorityFromRole(m.designation || m.role || ""),
    industry: m.industry || m.functional_domain || undefined,
    last_active_days: daysSince(m.updated_at),
    linkedin: m.linkedin,
    email: m.email,
    phone: m.phone,
    remunerationInr: m.rate,
    source: src,
    rating: src === "MU" ? (m.rating != null ? Number(m.rating) : null) : null,
    sessions_taken: src === "MU" ? (m.reviews ?? null) : null,
  };
}

export function normaliseALU(a: ALUMentor): ScoringCandidate {
  const prior = [a.role2, a.role3, a.role4, a.role5, a.role6].filter(Boolean) as string[];
  const allCompanies = Array.from(new Set([
    ...(a.allCompanies || []),
    a.company2, a.company3, a.company4, a.company5, a.company6,
  ].filter(Boolean) as string[]));
  return {
    id: a.id,
    name: a.name,
    role: a.currentRole || prior[0] || "",
    company: a.currentCompany || allCompanies[0] || "",
    allCompanies,
    skills: a.skills,
    seniority_level: inferSeniorityFromRole(a.currentRole || prior[0] || ""),
    industry: a.industry || a.domain1 || a.domain2,
    last_active_days: undefined,
    linkedin: a.linkedin,
    email: a.muEmail,
    source: "ALU",
  };
}

export function normaliseExternal(e: ExternalMentor): ScoringCandidate {
  return {
    id: e.mentor_id,
    name: e.name,
    role: e.current_role,
    company: e.company,
    allCompanies: [e.company].filter(Boolean),
    skills: e.skills,
    seniority_level: e.seniority_level || inferSeniorityFromRole(e.current_role),
    industry: e.industry,
    last_active_days: e.last_active_days,
    linkedin: e.external_links.linkedin || undefined,
    email: e.email || undefined,
    phone: e.phone || undefined,
    remunerationInr: e.remuneration_inr,
    source: "EXT",
    platform: e.platform,
    external_links: e.external_links,
    sessions_taken: e.sessions_taken,
    rating: e.rating,
    web_relevance: true,
  };
}

// ─── Deduplication ───

export function deduplicateCandidates(candidates: ScoringCandidate[]): ScoringCandidate[] {
  const seen = new Map<string, ScoringCandidate>();
  const priority: Record<string, number> = { MU: 3, ALU: 2, EXT: 1 };

  for (const c of candidates) {
    const key = c.linkedin
      ? c.linkedin.toLowerCase().trim()
      : `${c.name.toLowerCase().trim()}|${c.company.toLowerCase().trim()}`;

    if (seen.has(key)) {
      const existing = seen.get(key)!;
      const mergedTags = [...(existing.extraTags ?? []), ...(c.extraTags ?? [])];
      // When an EXT candidate overlaps with a higher-priority MU/ALU entry, tag the
      // surviving record so the UI can still indicate it was found externally.
      if (c.source === "EXT" && priority[existing.source] > priority[c.source]) {
        if (!mergedTags.some((t) => t.label === "Also on External")) {
          mergedTags.push({ emoji: "🌐", label: "Also on External" });
        }
      }
      if (priority[c.source] > priority[existing.source]) {
        // Higher-priority source absorbs lower; preserve an external tag if merging away EXT
        if (existing.source === "EXT" && !mergedTags.some((t) => t.label === "Also on External")) {
          mergedTags.push({ emoji: "🌐", label: "Also on External" });
        }
        seen.set(key, {
          ...existing,
          ...c,
          skills: [...new Set([...c.skills, ...existing.skills])],
          allCompanies: [...new Set([...c.allCompanies, ...existing.allCompanies])],
          extraTags: mergedTags,
        });
      } else {
        existing.extraTags = mergedTags;
      }
    } else {
      seen.set(key, c);
    }
  }

  // Pass 2: name+role collision without company match → flag the lower-priority one.
  const list = Array.from(seen.values());
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j];
      const sameNameRole =
        a.name.toLowerCase().trim() === b.name.toLowerCase().trim() &&
        a.role.toLowerCase().trim() === b.role.toLowerCase().trim();
      const sameCompany = a.company.toLowerCase().trim() === b.company.toLowerCase().trim();
      if (sameNameRole && !sameCompany) {
        const lower = priority[a.source] >= priority[b.source] ? b : a;
        lower.possibleDuplicate = true;
      }
    }
  }
  return list;
}

// ─── Scoring (0–45 spec) ───

function companyTierScore(company: string): { pts: number; tierLabel: "Tier 1" | "Tier 2" | "Tier 3" | "Startup" | "Unknown" } {
  if (!company) return { pts: 1, tierLabel: "Unknown" };
  const c = company.toLowerCase();
  const tiers = getMentorCompanyTiers();
  if (tiers.tier1.some(t => c.includes(t))) return { pts: 5, tierLabel: "Tier 1" };
  if (tiers.tier2.some(t => c.includes(t))) return { pts: 4, tierLabel: "Tier 2" };
  if (tiers.startup_markers.some(t => c.includes(t))) return { pts: 2, tierLabel: "Startup" };
  return { pts: 3, tierLabel: "Tier 3" };
}

const SENIORITY_PTS: Record<string, number> = {
  "c-suite": 10, "cxo": 10, "vp": 9, "vice president": 9,
  "director": 8, "lead": 6, "senior": 6, "mid": 4, "junior": 2,
};

function seniorityScore(s: string): number {
  return SENIORITY_PTS[(s || "mid").toLowerCase()] ?? 4;
}

function sourceScore(s: string): number {
  if (s === "MU") return 5;
  if (s === "ALU") return 3;
  return 0;
}

function skillOverlap(mentorSkills: string[], jdSkills: string[]): { matched: string[]; missing: string[] } {
  const matched: string[] = [];
  const used = new Set<string>();
  for (const ms of mentorSkills) {
    const msl = ms.toLowerCase().trim();
    for (const js of jdSkills) {
      const jsl = js.toLowerCase().trim();
      if (!jsl) continue;
      if (msl.includes(jsl) || jsl.includes(msl)) {
        matched.push(ms);
        used.add(jsl);
        break;
      }
    }
  }
  const missing = jdSkills.filter(j => !used.has(j.toLowerCase().trim()));
  return { matched, missing };
}

function tokenize(s: string | undefined): string[] {
  if (!s) return [];
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 2);
}

function industryOverlap(mentorIndustry: string | undefined, jdIndustry: string | undefined): boolean {
  if (!mentorIndustry || !jdIndustry) return false;
  const a = mentorIndustry.toLowerCase();
  const b = jdIndustry.toLowerCase();
  if (a.includes(b) || b.includes(a)) return true;
  const at = new Set(tokenize(mentorIndustry));
  const bt = tokenize(jdIndustry);
  return bt.some(t => at.has(t));
}

function roleAffinityScore(mentorRole: string | undefined, mentorDesignation: string | undefined, jdRole: string): number {
  const jdTokens = tokenize(jdRole);
  if (jdTokens.length === 0) return 0;
  const mTokens = new Set([...tokenize(mentorRole), ...tokenize(mentorDesignation)]);
  const hits = jdTokens.filter(t => mTokens.has(t)).length;
  if (hits === 0) return 0;
  return Math.min(8, hits * 3);
}

function assignTier(score: number): { tier: "L1" | "L2" | "L3" | "L4" | "L5"; tier_label: string } {
  if (score >= 80) return { tier: "L1", tier_label: "Elite Match" };
  if (score >= 55) return { tier: "L2", tier_label: "Strong Match" };
  if (score >= 35) return { tier: "L3", tier_label: "Good Match" };
  if (score >= 15) return { tier: "L4", tier_label: "Partial Match" };
  return { tier: "L5", tier_label: "Exploratory" };
}

function senioritySignal(level: string, jdLevel: string): string {
  const lvl = (level || "Mid");
  const jd = (jdLevel || "Mid");
  if (lvl.toLowerCase() === jd.toLowerCase()) return `${lvl} — matches target seniority for this role.`;
  const diff = Math.abs(seniorityScore(lvl) - seniorityScore(jd));
  if (diff <= 2) return `${lvl} — adjacent to target (${jd}).`;
  return `${lvl} — differs from target seniority (${jd}).`;
}

function companySignal(c: ScoringCandidate, jdCompany: string): string {
  if (jdCompany && c.allCompanies.some(co => co.toLowerCase().includes(jdCompany.toLowerCase()))) {
    return `Ex-${c.company || jdCompany} — target company alumni. Strong domain authority.`;
  }
  const t = companyTierScore(c.company);
  if (t.tierLabel === "Tier 1") return `${c.company} — Tier 1 company. Strong brand signal.`;
  if (t.tierLabel === "Tier 2") return `${c.company} — Tier 2 unicorn / large MNC.`;
  if (t.tierLabel === "Tier 3") return `${c.company} — established mid-market company.`;
  if (t.tierLabel === "Startup") return `${c.company} — early-stage / startup background.`;
  return c.company ? `${c.company} — limited public signal.` : "Company unknown.";
}

function sourceSignal(source: string): string {
  if (source === "MU") return "Verified Mentor Union profile.";
  if (source === "ALU") return "Alumni network — known graduate.";
  return "External directory profile.";
}

// ─── Pipeline (dedup → pre-filter → score → sort/rank) ───

const PIPELINE_COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-sky-200 text-sky-600",
  "bg-purple-200 text-purple-600",
];

export function runPipeline(
  rawCandidates: ScoringCandidate[],
  jd: JdInfo,
  _weights: ScoringWeights,
  matchMode: MatchMode = "balanced",
  suggestionLimit = TOTAL_LIMIT,
): Mentor[] {
  const deduplicated = deduplicateCandidates(rawCandidates);

  // Pre-compute job context tokens once for all candidates
  const domainTokens = [...tokenize(jd.jdIndustry), ...tokenize(jd.jdRole)]
    .filter((t, i, a) => t.length > 2 && a.indexOf(t) === i);
  const designationTokens = tokenize(jd.jdRole).filter(t => t.length > 2);
  const industryTokens = tokenize(jd.jdIndustry).filter(t => t.length > 2);

  // ─── Filter ───
  const eligible: Array<{ c: ScoringCandidate; matched: string[]; missing: string[] }> = [];

  for (const c of deduplicated) {
    if (!c.name) continue;
    const { matched, missing } = skillOverlap(c.skills, jd.jdSkills);
    const functionalDomain = `${c.industry || ""} ${c.role || ""}`.toLowerCase();
    const domainHit = domainTokens.some(t => functionalDomain.includes(t));
    const designationHit = designationTokens.some(kw => c.role.toLowerCase().includes(kw));
    const industryHit = industryTokens.some(t => (c.industry || "").toLowerCase().includes(t));
    const skillHit = matched.length > 0;
    // Always surface edge-validated external mentors — upstream already filters by confidence.
    if (c.source === "EXT" && (c.web_relevance || (c.extraTags?.length ?? 0) > 0)) {
      eligible.push({ c, matched, missing });
      continue;
    }
    const hasExtraTags = (c.extraTags?.length ?? 0) > 0;
    const hasExternalWebRelevance = c.source === "EXT" && c.web_relevance;
    // Always surface tagged mentors (previously aligned, prior sessions) and
    // web-relevant EXT results; filter out anything with zero signal otherwise.
    if (!hasExtraTags && !hasExternalWebRelevance && !domainHit && !designationHit && !industryHit && !skillHit) continue;
    if ((c.source === "ALU" || c.source === "EXT") && c.last_active_days !== undefined && c.last_active_days > 730) continue;
    eligible.push({ c, matched, missing });
  }

  // ─── Score (new algorithm: 40+20+25+20+10+15 = 130pt max) ───
  const scored = eligible.map(({ c, matched, missing }): Mentor | null => {
    const companyStr = (c.company || "").toLowerCase();

    // Noise filter: skip test accounts
    if (c.name.toLowerCase().includes("test") || companyStr.includes("test account")) return null;

    const functionalDomain = `${c.industry || ""} ${c.role || ""}`.toLowerCase();

    // 1. Domain match (40pts)
    const domainHit = domainTokens.some(t => functionalDomain.includes(t));
    let domainScore = domainHit ? 40 : 0;

    // 2. Designation match (20pts)
    const designationHit = designationTokens.some(kw => c.role.toLowerCase().includes(kw));
    let designationScore = designationHit ? 20 : 0;

    // 3. Expertise match (25pts max, 8pts per keyword hit)
    const expertiseScore = Math.min(25, matched.length * 8);

    // 4. Company match (20pts hard / 10pts soft)
    let companyScore = 0;
    const allCoLower = c.allCompanies.map(co => co.toLowerCase());
    if (jd.companySignals) {
      const namedHit = jd.companySignals.namedCompanies.some(nc =>
        allCoLower.some(co => co.includes(nc.toLowerCase()))
      );
      const stageHit = jd.companySignals.stageKeywords.some(k => companyStr.includes(k.toLowerCase()));
      const typeHit = jd.companySignals.typeKeywords.some(k => companyStr.includes(k.toLowerCase()));
      if (namedHit) companyScore = 20;
      else if (stageHit || typeHit) companyScore = 10;
    } else if (jd.jdCompany) {
      const jdCoLower = jd.jdCompany.toLowerCase();
      if (allCoLower.some(co => co.includes(jdCoLower) || jdCoLower.includes(co))) companyScore = 20;
    }

    // 5. Industry match (10pts)
    const industryHit = industryTokens.some(t => (c.industry || "").toLowerCase().includes(t));
    let industryScore = industryHit ? 10 : 0;

    // 6. Quality signals (15pts max): stacking tiers require reliable sample (>= 5 sessions)
    const completedCalls = c.sessions_taken ?? 0;
    const hasReliableRating = (c.rating != null && c.rating > 0) && completedCalls >= 5;
    const reliableRating = hasReliableRating ? (c.rating ?? 0) : 0;
    let qualityScore = 0;
    if (completedCalls > 10) qualityScore += 5;
    if (completedCalls > 40) qualityScore += 3;
    if (reliableRating >= 4.5) qualityScore += 4;
    if (reliableRating >= 4.8) qualityScore += 3;
    const qualitySignals = Math.min(15, qualityScore);

    // Apply matchMode boosts
    switch (matchMode) {
      case "role":
        designationScore = Math.min(40, Math.round(designationScore * 2));
        domainScore = Math.round(domainScore * 0.7);
        break;
      case "industry":
        domainScore = Math.min(60, Math.round(domainScore * 1.5));
        industryScore = Math.min(20, Math.round(industryScore * 2));
        designationScore = Math.round(designationScore * 0.6);
        break;
      case "company":
        companyScore = Math.min(30, Math.round(companyScore * 1.5));
        break;
    }

    const total = Math.max(0, domainScore + designationScore + expertiseScore + companyScore + industryScore + qualitySignals);
    const { tier, tier_label } = assignTier(total);

    const gapCoverage = jd.gapSkills.length > 0
      ? c.skills.filter(s => jd.gapSkills.some(g =>
          g.toLowerCase().includes(s.toLowerCase()) || s.toLowerCase().includes(g.toLowerCase())
        ))
      : [];

    const colorIdx = c.name.charCodeAt(0) % PIPELINE_COLORS.length;
    const tags: { emoji: string; label: string }[] = [];
    if (jd.jdCompany && c.allCompanies.some(co => co.toLowerCase().includes(jd.jdCompany.toLowerCase()))) {
      tags.push({ emoji: "🏢", label: "Target Company Alumni" });
    }
    if (gapCoverage.length > 0) tags.push({ emoji: "🎯", label: "Covers Skill Gap" });
    if (domainHit && designationHit) tags.push({ emoji: "🏆", label: "Domain + Role Match" });
    if (c.possibleDuplicate) tags.push({ emoji: "⚠", label: "Possible duplicate" });
    if (c.extraTags?.length) tags.push(...c.extraTags);

    const m: Mentor = {
      id: c.id,
      name: c.name,
      initials: c.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
      color: PIPELINE_COLORS[colorIdx],
      role: c.role,
      company: c.company,
      source: c.source as MentorSource,
      score: total,
      scores: {
        role: designationScore,
        skills: expertiseScore,
        company: companyScore,
        industry: industryScore,
        seniority: qualitySignals,
      },
      layer: tier_label,
      tier,
      tier_label,
      score_breakdown: { skill: expertiseScore, seniority: qualitySignals, prestige: domainScore, source: designationScore, company: companyScore, total },
      match_signals: {
        matched_skills: matched,
        missing_skills: missing,
        seniority_note: senioritySignal(c.seniority_level, jd.jdSeniority),
        company_note: companySignal(c, jd.jdCompany),
        source_note: sourceSignal(c.source),
        gap_coverage: gapCoverage,
      },
      decisionTags: tags,
      rating: c.rating ?? null,
      reviews: c.sessions_taken ?? null,
      outcome: Math.min(100, Math.round((total / 130) * 100)),
      availability: "available",
      email: c.email || "",
      phone: c.phone || "",
      seniority: (["Senior", "Lead", "Mid", "Staff", "VP", "Director"].includes(c.seniority_level)
        ? c.seniority_level : "Mid") as "Mid" | "Senior" | "Lead" | "Staff",
      linkedin: c.linkedin,
      mentorUnion: c.source === "MU",
      remunerationInr: c.remunerationInr,
      platform: c.platform,
      external_links: c.external_links,
      sessions_taken: c.sessions_taken ?? null,
      possibleDuplicate: c.possibleDuplicate,
    };
    return m;
  }).filter((m): m is Mentor => m !== null);

  const sourceRankMap: Record<"MU" | "ALU" | "EXT", 1 | 2 | 3> = { MU: 1, ALU: 2, EXT: 3 };

  // Per-source quota: guarantee each present source gets a fair share of the
  // suggestionLimit slots so MU/ALU score boosts don't crowd out EXT results.
  const sortedAll = scored.slice().sort((a, b) => b.score - a.score);
  const bySource: Record<string, Mentor[]> = {};
  for (const m of sortedAll) {
    const k = m.source as string;
    (bySource[k] ||= []).push(m);
  }
  const presentSources = Object.keys(bySource);
  const perSourceQuota = presentSources.length > 0
    ? Math.ceil(suggestionLimit / presentSources.length)
    : suggestionLimit;
  const picked = new Set<string>();
  const finalList: Mentor[] = [];
  for (const src of presentSources) {
    for (const m of bySource[src].slice(0, perSourceQuota)) {
      if (finalList.length >= suggestionLimit) break;
      picked.add(m.id);
      finalList.push(m);
    }
  }
  // Fill remaining slots by absolute score.
  if (finalList.length < suggestionLimit) {
    for (const m of sortedAll) {
      if (finalList.length >= suggestionLimit) break;
      if (picked.has(m.id)) continue;
      picked.add(m.id);
      finalList.push(m);
    }
  }

  return finalList
    .sort((a, b) => b.score - a.score)
    .map((m, i) => ({
      ...m,
      sourceRank: sourceRankMap[m.source as "MU" | "ALU" | "EXT"] ?? 3,
      rank: i + 1,
    }));
}
