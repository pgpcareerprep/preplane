/**
 * POC Capability & Domain-Conversion types + pure helpers.
 * Live data lives in `poc_profiles_with_load`; consume it via
 * `@/lib/hooks/usePocCapabilityLive` (usePocCapabilityList /
 * usePocCapability / usePocConversionMap).
 */

export type AssignmentType = "domain" | "cross";
export type AssignmentReason = "ai_best_fit" | "load_balance" | "manual_override";

export type PocType = "domain" | "cross" | "behavioral" | "outreach" | "prep";

export type AvailabilityStatus = "available" | "on_leave" | "deactivated";

export type PocCapability = {
  /** Stable POC identifier from poc_profiles. Preferred match key for allocation. */
  id?: string;
  name: string;
  initials: string;
  /** Combined union of primary + secondary, kept for back-compat. */
  domains: string[];
  /** Domains the POC opted into as PRIMARY (full domain weight). */
  primaryDomains?: string[];
  /** Domains the POC opted into as SECONDARY (partial domain weight). */
  secondaryDomains?: string[];
  label: string;
  color: string;
  pocType: PocType;
  currentLoad: number;
  maxThreshold: number;
  skillTags: string[];
  lastAssignedAt: string;
  availability: AvailabilityStatus;
  behavioralPoolMember: boolean;
  companyExperience?: string[];
  recruiterOwnership?: string[];
  accessLevel?: "admin" | "allocator" | "poc";
  /** Contact email from poc_profiles. */
  email?: string;
  /** LMPs successfully completed by this POC in the current cycle (for fairness/underutilization). */
  lmpsCompletedThisCycle?: number;
};

/** Classify a single (poc, requisition-domain) assignment. */
export function classifyAssignment(_pocName: string, _reqDomain: string): AssignmentType {
  return "cross";
}

export type PocConversionStats = {
  domainTotal: number;
  domainConverted: number;
  domainPct: number;
  crossTotal: number;
  crossConverted: number;
  crossPct: number | null;
  overallTotal: number;
  overallConverted: number;
  overallPct: number;
  rankingScore: number;
};

/**
 * Calculate conversion stats for a POC from live LMP data.
 * Pass the full LMP records array and a POC's domain list.
 */
export function calculatePocConversion(
  pocName: string,
  pocDomains: string[],
  lmpRows: Array<{ status: string; domain: string; prepPoc?: { name: string }; domainPrepPoc?: { name: string }; outreachPoc?: { name: string } }>
): PocConversionStats {
  let domainTotal = 0, domainConverted = 0;
  let crossTotal = 0, crossConverted = 0;

  for (const r of lmpRows) {
    const isPocAssigned = (r.prepPoc?.name || r.domainPrepPoc?.name) === pocName || r.outreachPoc?.name === pocName;
    if (!isPocAssigned) continue;

    const isInDomain = pocDomains.some(d => d.toLowerCase() === r.domain.toLowerCase());
    const isConverted = r.status === "converted" || r.status === "converted-na";

    if (isInDomain) {
      domainTotal++;
      if (isConverted) domainConverted++;
    } else {
      crossTotal++;
      if (isConverted) crossConverted++;
    }
  }

  const overallTotal = domainTotal + crossTotal;
  const overallConverted = domainConverted + crossConverted;
  const pct = (n: number, d: number) => d > 0 ? Math.round((n / d) * 100) : 0;

  return {
    domainTotal,
    domainConverted,
    domainPct: pct(domainConverted, domainTotal),
    crossTotal,
    crossConverted,
    crossPct: crossTotal > 0 ? pct(crossConverted, crossTotal) : null,
    overallTotal,
    overallConverted,
    overallPct: pct(overallConverted, overallTotal),
    rankingScore: pct(domainConverted, domainTotal),
  };
}


export function conversionTone(value: number): "good" | "ok" | "low" {
  if (value >= 70) return "good";
  if (value >= 55) return "ok";
  return "low";
}

export const ASSIGNMENT_REASON_LABEL: Record<AssignmentReason, string> = {
  ai_best_fit:     "AI Best Fit",
  load_balance:    "Load Balancing",
  manual_override: "Manual Override",
};

export function getCapabilityNudges() {
  return [];
}
