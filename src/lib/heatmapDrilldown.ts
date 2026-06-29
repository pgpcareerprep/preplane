/**
 * heatmapDrilldown.ts
 *
 * Pure logic layer for Prep POC Heatmap drill-down.
 * No React dependencies — fully unit-testable.
 *
 * Given a DrilldownContext built for a single POC, drillFilter returns:
 *   - kind:"lmp"        → set of lmpIds matching the metric
 *   - kind:"student"    → set of studentIds (for studentsPlaced)
 *   - kind:"conversion" → convertedIds + eligibleIds (for lmpConversion display)
 */

import {
  mapStatusToBucket,
  buildPocDomainSet,
  type PocRaw,
  type LinkRaw,
  type CandidateRaw,
} from "@/lib/prepPocHeatmapAgg";

export type { StatusBucket } from "@/lib/prepPocHeatmapAgg";
import type { StatusBucket } from "@/lib/prepPocHeatmapAgg";

// ── Metric key ────────────────────────────────────────────────────────────────

export type HeatmapMetricKey =
  | "total"
  | "current"
  | "closed"
  | "notStarted"
  | "prepOngoing"
  | "prepDone"
  | "converted"
  | "notConverted"
  | "onHold"
  | "otherReasons"
  | "primary"
  | "support"
  | "inDomain"
  | "crossDomain"
  | "lmpConversion"
  | "studentsPlaced";

// ── Record types ──────────────────────────────────────────────────────────────

/** One row in the LMP drill-down table */
export type DrillLmpRecord = {
  lmpId: string;
  company: string;
  role: string;
  domainName: string;
  status: string;           // raw DB status value
  statusBucket: StatusBucket;
  statusLabel: string;      // human-readable label
  lmpCode: string;
  prepPocId: string | null;
  supportPocId: string | null;
  prepPocName: string;
  supportPocName: string;
  createdAt: string;
  updatedAt: string;
  studentsCount: number;    // from lmp_candidates for this lmpId
};

/** One row in the Students Placed drill-down table */
export type DrillStudentRecord = {
  studentId: string;
  studentName: string;
  lmpId: string;            // via which LMP they were placed
  company: string;
  domainName: string;
  cohort: string;
  placementStatus: string;
  prepPocId: string | null;
  supportPocId: string | null;
  prepPocName: string;
  supportPocName: string;
};

// ── Context ───────────────────────────────────────────────────────────────────

/** Pre-built sets for a single POC — mirrors buildHeatmapData logic exactly */
export type DrilldownContext = {
  pocId: string;
  totalIds: Set<string>;
  prepIds: Set<string>;          // all prep-role LMPs (including dual-assigned)
  supportIds: Set<string>;       // all support-role LMPs (including dual-assigned)
  dualAssignedIds: Set<string>;  // assigned as both prep AND support
  notStartedIds: Set<string>;
  prepOngoingIds: Set<string>;
  prepDoneIds: Set<string>;
  convertedIds: Set<string>;
  notConvertedIds: Set<string>;
  onHoldIds: Set<string>;
  otherReasonsIds: Set<string>;
  currentIds: Set<string>;       // notStarted ∪ prepOngoing ∪ prepDone
  closedIds: Set<string>;        // converted ∪ notConverted ∪ onHold ∪ otherReasons
  inDomainIds: Set<string>;
  crossDomainIds: Set<string>;
  // For Students Placed: lmpId → Set<studentId> (converted LMPs only)
  convertedStudentMap: Map<string, Set<string>>;
  // Global lookup: lmpId → DrillLmpRecord
  lmpRecordMap: Map<string, DrillLmpRecord>;
  // Global lookup: studentId → DrillStudentRecord
  studentRecordMap: Map<string, DrillStudentRecord>;
};

// ── Result type ───────────────────────────────────────────────────────────────

export type DrillResult =
  | { kind: "lmp"; lmpIds: Set<string> }
  | { kind: "student"; studentIds: Set<string> }
  | { kind: "conversion"; convertedIds: Set<string>; eligibleIds: Set<string> };

// ── Status label map ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<StatusBucket, string> = {
  notStarted: "Not Started",
  prepOngoing: "Prep Ongoing",
  prepDone: "Prep Done",
  onHold: "On hold",
  converted: "Converted",
  notConverted: "Not Converted",
  otherReasons: "Other reasons",
  unknown: "Unknown",
};

export function statusBucketLabel(bucket: StatusBucket): string {
  return STATUS_LABELS[bucket] ?? "Unknown";
}

// ── Core filter function ──────────────────────────────────────────────────────

/**
 * Given a DrilldownContext and a metric key, return the matching set of IDs.
 *
 * "primary"  → all prepIds (including dual-assigned); the cell count already
 *              deducts dual-assigned, but drill-down shows the actual set.
 * "support"  → all supportIds (including dual-assigned)
 */
export function drillFilter(ctx: DrilldownContext, metric: HeatmapMetricKey): DrillResult {
  switch (metric) {
    case "total":
      return { kind: "lmp", lmpIds: new Set(ctx.totalIds) };

    case "current":
      return { kind: "lmp", lmpIds: new Set(ctx.currentIds) };

    case "closed":
      return { kind: "lmp", lmpIds: new Set(ctx.closedIds) };

    case "notStarted":
      return { kind: "lmp", lmpIds: new Set(ctx.notStartedIds) };

    case "prepOngoing":
      return { kind: "lmp", lmpIds: new Set(ctx.prepOngoingIds) };

    case "prepDone":
      return { kind: "lmp", lmpIds: new Set(ctx.prepDoneIds) };

    case "converted":
      return { kind: "lmp", lmpIds: new Set(ctx.convertedIds) };

    case "notConverted":
      return { kind: "lmp", lmpIds: new Set(ctx.notConvertedIds) };

    case "onHold":
      return { kind: "lmp", lmpIds: new Set(ctx.onHoldIds) };

    case "otherReasons":
      return { kind: "lmp", lmpIds: new Set(ctx.otherReasonsIds) };

    case "primary":
      // Show ALL prepIds including dual-assigned (cell count deducts them)
      return { kind: "lmp", lmpIds: new Set(ctx.prepIds) };

    case "support":
      // Show ALL supportIds including dual-assigned
      return { kind: "lmp", lmpIds: new Set(ctx.supportIds) };

    case "inDomain":
      return { kind: "lmp", lmpIds: new Set(ctx.inDomainIds) };

    case "crossDomain":
      return { kind: "lmp", lmpIds: new Set(ctx.crossDomainIds) };

    case "studentsPlaced": {
      // Collect all distinct student IDs from converted LMPs for this POC
      const studentIds = new Set<string>();
      for (const lmpId of ctx.convertedIds) {
        for (const sid of ctx.convertedStudentMap.get(lmpId) ?? []) {
          studentIds.add(sid);
        }
      }
      return { kind: "student", studentIds };
    }

    case "lmpConversion": {
      const eligibleIds = new Set<string>();
      for (const id of ctx.totalIds) {
        if (!ctx.otherReasonsIds.has(id)) eligibleIds.add(id);
      }
      return {
        kind: "conversion",
        convertedIds: new Set(ctx.convertedIds),
        eligibleIds,
      };
    }

    default: {
      // Exhaustive check — TypeScript will catch missing cases at compile time
      const _exhaustive: never = metric;
      return { kind: "lmp", lmpIds: new Set() };
    }
  }
}

// ── Context builder ───────────────────────────────────────────────────────────

/**
 * Build the DrilldownContext for a single POC from the raw fetched data.
 * Mirrors the EXACT same logic as buildHeatmapData for one POC entry.
 */
export function buildDrillContext(
  pocId: string,
  pocRaw: PocRaw,
  allLinks: LinkRaw[],
  allCandidates: CandidateRaw[],
  lmpRecordMap: Map<string, DrillLmpRecord>,
  studentRecordMap: Map<string, DrillStudentRecord>,
): DrilldownContext {
  const pocDomains = buildPocDomainSet(pocRaw);

  // Separate prep and support role sets for this POC
  const prepIds = new Set<string>();
  const supportIds = new Set<string>();

  for (const l of allLinks) {
    if (l.poc_id !== pocId) continue;
    if (l.role === "prep") prepIds.add(l.lmp_id);
    else if (l.role === "support") supportIds.add(l.lmp_id);
  }

  // Total = distinct union
  const totalIds = new Set<string>([...prepIds, ...supportIds]);

  // Dual-assigned: same LMP in both prep AND support for this POC
  const dualAssignedIds = new Set<string>();
  for (const id of prepIds) {
    if (supportIds.has(id)) dualAssignedIds.add(id);
  }

  // Status bucket sets (over totalIds)
  const notStartedIds = new Set<string>();
  const prepOngoingIds = new Set<string>();
  const prepDoneIds = new Set<string>();
  const convertedIds = new Set<string>();
  const notConvertedIds = new Set<string>();
  const onHoldIds = new Set<string>();
  const otherReasonsIds = new Set<string>();

  // Build a local status map from links for this POC's LMPs
  // We use first-seen status (same as buildHeatmapData)
  const lmpStatusSeen = new Map<string, boolean>();
  for (const l of allLinks) {
    const id = l.lmp_id;
    if (!totalIds.has(id)) continue;
    if (lmpStatusSeen.has(id)) continue;
    lmpStatusSeen.set(id, true);
    const bucket = mapStatusToBucket(l.lmp_processes?.status);
    switch (bucket) {
      case "notStarted":    notStartedIds.add(id);    break;
      case "prepOngoing":   prepOngoingIds.add(id);   break;
      case "prepDone":      prepDoneIds.add(id);      break;
      case "converted":     convertedIds.add(id);     break;
      case "notConverted":  notConvertedIds.add(id);  break;
      case "onHold":        onHoldIds.add(id);        break;
      case "otherReasons":  otherReasonsIds.add(id);  break;
      // "unknown" — not placed in any bucket
    }
  }

  // Current and closed sets
  const currentIds = new Set<string>([...notStartedIds, ...prepOngoingIds, ...prepDoneIds]);
  const closedIds = new Set<string>([...convertedIds, ...notConvertedIds, ...onHoldIds, ...otherReasonsIds]);

  // Domain load — applies to prep-role LMPs only
  // Build lmpDomainMap from links
  const lmpDomainMap = new Map<string, string>();
  for (const l of allLinks) {
    const id = l.lmp_id;
    if (!lmpDomainMap.has(id)) {
      const dn = (l.lmp_processes?.domains?.name ?? "").trim().toLowerCase();
      if (dn) lmpDomainMap.set(id, dn);
    }
  }

  const inDomainIds = new Set<string>();
  const crossDomainIds = new Set<string>();
  for (const id of prepIds) {
    const dn = lmpDomainMap.get(id) ?? "";
    if (pocDomains.size === 0 || !dn || pocDomains.has(dn)) {
      inDomainIds.add(id);
    } else {
      crossDomainIds.add(id);
    }
  }

  // convertedStudentMap: lmpId → Set<studentId> for converted LMPs in this POC
  const convertedStudentMap = new Map<string, Set<string>>();
  for (const c of allCandidates) {
    if (!c.student_id || !c.lmp_id) continue;
    if (!convertedIds.has(c.lmp_id)) continue;
    const s = convertedStudentMap.get(c.lmp_id) ?? new Set<string>();
    s.add(c.student_id);
    convertedStudentMap.set(c.lmp_id, s);
  }

  return {
    pocId,
    totalIds,
    prepIds,
    supportIds,
    dualAssignedIds,
    notStartedIds,
    prepOngoingIds,
    prepDoneIds,
    convertedIds,
    notConvertedIds,
    onHoldIds,
    otherReasonsIds,
    currentIds,
    closedIds,
    inDomainIds,
    crossDomainIds,
    convertedStudentMap,
    lmpRecordMap,
    studentRecordMap,
  };
}

// ── Builder helpers for lmpRecordMap / studentRecordMap ───────────────────────

/**
 * Build the lmpRecordMap from extended link data.
 * Called in the React queryFn alongside buildHeatmapData.
 *
 * lmpDetailLinks must have the extended lmp_processes fields:
 *   company, role, lmp_code, created_at, updated_at,
 *   prep_poc_id, support_poc_id, prep_poc, support_poc
 */
export type ExtendedLinkRaw = {
  poc_id: string;
  role: string;
  lmp_id: string;
  lmp_processes: {
    id?: string;
    status: string | null;
    domain_id?: string | null;
    domains?: { name: string | null } | null;
    company?: string | null;
    role?: string | null;
    lmp_code?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    prep_poc_id?: string | null;
    support_poc_id?: string | null;
    prep_poc?: string | null;
    support_poc?: string | null;
  } | null;
};

export function buildLmpRecordMap(
  links: ExtendedLinkRaw[],
  candidatesByLmp: Map<string, Set<string>>,
): Map<string, DrillLmpRecord> {
  const map = new Map<string, DrillLmpRecord>();

  for (const l of links) {
    const id = l.lmp_id;
    if (map.has(id)) continue; // first-seen wins
    const proc = l.lmp_processes;
    const bucket = mapStatusToBucket(proc?.status);
    map.set(id, {
      lmpId: id,
      company: proc?.company ?? "",
      role: proc?.role ?? "",
      domainName: proc?.domains?.name ?? "",
      status: proc?.status ?? "",
      statusBucket: bucket,
      statusLabel: statusBucketLabel(bucket),
      lmpCode: proc?.lmp_code ?? "",
      prepPocId: proc?.prep_poc_id ?? null,
      supportPocId: proc?.support_poc_id ?? null,
      prepPocName: proc?.prep_poc ?? "",
      supportPocName: proc?.support_poc ?? "",
      createdAt: proc?.created_at ?? "",
      updatedAt: proc?.updated_at ?? "",
      studentsCount: candidatesByLmp.get(id)?.size ?? 0,
    });
  }

  return map;
}

/**
 * Build the studentRecordMap from lmpRecordMap + candidate data.
 * Only builds records for students in CONVERTED LMPs.
 */
export function buildStudentRecordMap(
  candidatesByLmp: Map<string, Set<string>>,
  lmpRecordMap: Map<string, DrillLmpRecord>,
  // Optional: student detail lookup (name, cohort, placementStatus)
  studentDetails?: Map<string, { name: string; cohort: string; placementStatus: string }>,
): Map<string, DrillStudentRecord> {
  const map = new Map<string, DrillStudentRecord>();

  for (const [lmpId, students] of candidatesByLmp.entries()) {
    const lmp = lmpRecordMap.get(lmpId);
    if (!lmp || lmp.statusBucket !== "converted") continue;

    for (const sid of students) {
      if (map.has(sid)) continue; // first-seen wins (student placed via first converted LMP)
      const detail = studentDetails?.get(sid);
      map.set(sid, {
        studentId: sid,
        studentName: detail?.name ?? "",
        lmpId,
        company: lmp.company,
        domainName: lmp.domainName,
        cohort: detail?.cohort ?? "",
        placementStatus: detail?.placementStatus ?? "",
        prepPocId: lmp.prepPocId,
        supportPocId: lmp.supportPocId,
        prepPocName: lmp.prepPocName,
        supportPocName: lmp.supportPocName,
      });
    }
  }

  return map;
}

/**
 * Build a lmpId → Set<studentId> index from candidate raw rows.
 * Deduplicates student_id within each LMP.
 */
export function buildCandidatesByLmp(
  candidates: CandidateRaw[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (!c.student_id || !c.lmp_id) continue;
    const s = map.get(c.lmp_id) ?? new Set<string>();
    s.add(c.student_id);
    map.set(c.lmp_id, s);
  }
  return map;
}
