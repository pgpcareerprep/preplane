import { supabase } from "@/integrations/supabase/client";
import type { Mentor, MentorSource } from "@/lib/mentor";

export type MatchMode = "balanced" | "industry" | "role" | "company";

export function applyMatchMode(
  scores: { role: number; skills: number; company: number; industry: number; seniority: number },
  companyBonus: number,
  mode: MatchMode,
): number {
  const { skills, seniority } = scores;
  let { role, company, industry } = scores;
  switch (mode) {
    case "role":
      role = Math.min(75, role * 2.5);
      company = company * 0.5;
      industry = industry * 0.5;
      break;
    case "industry":
      industry = Math.min(40, industry * 4);
      role = role * 0.6;
      company = company * 0.6;
      break;
    case "company":
      company = company * 2.5;
      role = role * 0.6;
      industry = industry * 0.6;
      break;
    case "balanced":
    default:
      break;
  }
  return Math.round(role + skills + company + industry + seniority + companyBonus);
}

export type MatchingError = {
  source: "MU" | "ALU" | "EXT";
  message: string;
  recoverable: boolean;
};

export type FindMentorsResult = {
  results: Mentor[];
  bySource: { MU: Mentor[]; ALU: Mentor[]; EXT: Mentor[] };
  errors: MatchingError[];
};

function sourceBucket(s: MentorSource): "MU" | "ALU" | "EXT" {
  return s === "MU" ? "MU" : s === "ALU" ? "ALU" : "EXT";
}

interface DbMentor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  designation: string | null;
  company: string | null;
  linkedin: string | null;
  functional_domain: string | null;
  industry: string | null;
  skill_tags: string[] | null;
  seniority: string | null;
  rate: number | null;
  currency: string | null;
  payment_type: string | null;
  source: string;
  rating: number | null;
  reviews: number | null;
  overall_score: number | null;
  availability: string;
  role: string | null;
  layer: string | null;
  decision_tags: unknown;
  mentor_union: boolean | null;
  remuneration_inr: number | null;
  outcome_pct: number | null;
  past_experience: unknown;
  mentorship_history: unknown;
  score_role: number | null;
  score_skills: number | null;
  score_company: number | null;
  score_industry: number | null;
  score_seniority: number | null;
}

function normalize(s: string | null | undefined): string {
  return (s || "")
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, " ")
    .replace(/[\s\-_]+/g, " ")
    .replace(/\b(inc|incorporated|ltd|limited|llc|llp|pvt|private|pte|plc|corp|corporation|co|gmbh|sa|ag|nv|bv)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fuzzyMatch(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  const wa = na.split(" ");
  const wb = nb.split(" ");
  const overlap = wa.filter((w) => wb.some((x) => x.includes(w) || w.includes(x))).length;
  return overlap / Math.max(wa.length, wb.length);
}

function scoreRole(mentorRole: string | null, mentorDesignation: string | null, targetRole: string): number {
  const best = Math.max(fuzzyMatch(mentorRole, targetRole), fuzzyMatch(mentorDesignation, targetRole));
  return Math.round(best * 30);
}

function scoreSkills(
  mentorSkills: string[] | null,
  _targetRole: string,
  jdSkills?: string[],
  gapSkills?: string[],
): number {
  if (!mentorSkills?.length) return 5;
  const effectiveJd = jdSkills && jdSkills.length > 0 ? jdSkills : (gapSkills && gapSkills.length > 0 ? gapSkills : []);
  if (effectiveJd.length === 0) return 5;
  const jdLower = effectiveJd.map((s) => s.toLowerCase().trim());
  const gapLower = (gapSkills ?? []).map((s) => s.toLowerCase().trim());
  let hits = 0;
  let gapHits = 0;
  for (const s of mentorSkills) {
    const ns = normalize(s);
    const isHit = jdLower.some((j) => ns.includes(j) || j.includes(ns));
    if (isHit) hits += 1;
    const isGap = gapLower.length > 0 && gapLower.some((g) => ns.includes(g) || g.includes(ns));
    if (isGap) gapHits += 1;
  }
  const weightedHits = hits + 0.5 * gapHits;
  return Math.min(25, Math.round((weightedHits / Math.max(jdLower.length, 1)) * 25) + 5);
}

function scoreCompany(mentorCompany: string | null, targetCompany?: string): number {
  if (!targetCompany || !mentorCompany) return 5;
  const match = fuzzyMatch(mentorCompany, targetCompany);
  return Math.round(match * 35);
}

function scoreIndustry(mentorIndustry: string | null, mentorDomain: string | null, targetIndustry?: string): number {
  if (!targetIndustry) return 5;
  const best = Math.max(fuzzyMatch(mentorIndustry, targetIndustry), fuzzyMatch(mentorDomain, targetIndustry));
  return Math.round(best * 10);
}

function scoreSeniority(mentorSeniority: string | null): number {
  const map: Record<string, number> = { staff: 10, lead: 8, senior: 6, mid: 4, junior: 2 };
  return map[normalize(mentorSeniority)] || 4;
}

function tierLabel(score: number): string {
  if (score >= 100) return "Layer 1: Elite Match";
  if (score >= 82) return "Layer 2: Strong Match";
  if (score >= 64) return "Layer 3: Good Match";
  if (score >= 46) return "Layer 4: Potential Match";
  return "Layer 5: Exploratory";
}

function generateTags(scores: { role: number; skills: number; company: number; industry: number; seniority: number }): { emoji: string; label: string }[] {
  const tags: { emoji: string; label: string }[] = [];
  if (scores.company >= 30) tags.push({ emoji: "🏢", label: "Company Insider" });
  if (scores.industry >= 12) tags.push({ emoji: "🏭", label: "Industry Expert" });
  if (scores.role >= 28) tags.push({ emoji: "🎯", label: "Role Match" });
  if (scores.skills >= 22) tags.push({ emoji: "🧠", label: "Skills Aligned" });
  if (scores.seniority >= 8) tags.push({ emoji: "⭐", label: "Senior Leader" });
  return tags.slice(0, 3);
}

function initials(name: string): string {
  const parts = name.split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

const COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-sage-200 text-sage-600",
  "bg-yellow-200 text-yellow-600",
  "bg-sky-200 text-sky-600",
  "bg-plum-400/30 text-plum-400",
];

export async function findMentors(
  role: string,
  company?: string,
  industry?: string,
  sources: MentorSource[] = ["MU", "ALU", "EXT"],
  jdSkills?: string[],
  jdSeniority?: string,
  gapSkills?: string[],
  selectedSkills?: string[],
  matchMode: MatchMode = "balanced",
): Promise<FindMentorsResult> {
  const errors: MatchingError[] = [];
  const requestedBuckets = Array.from(new Set(sources.map(sourceBucket)));

  let data: DbMentor[] | null = null;
  try {
    const res = await supabase
      .from("mentors")
      .select("*")
      .in("source", sources)
      .limit(500);
    if (res.error) {
      for (const b of requestedBuckets) {
        errors.push({ source: b, message: res.error.message, recoverable: true });
      }
    } else {
      data = (res.data as unknown as DbMentor[]) ?? [];
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    for (const b of requestedBuckets) {
      errors.push({ source: b, message, recoverable: false });
    }
  }

  if (!data) return { results: [], bySource: { MU: [], ALU: [], EXT: [] }, errors };

  const effectiveJdSkills = jdSkills && jdSkills.length > 0 ? jdSkills : (selectedSkills ?? []);
  const pinnedIds = new Set<string>();

  const scored = data.map((m, idx) => {
    const scores = {
      role: scoreRole(m.role, m.designation, role),
      skills: scoreSkills(m.skill_tags, role, effectiveJdSkills, gapSkills),
      company: scoreCompany(m.company, company),
      industry: scoreIndustry(m.industry, m.functional_domain, industry),
      seniority: scoreSeniority(m.seniority),
    };

    const companyExact = !!company && !!m.company && normalize(m.company) === normalize(company);
    const roleExact = !!role && (
      (!!m.role && normalize(m.role) === normalize(role)) ||
      (!!m.designation && normalize(m.designation) === normalize(role))
    );
    const companyBonus = companyExact ? 25 : 0;

    let total = applyMatchMode(scores, companyBonus, matchMode);

    if ((m.source as MentorSource) === "MU") {
      const r = Math.floor(Number(m.rating) || 0);
      const mult = r >= 5 ? 1.15 : r === 4 ? 1.10 : r === 3 ? 1.05 : 1.0;
      total = total * mult;
    }
    total = Math.round(total);

    if (companyExact && roleExact) pinnedIds.add(m.id);

    const mentor: Mentor = {
      id: m.id,
      name: m.name,
      initials: initials(m.name).toUpperCase(),
      color: COLORS[idx % COLORS.length],
      role: m.designation || m.role || "—",
      company: m.company || "—",
      source: (m.source as MentorSource) || "MU",
      sourceRank: (((m.source as MentorSource) || "MU") === "MU" ? 1 : ((m.source as MentorSource) === "ALU" ? 2 : 3)) as 1 | 2 | 3,
      score: total,
      scores,
      layer: tierLabel(total),
      decisionTags: generateTags(scores),
      rating: Number(m.rating) || 0,
      reviews: m.reviews || 0,
      outcome: Number(m.outcome_pct) || 0,
      availability: (m.availability as "available" | "busy") || "available",
      email: m.email || "",
      phone: m.phone || "",
      seniority: (m.seniority as "Mid" | "Senior" | "Lead" | "Staff") || "Mid",
      linkedin: m.linkedin || undefined,
      mentorUnion: m.mentor_union ?? m.source === "MU",
      remunerationInr: Number(m.remuneration_inr) || Number(m.rate) || undefined,
    };
    return mentor;
  });

  // Partition by source, sort each by score desc, then concat in priority order MU → ALU → EXT
  const byScore = (a: Mentor, b: Mentor) => b.score - a.score;
  const mu = scored.filter(m => m.source === "MU").sort(byScore);
  const alu = scored.filter(m => m.source === "ALU").sort(byScore);
  const ext = scored.filter(m => m.source === "EXT").sort(byScore);
  // deduplicateMentors keeps first occurrence — order ensures MU > ALU > EXT priority
  const merged = deduplicateMentors([...mu, ...alu, ...ext]);
  // Final stable sort: sourceRank asc, score desc
  merged.sort((a, b) => (a.sourceRank ?? 9) - (b.sourceRank ?? 9) || b.score - a.score);

  // Pin double-exact (company + role) matches to top 3, preserving score-desc order
  const pinned = merged.filter(m => pinnedIds.has(m.id)).sort((a, b) => b.score - a.score).slice(0, 3);
  const pinnedSet = new Set(pinned.map(m => m.id));
  const rest = merged.filter(m => !pinnedSet.has(m.id));
  const ordered = [...pinned, ...rest];

  return {
    results: ordered.slice(0, 20),
    bySource: {
      MU: deduplicateMentors(mu).slice(0, 5),
      ALU: deduplicateMentors(alu).slice(0, 5),
      EXT: deduplicateMentors(ext).slice(0, 5),
    },
    errors,
  };
}

/**
 * Remove duplicates by email (case-insensitive) OR (normalized name + normalized company).
 * Preserves first-seen order — caller controls priority by ordering input.
 */
export function deduplicateMentors(mentors: Mentor[]): Mentor[] {
  const seenEmails = new Set<string>();
  const seenNameCompany = new Set<string>();
  const out: Mentor[] = [];
  for (const m of mentors) {
    const email = (m.email || "").toLowerCase().trim();
    const name = normalize(m.name);
    const company = normalize(m.company);
    const nck = name && company ? `${name}|${company}` : "";
    if (email && seenEmails.has(email)) continue;
    if (nck && seenNameCompany.has(nck)) continue;
    if (email) seenEmails.add(email);
    if (nck) seenNameCompany.add(nck);
    out.push(m);
  }
  return out;
}
