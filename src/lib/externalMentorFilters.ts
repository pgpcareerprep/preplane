/**
 * Pure eligibility filters for external mentor discovery.
 * Mirrored in supabase/functions/_shared/providers/mentorFilters.ts for edge runtime.
 */

export type RegionCode = "global" | "in" | "us" | "uk" | "eu" | "sg" | "ae";

export const REGION_HARD_FILTER_PROMPT =
  "Region is a hard eligibility filter. Exclude profiles where location/market is not explicitly supported by source evidence.";

const REGION_MARKERS: Record<string, string[]> = {
  in: [
    "india", "indian", "bengaluru", "bangalore", "mumbai", "delhi", "hyderabad",
    "chennai", "pune", "gurgaon", "gurugram", "noida", "kolkata", "bharat", "indore",
  ],
  us: [
    "united states", "usa", "u.s.", "america", "american", "san francisco", "new york",
    "california", "texas", "seattle", "boston", "chicago",
  ],
  uk: ["united kingdom", " uk", "uk ", "britain", "british", "london", "england", "scotland"],
  eu: ["europe", "european", "germany", "france", "netherlands", "berlin", "paris", "amsterdam", "spain", "italy"],
  sg: ["singapore", " sg"],
  ae: ["uae", "dubai", "abu dhabi", "united arab emirates"],
};

/** Location signals that conflict with the selected region when no local marker is present. */
const REGION_CONFLICTS: Record<string, string[]> = {
  in: [
    "africa", "nigeria", "kenya", "south africa", "ghana", "lagos", "nairobi", "cairo", "egypt",
    "united kingdom", "london", "england", "united states", "san francisco", "new york", "california",
    "singapore", "dubai", "uae", "sydney", "australia",
  ],
  us: ["india", "indian", "bangalore", "mumbai", "nigeria", "kenya", "london", "united kingdom"],
  uk: ["india", "indian", "united states", "san francisco", "nigeria", "kenya"],
  eu: ["india", "indian", "united states", "nigeria", "kenya"],
  sg: ["india", "indian", "united states", "nigeria", "kenya", "london"],
  ae: ["india", "indian", "united states", "nigeria", "kenya", "london", "singapore"],
};

const DATA_ROLE_TERMS = [
  "data", "analytics", "machine learning", "data science", "data engineer", "data engineering",
  "ml", "bi", "business intelligence", "artificial intelligence", " ai ", "statistic",
];

const GENERIC_ROLE_STOP = new Set(["mentor", "coach", "advisor", "consultant", "professional", "expert"]);

export type RegionVerification = {
  location: string | null;
  country: string | null;
  region_verified: boolean;
  region_evidence: string | null;
};

export type MentorEligibilityInput = {
  name: string;
  current_role: string;
  company: string;
  industry: string;
  skills: string[];
  platform?: string;
  source_url?: string | null;
  evidence?: string | null;
  matched_fields?: string[];
  confidence?: number;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  country?: string | null;
  region_verified?: boolean;
  region_evidence?: string | null;
};

export function evidenceCorpus(m: MentorEligibilityInput, extra = ""): string {
  return [
    m.name, m.current_role, m.company, m.industry,
    ...(m.skills || []), m.evidence || "", m.location || "", m.country || "",
    m.region_evidence || "", extra,
  ].join(" ").toLowerCase();
}

export function verifyRegionFromEvidence(region: string, text: string): RegionVerification {
  const code = (region || "global").toLowerCase();
  if (code === "global") {
    return { location: null, country: null, region_verified: true, region_evidence: null };
  }
  const hay = text.toLowerCase();
  const markers = REGION_MARKERS[code] || [];
  const conflicts = REGION_CONFLICTS[code] || [];
  const hit = markers.find((m) => hay.includes(m));
  if (!hit) {
    return { location: null, country: null, region_verified: false, region_evidence: null };
  }
  const conflictOnly = conflicts.some((c) => hay.includes(c)) && !hit;
  if (conflictOnly) {
    return { location: null, country: null, region_verified: false, region_evidence: null };
  }
  const countryMap: Record<string, string> = {
    in: "IN", us: "US", uk: "GB", eu: "EU", sg: "SG", ae: "AE",
  };
  return {
    location: hit,
    country: countryMap[code] || code.toUpperCase(),
    region_verified: true,
    region_evidence: hit,
  };
}

export function roleDomainMatches(targetRole: string, m: MentorEligibilityInput): boolean {
  const target = (targetRole || "").toLowerCase().trim();
  if (!target) return true;
  const hay = evidenceCorpus(m);

  const isDataRole = /\bdata\b|analytics|machine learning|data scien|data engineer|\bml\b|\bbi\b|business intelligence|\bai\b/i.test(target);
  if (isDataRole) {
    const dataHits = DATA_ROLE_TERMS.filter((t) => hay.includes(t.trim()));
    return dataHits.length >= 1;
  }

  const tokens = target
    .split(/[^a-z0-9+]+/)
    .filter((t) => t.length > 2 && !GENERIC_ROLE_STOP.has(t));
  if (tokens.length === 0) return false;

  const strongHits = tokens.filter((t) => hay.includes(t));
  if (strongHits.length === 0) return false;
  if (strongHits.length === 1 && GENERIC_ROLE_STOP.has(strongHits[0])) return false;
  return true;
}

export function domainFieldsMatched(m: MentorEligibilityInput): boolean {
  const fields = m.matched_fields || [];
  return fields.some((f) => ["role", "skills", "industry", "company"].includes(f));
}

export function passesMentorEligibility(
  m: MentorEligibilityInput,
  opts: { region: string; role: string; minConfidence?: number },
): boolean {
  if (!m.source_url || !String(m.source_url).trim()) return false;
  if (!m.name || m.name.length < 2) return false;

  const region = (opts.region || "global").toLowerCase();
  const corpus = evidenceCorpus(m);
  const regionInfo = m.region_verified != null && m.region_evidence != null
    ? { location: m.location ?? null, country: m.country ?? null, region_verified: m.region_verified, region_evidence: m.region_evidence }
    : verifyRegionFromEvidence(region, corpus);

  if (region !== "global" && !regionInfo.region_verified) return false;
  if (!roleDomainMatches(opts.role, m)) return false;

  const minConf = opts.minConfidence ?? 55;
  const conf = m.confidence ?? 0;
  const linkedInSnippet = m.platform === "LinkedIn";
  if (!linkedInSnippet && conf < minConf && !domainFieldsMatched(m)) return false;

  return true;
}

export function computeWebRelevance(
  m: MentorEligibilityInput,
  opts: { region: string; role: string; minConfidence?: number },
): boolean {
  const region = (opts.region || "global").toLowerCase();
  const corpus = evidenceCorpus(m);
  const regionOk = region === "global" || (m.region_verified ?? verifyRegionFromEvidence(region, corpus).region_verified);
  const roleOk = roleDomainMatches(opts.role, m);
  const minConf = opts.minConfidence ?? 55;
  const conf = m.confidence ?? 0;
  const domainOk = domainFieldsMatched(m) || roleOk;
  return regionOk && roleOk && domainOk && conf >= minConf;
}
