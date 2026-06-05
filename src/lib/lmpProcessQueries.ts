/**
 * Process types and analytics helpers for LMP.
 * Data now comes from Google Sheets via useLiveProcesses().
 * This file provides types and utility functions only.
 */

export type ProcessStatus =
  | "Ongoing"
  | "Offer Received"
  | "Converted"
  | "On Hold"
  | "Dormant"
  | "Closed";

export type OfferOutcome = "Accepted" | "Rejected" | "Pending" | "";

export type Domain =
  | "Consulting"
  | "Product Management"
  | "FOCOS"
  | "HR"
  | "Data"
  | "Supply Chain & Operations"
  | "Sales"
  | "Marketing"
  | "Finance / PE / VC";

export type ProcessType = "Internship" | "Full-Time" | "PPO" | "Lateral";

export type Process = {
  processId: string;
  dateCreated: string;       // ISO
  company: string;
  role: string;
  domain: Domain;
  type: ProcessType;
  status: ProcessStatus;
  offerOutcome: OfferOutcome;
  prepProgress: number;      // 0..100
  placementProgress: "Not Started" | "Prep" | "R1" | "R2" | "R3" | "Offer" | "Converted";
  r1Shortlisted: string;     // candidate name(s) or ""
  r2Shortlisted: string;
  r3Shortlisted: string;
  finalConvert: string;      // "" if none
  convertNames: string;
  prepDoc: "Sent" | "" ;
  mentorAligned: "Yes" | "No";
  mockDoneByPoc?: boolean;
  nextExpectedProgress?: string;
  prepPoc: string;
  supportPoc: string;
  outreachPoc: string;
  lastUpdated: string;       // ISO
  closingDate: string;       // ISO (may be future) or ""
  closedReason: string;
  lastProgressUpdatedAt?: string;
};

export const DOMAINS: Domain[] = [
  "Consulting",
  "Product Management",
  "FOCOS",
  "HR",
  "Data",
  "Supply Chain & Operations",
  "Sales",
  "Marketing",
  "Finance / PE / VC",
];

export const STATUS_LIST: ProcessStatus[] = [
  "Ongoing",
  "Offer Received",
  "Converted",
  "On Hold",
  "Dormant",
  "Closed",
];


/* ---------- helpers consumed by dashboards ---------- */

export { SLA_DORMANT_DAYS, POC_OVERLOAD_THRESHOLD } from "@/lib/config/thresholds";
import { SLA_DORMANT_DAYS } from "@/lib/config/thresholds";

export function daysSince(iso: string): number {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/** Filter rows visible to a given user/role. */
export function scopeForRole(
  rows: Process[],
  role: "admin" | "allocator" | "poc",
  userName: string,
): Process[] {
  if (role === "poc") {
    return rows.filter((r) => r.prepPoc === userName || r.supportPoc === userName || r.outreachPoc === userName);
  }
  return rows;
}

/** Returns true if the row counts as "Converted" per spec. */
export const isConverted = (r: Process) =>
  r.status === "Converted" || r.finalConvert.trim() !== "";

/** Returns true if Status = Offer Received OR Offer Outcome present. */
export const hasOffer = (r: Process) =>
  r.status === "Offer Received" || r.offerOutcome !== "";

/** Dormant per spec: Status = Dormant OR (Ongoing AND stale > SLA). */
export const isDormant = (r: Process) =>
  r.status === "Dormant" ||
  (r.status === "Ongoing" && daysSince(r.lastUpdated) > SLA_DORMANT_DAYS);

export function statusCounts(rows: Process[]) {
  return {
    Ongoing: rows.filter((r) => r.status === "Ongoing").length,
    "Offer Received": rows.filter((r) => r.status === "Offer Received").length,
    Converted: rows.filter(isConverted).length,
    "On Hold": rows.filter((r) => r.status === "On Hold").length,
    Dormant: rows.filter(isDormant).length,
    Closed: rows.filter((r) => r.status === "Closed").length,
  };
}

export function offerCounts(rows: Process[]) {
  const offers = rows.filter(hasOffer);
  const total = offers.length || 1;
  const accepted = offers.filter((r) => r.offerOutcome === "Accepted").length;
  const rejected = offers.filter((r) => r.offerOutcome === "Rejected").length;
  const pending = offers.filter((r) => r.offerOutcome === "Pending").length;
  return {
    total: offers.length,
    accepted, rejected, pending,
    acceptRate: (accepted / total) * 100,
    rejectRate: (rejected / total) * 100,
    pendingRate: (pending / total) * 100,
  };
}

export function funnelStages(rows: Process[]) {
  return [
    { stage: "LMP Started",     count: rows.length },
    { stage: "Prep Doc Sent",   count: rows.filter((r) => r.prepDoc === "Sent").length },
    { stage: "Mentor Aligned",  count: rows.filter((r) => r.mentorAligned === "Yes").length },
    { stage: "R1 Shortlisted",  count: rows.filter((r) => r.r1Shortlisted).length },
    { stage: "R2 Shortlisted",  count: rows.filter((r) => r.r2Shortlisted).length },
    { stage: "R3 Shortlisted",  count: rows.filter((r) => r.r3Shortlisted).length },
    { stage: "Offer Received",  count: rows.filter(hasOffer).length },
    { stage: "Converted ", count: rows.filter(isConverted).length },
  ];
}

export function domainBreakdown(rows: Process[]) {
  return DOMAINS.map((d) => {
    const list = rows.filter((r) => r.domain === d);
    const total = list.length;
    return {
      domain: d,
      total,
      ongoing: list.filter((r) => r.status === "Ongoing").length,
      offer: list.filter((r) => r.status === "Offer Received").length,
      converted: list.filter(isConverted).length,
      risk: list.filter((r) => r.status === "On Hold" || isDormant(r) || r.status === "Closed").length,
      conversionRate: total ? (list.filter(isConverted).length / total) * 100 : 0,
      offerRate: total ? (list.filter(hasOffer).length / total) * 100 : 0,
    };
  });
}

export function pocLoad(rows: Process[], which: "prep" | "support" | "outreach") {
  const key: keyof Process = which === "prep" ? "prepPoc" : which === "support" ? "supportPoc" : "outreachPoc";
  const map = new Map<string, { ongoing: number; offer: number; converted: number; hold: number; dormant: number; closed: number; total: number }>();
  rows.forEach((r) => {
    const name = String(r[key]);
    if (!name) return;
    const cur = map.get(name) ?? { ongoing: 0, offer: 0, converted: 0, hold: 0, dormant: 0, closed: 0, total: 0 };
    cur.total += 1;
    if (r.status === "Ongoing") cur.ongoing += 1;
    else if (r.status === "Offer Received") cur.offer += 1;
    else if (r.status === "On Hold") cur.hold += 1;
    else if (r.status === "Closed") cur.closed += 1;
    if (isDormant(r)) cur.dormant += 1;
    if (isConverted(r)) cur.converted += 1;
    map.set(name, cur);
  });
  return Array.from(map, ([poc, v]) => ({ poc, ...v })).sort((a, b) => b.ongoing - a.ongoing);
}

/* Required-field completeness for Allocator views */
export function requiredFieldsForRow(r: Process): { filled: number; total: number; missing: string[] } {
  const missing: string[] = [];
  const check = (cond: boolean, label: string) => { if (!cond) missing.push(label); };

  check(!!r.company, "Company");
  check(!!r.role, "Role");
  check(!!r.domain, "Domain");
  check(!!r.status, "Status");
  check(!!r.type, "Type");
  check(!!r.prepPoc, "Prep POC");
  check(!!r.outreachPoc, "Outreach POC");
  check(typeof r.prepProgress === "number", "Prep Progress");
  check(!!r.placementProgress, "Placement Progress");
  check(!!r.prepDoc, "Prep Doc");
  check(!!r.lastUpdated, "Last Updated");

  if (r.status === "Closed" || r.status === "Converted") check(!!r.closingDate, "Closing Date");
  if (r.status === "Closed") check(!!r.closedReason, "Closed Reason");
  if (r.status === "Converted") check(!!r.convertNames, "Convert Name");
  if (r.status === "Offer Received") check(!!r.offerOutcome, "Offer Outcome");

  const total = 11
    + ((r.status === "Closed" || r.status === "Converted") ? 1 : 0)
    + (r.status === "Closed" ? 1 : 0)
    + (r.status === "Converted" ? 1 : 0)
    + (r.status === "Offer Received" ? 1 : 0);
  return { filled: total - missing.length, total, missing };
}

export function completenessForRows(rows: Process[]) {
  let filled = 0, total = 0;
  rows.forEach((r) => {
    const c = requiredFieldsForRow(r);
    filled += c.filled; total += c.total;
  });
  return { filled, total, pct: total ? (filled / total) * 100 : 100 };
}

/** Round score per spec (used for Avg Round Depth). */
export function roundScore(r: Process): number {
  if (isConverted(r)) return 5;
  if (hasOffer(r)) return 4;
  if (r.r3Shortlisted) return 3;
  if (r.r2Shortlisted) return 2;
  if (r.r1Shortlisted) return 1;
  return 0;
}