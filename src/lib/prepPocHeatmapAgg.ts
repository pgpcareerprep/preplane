/**
 * Pure aggregation logic for the Prep POC Heatmap.
 * No React dependencies — fully unit-testable.
 *
 * Status treatment for "On hold":
 *   - For LMP LOAD display (Current vs Closed column): On hold counts as Closed.
 *     This matches the reference visual where Closed = Conv + NC + OH + OR.
 *   - For LMP Conversion denominator: On hold is EXCLUDED.
 *     Denominator = Converted + Not Converted + Other reasons only.
 *   This distinction is intentional: OH is paused work (no longer "current")
 *   but may still convert, so it is not a final outcome for conversion math.
 *
 * Domain load applies to PREP-role LMPs only (primary assignments).
 * LMPs with no domain set are classified as in-domain to avoid false cross-domain noise.
 *
 * Students Placed = distinct student_ids from lmp_candidates
 * where the linked LMP has status = converted / offer-received.
 */

export type PocRaw = {
  id: string;
  name: string;
  primary_domain: string | null;
  domain_tags: string[] | null;
};

export type LmpProcessForHeatmap = {
  id?: string;
  lmp_code?: string | null;
  company?: string | null;
  role?: string | null;
  status: string | null;
  domain_id?: string | null;
  domain_raw?: string | null;
  daily_progress?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  domains?: { name: string | null } | null;
};

export type LinkRaw = {
  poc_id: string;
  role: string; // "prep" | "support"
  lmp_id: string;
  lmp_processes: LmpProcessForHeatmap | null;
};

export type CandidateRaw = {
  lmp_id: string;
  student_id: string | null;
  student_name?: string | null;
  pipeline_stage?: string | null;
  students?: {
    id?: string | null;
    name?: string | null;
    student_code?: string | null;
    cohort?: string | null;
    primary_domain?: string | null;
  } | null;
};

export type PrepPocHeatmapRow = {
  pocId: string;
  pocName: string;

  totalLmpLoad: number;
  currentLmpCount: number;
  closedLmpCount: number;

  notStartedCount: number;
  prepOngoingCount: number;
  prepDoneCount: number;

  convertedCount: number;
  notConvertedCount: number;
  onHoldCount: number;
  otherReasonsCount: number;

  primaryCount: number;
  supportCount: number;

  inDomainCount: number;
  crossDomainCount: number;

  eligibleClosedCount: number;
  lmpConversionPercentage: number | null;

  studentsPlaced: number;
};

export type PrepPocHeatmapSummary = {
  activePocCount: number;
  uniqueLmpCount: number;
  uniqueStudentsPlaced: number;

  convertedLmpCount: number;
  eligibleClosedLmpCount: number;
  convertedLmpPercentage: number | null;
};

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

export type HeatmapDrilldownLmpRecord = {
  pocId: string;
  pocName: string;
  lmpId: string;
  lmpCode: string;
  company: string;
  role: string;
  domain: string;
  statusRaw: string;
  statusBucket: StatusBucket;
  statusLabel: string;
  outcomeReason: string;
  primaryPoc: string;
  supportPoc: string;
  isPrimary: boolean;
  isSupport: boolean;
  isDualAssigned: boolean;
  isInDomain: boolean;
  isCrossDomain: boolean;
  studentsMapped: number;
  studentsPlaced: number;
  createdAt: string;
  updatedAt: string;
};

export type HeatmapDrilldownStudentRecord = {
  pocId: string;
  pocName: string;
  studentId: string;
  studentName: string;
  studentCode: string;
  cohort: string;
  lmpId: string;
  lmpCode: string;
  company: string;
  role: string;
  domain: string;
  placementStatus: string;
  placementDate: string;
  primaryPoc: string;
  supportPoc: string;
};

export type PrepPocHeatmapSource = {
  lmps: HeatmapDrilldownLmpRecord[];
  students: HeatmapDrilldownStudentRecord[];
};

export type PrepPocHeatmapResponse = {
  summary: PrepPocHeatmapSummary;
  rows: PrepPocHeatmapRow[];
  source: PrepPocHeatmapSource;
  generatedAt: string;
};

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

export type StatusBucket =
  | "notStarted"
  | "prepOngoing"
  | "prepDone"
  | "onHold"
  | "converted"
  | "notConverted"
  | "otherReasons"
  | "unknown";

export function mapStatusToBucket(raw: string | null | undefined): StatusBucket {
  const s = norm(raw);
  if (s === "not-started") return "notStarted";
  if (s === "prep-ongoing" || s === "ongoing") return "prepOngoing";
  if (s === "prep-done") return "prepDone";
  if (s === "hold") return "onHold";
  if (s === "converted" || s === "offer-received") return "converted";
  if (s === "not-converted") return "notConverted";
  if (s === "other-reasons" || s === "dormant" || s === "closed" || s === "converted-na") return "otherReasons";
  return "unknown";
}

export function statusBucketLabel(bucket: StatusBucket): string {
  switch (bucket) {
    case "notStarted": return "Not Started";
    case "prepOngoing": return "Prep Ongoing";
    case "prepDone": return "Prep Done";
    case "onHold": return "On hold";
    case "converted": return "Converted";
    case "notConverted": return "Not Converted";
    case "otherReasons": return "Other reasons";
    default: return "Unknown";
  }
}

export const HEATMAP_METRIC_LABELS: Record<HeatmapMetricKey, string> = {
  total: "Total LMPs",
  current: "Current LMPs",
  closed: "Closed LMPs",
  notStarted: "Not Started",
  prepOngoing: "Prep Ongoing",
  prepDone: "Prep Done",
  converted: "Converted",
  notConverted: "Not Converted",
  onHold: "On hold",
  otherReasons: "Other reasons",
  primary: "Primary",
  support: "Support",
  inDomain: "In-domain",
  crossDomain: "Cross-domain",
  lmpConversion: "LMP Conversion",
  studentsPlaced: "Students Placed",
};

export function buildHeatmapData(
  pocs: PocRaw[],
  links: LinkRaw[],
  candidates: CandidateRaw[],
): PrepPocHeatmapResponse {
  // Index: lmp_id → status bucket
  const lmpStatusMap = new Map<string, StatusBucket>();
  // Index: lmp_id → normalised domain name
  const lmpDomainMap = new Map<string, string>();

  for (const l of links) {
    const id = l.lmp_id;
    if (!lmpStatusMap.has(id)) {
      lmpStatusMap.set(id, mapStatusToBucket(l.lmp_processes?.status));
    }
    if (!lmpDomainMap.has(id)) {
      const dn = norm(l.lmp_processes?.domains?.name);
      if (dn) lmpDomainMap.set(id, dn);
    }
  }

  // Index: lmp_id → Set of student_ids
  const lmpStudentsMap = new Map<string, Set<string>>();
  const studentDetailsMap = new Map<string, CandidateRaw>();
  for (const c of candidates) {
    if (!c.student_id || !c.lmp_id) continue;
    const s = lmpStudentsMap.get(c.lmp_id) ?? new Set<string>();
    s.add(c.student_id);
    lmpStudentsMap.set(c.lmp_id, s);
    if (!studentDetailsMap.has(c.student_id)) studentDetailsMap.set(c.student_id, c);
  }

  // Build per-POC link index
  const activePrepPocIds = new Set<string>(pocs.map((p) => p.id));

  type PocLinkEntry = { prepIds: Set<string>; supportIds: Set<string> };
  const pocLinkIndex = new Map<string, PocLinkEntry>();
  const pocNameById = new Map<string, string>(pocs.map((p) => [p.id, p.name]));
  const lmpDetailsById = new Map<string, LmpProcessForHeatmap>();

  for (const l of links) {
    if (!activePrepPocIds.has(l.poc_id)) continue; // only active Prep POCs
    const entry = pocLinkIndex.get(l.poc_id) ?? { prepIds: new Set(), supportIds: new Set() };
    if (l.role === "prep") entry.prepIds.add(l.lmp_id);
    else if (l.role === "support") entry.supportIds.add(l.lmp_id);
    pocLinkIndex.set(l.poc_id, entry);
    if (l.lmp_processes && !lmpDetailsById.has(l.lmp_id)) {
      lmpDetailsById.set(l.lmp_id, l.lmp_processes);
    }
  }

  // Build POC rows
  const rows: PrepPocHeatmapRow[] = [];
  const sourceLmps: HeatmapDrilldownLmpRecord[] = [];
  const sourceStudents: HeatmapDrilldownStudentRecord[] = [];

  for (const poc of pocs) {
    const pocDomains = buildPocDomainSet(poc);
    const { prepIds = new Set<string>(), supportIds = new Set<string>() } =
      pocLinkIndex.get(poc.id) ?? {};

    // Total = distinct LMPs where POC is prep OR support (deduped)
    const totalIds = new Set<string>([...prepIds, ...supportIds]);

    // Status bucket counts (over totalIds)
    const byCounts: Record<StatusBucket, Set<string>> = {
      notStarted: new Set(),
      prepOngoing: new Set(),
      prepDone: new Set(),
      onHold: new Set(),
      converted: new Set(),
      notConverted: new Set(),
      otherReasons: new Set(),
      unknown: new Set(),
    };
    for (const id of totalIds) {
      byCounts[lmpStatusMap.get(id) ?? "unknown"].add(id);
    }

    // Data-quality guard: same LMP assigned as both primary AND support.
    // We count it once in totalIds but track it for diagnostics.
    const dualAssigned = new Set<string>();
    for (const id of prepIds) {
      if (supportIds.has(id)) dualAssigned.add(id);
    }

    // Domain load — applies to prep-role LMPs only
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

    const primaryPocsByLmp = buildRoleNamesByLmp(links, "prep", pocNameById);
    const supportPocsByLmp = buildRoleNamesByLmp(links, "support", pocNameById);

    for (const id of totalIds) {
      const details = lmpDetailsById.get(id);
      const bucket = lmpStatusMap.get(id) ?? "unknown";
      const studentsMapped = lmpStudentsMap.get(id)?.size ?? 0;
      const studentsPlaced = bucket === "converted" ? studentsMapped : 0;
      const domain = details?.domains?.name || details?.domain_raw || "";
      sourceLmps.push({
        pocId: poc.id,
        pocName: poc.name,
        lmpId: id,
        lmpCode: details?.lmp_code || "",
        company: details?.company || "",
        role: details?.role || "",
        domain,
        statusRaw: details?.status || "",
        statusBucket: bucket,
        statusLabel: statusBucketLabel(bucket),
        outcomeReason: bucket === "otherReasons" ? (details?.status || "Other reasons") : "",
        primaryPoc: primaryPocsByLmp.get(id) || "",
        supportPoc: supportPocsByLmp.get(id) || "",
        isPrimary: prepIds.has(id) && !dualAssigned.has(id),
        isSupport: supportIds.has(id) && !dualAssigned.has(id),
        isDualAssigned: dualAssigned.has(id),
        isInDomain: inDomainIds.has(id),
        isCrossDomain: crossDomainIds.has(id),
        studentsMapped,
        studentsPlaced,
        createdAt: details?.created_at || "",
        updatedAt: details?.updated_at || "",
      });

      if (bucket === "converted") {
        for (const studentId of lmpStudentsMap.get(id) ?? []) {
          const candidate = studentDetailsMap.get(studentId);
          sourceStudents.push({
            pocId: poc.id,
            pocName: poc.name,
            studentId,
            studentName: candidate?.students?.name || candidate?.student_name || studentId,
            studentCode: candidate?.students?.student_code || "",
            cohort: candidate?.students?.cohort || "",
            lmpId: id,
            lmpCode: details?.lmp_code || "",
            company: details?.company || "",
            role: details?.role || "",
            domain,
            placementStatus: "Converted",
            placementDate: details?.updated_at || details?.created_at || "",
            primaryPoc: primaryPocsByLmp.get(id) || "",
            supportPoc: supportPocsByLmp.get(id) || "",
          });
        }
      }
    }

    // Students placed: distinct students through converted LMPs assigned to this POC
    const pocPlacedStudents = new Set<string>();
    for (const id of totalIds) {
      if (lmpStatusMap.get(id) === "converted") {
        for (const s of lmpStudentsMap.get(id) ?? []) {
          pocPlacedStudents.add(s);
        }
      }
    }

    // LMP Load breakdown
    const notStartedCount = byCounts.notStarted.size;
    const prepOngoingCount = byCounts.prepOngoing.size;
    const prepDoneCount = byCounts.prepDone.size;
    const convertedCount = byCounts.converted.size;
    const notConvertedCount = byCounts.notConverted.size;
    const onHoldCount = byCounts.onHold.size;
    const otherReasonsCount = byCounts.otherReasons.size;

    // Current = Not Started + Prep Ongoing + Prep Done
    const currentLmpCount = notStartedCount + prepOngoingCount + prepDoneCount;

    // Closed = Converted + Not Converted + On Hold + Other Reasons
    // (On hold is not "current active" but is excluded from conversion denominator)
    const closedLmpCount = convertedCount + notConvertedCount + onHoldCount + otherReasonsCount;

    // Conversion denominator excludes On hold (see module docstring)
    const eligibleClosedCount = convertedCount + notConvertedCount + otherReasonsCount;
    const lmpConversionPercentage =
      eligibleClosedCount > 0 ? (convertedCount / eligibleClosedCount) * 100 : null;

    rows.push({
      pocId: poc.id,
      pocName: poc.name,
      totalLmpLoad: totalIds.size,
      currentLmpCount,
      closedLmpCount,
      notStartedCount,
      prepOngoingCount,
      prepDoneCount,
      convertedCount,
      notConvertedCount,
      onHoldCount,
      otherReasonsCount,
      primaryCount: prepIds.size - dualAssigned.size, // subtract dual-assigned to avoid inflation
      supportCount: supportIds.size - dualAssigned.size,
      inDomainCount: inDomainIds.size,
      crossDomainCount: crossDomainIds.size,
      eligibleClosedCount,
      lmpConversionPercentage,
      studentsPlaced: pocPlacedStudents.size,
    });
  }

  // Sort: highest total load first, then alphabetically
  rows.sort((a, b) => b.totalLmpLoad - a.totalLmpLoad || a.pocName.localeCompare(b.pocName));

  // ── Global summary KPIs ──────────────────────────────────────────────────
  // Unique LMPs: distinct lmp_ids associated with ANY active Prep POC
  const scopedLmpIds = new Set<string>();
  for (const [pocId, entry] of pocLinkIndex.entries()) {
    if (!activePrepPocIds.has(pocId)) continue;
    for (const id of entry.prepIds) scopedLmpIds.add(id);
    for (const id of entry.supportIds) scopedLmpIds.add(id);
  }
  const uniqueLmpCount = scopedLmpIds.size;

  // Global placed students — deduplicated across all POC LMPs
  const globalPlacedStudents = new Set<string>();
  for (const id of scopedLmpIds) {
    if (lmpStatusMap.get(id) === "converted") {
      for (const s of lmpStudentsMap.get(id) ?? []) {
        globalPlacedStudents.add(s);
      }
    }
  }

  // Global conversion — from the scoped LMP set
  let globalConvertedCount = 0;
  let globalEligibleCount = 0;
  for (const id of scopedLmpIds) {
    const bucket = lmpStatusMap.get(id) ?? "unknown";
    if (bucket === "converted") globalConvertedCount++;
    if (bucket === "converted" || bucket === "notConverted" || bucket === "otherReasons") {
      globalEligibleCount++;
    }
  }

  const activePocCount = rows.filter((r) => r.totalLmpLoad > 0 || r.pocName).length;

  return {
    summary: {
      activePocCount,
      uniqueLmpCount,
      uniqueStudentsPlaced: globalPlacedStudents.size,
      convertedLmpCount: globalConvertedCount,
      eligibleClosedLmpCount: globalEligibleCount,
      convertedLmpPercentage:
        globalEligibleCount > 0
          ? (globalConvertedCount / globalEligibleCount) * 100
          : null,
    },
    rows,
    source: {
      lmps: sourceLmps,
      students: dedupeStudentsByPoc(sourceStudents),
    },
    generatedAt: new Date().toISOString(),
  };
}

function buildRoleNamesByLmp(
  links: LinkRaw[],
  role: "prep" | "support",
  pocNameById: Map<string, string>,
): Map<string, string> {
  const map = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.role !== role) continue;
    const names = map.get(link.lmp_id) ?? new Set<string>();
    const name = pocNameById.get(link.poc_id);
    if (name) names.add(name);
    map.set(link.lmp_id, names);
  }
  return new Map([...map.entries()].map(([id, names]) => [id, [...names].join(", ")]));
}

function dedupeStudentsByPoc(records: HeatmapDrilldownStudentRecord[]): HeatmapDrilldownStudentRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    const key = `${record.pocId}:${record.studentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function filterHeatmapMetricRecords(
  source: PrepPocHeatmapSource,
  pocId: string,
  metricKey: HeatmapMetricKey,
): {
  recordType: "lmp" | "student" | "conversion";
  lmps: HeatmapDrilldownLmpRecord[];
  students: HeatmapDrilldownStudentRecord[];
  denominatorLmps: HeatmapDrilldownLmpRecord[];
  convertedLmps: HeatmapDrilldownLmpRecord[];
} {
  const pocLmps = dedupeLmps(source.lmps.filter((record) => record.pocId === pocId));
  const pocStudents = source.students.filter((record) => record.pocId === pocId);
  const byBucket = (bucket: StatusBucket) => pocLmps.filter((record) => record.statusBucket === bucket);

  if (metricKey === "studentsPlaced") {
    return {
      recordType: "student",
      lmps: [],
      students: dedupeStudentRecords(pocStudents),
      denominatorLmps: [],
      convertedLmps: [],
    };
  }

  if (metricKey === "lmpConversion") {
    const denominatorLmps = pocLmps.filter((record) =>
      record.statusBucket === "converted" ||
      record.statusBucket === "notConverted" ||
      record.statusBucket === "otherReasons",
    );
    const convertedLmps = denominatorLmps.filter((record) => record.statusBucket === "converted");
    return {
      recordType: "conversion",
      lmps: denominatorLmps,
      students: [],
      denominatorLmps,
      convertedLmps,
    };
  }

  const lmps = (() => {
    switch (metricKey) {
      case "total":
        return pocLmps;
      case "current":
        return pocLmps.filter((record) =>
          record.statusBucket === "notStarted" ||
          record.statusBucket === "prepOngoing" ||
          record.statusBucket === "prepDone",
        );
      case "closed":
        return pocLmps.filter((record) =>
          record.statusBucket === "converted" ||
          record.statusBucket === "notConverted" ||
          record.statusBucket === "onHold" ||
          record.statusBucket === "otherReasons",
        );
      case "notStarted":
        return byBucket("notStarted");
      case "prepOngoing":
        return byBucket("prepOngoing");
      case "prepDone":
        return byBucket("prepDone");
      case "converted":
        return byBucket("converted");
      case "notConverted":
        return byBucket("notConverted");
      case "onHold":
        return byBucket("onHold");
      case "otherReasons":
        return byBucket("otherReasons");
      case "primary":
        return pocLmps.filter((record) => record.isPrimary);
      case "support":
        return pocLmps.filter((record) => record.isSupport);
      case "inDomain":
        return pocLmps.filter((record) => record.isInDomain);
      case "crossDomain":
        return pocLmps.filter((record) => record.isCrossDomain);
      default:
        return [];
    }
  })();

  return {
    recordType: "lmp",
    lmps: dedupeLmps(lmps),
    students: [],
    denominatorLmps: [],
    convertedLmps: [],
  };
}

function dedupeLmps(records: HeatmapDrilldownLmpRecord[]): HeatmapDrilldownLmpRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.lmpId)) return false;
    seen.add(record.lmpId);
    return true;
  });
}

function dedupeStudentRecords(records: HeatmapDrilldownStudentRecord[]): HeatmapDrilldownStudentRecord[] {
  const seen = new Set<string>();
  return records.filter((record) => {
    if (seen.has(record.studentId)) return false;
    seen.add(record.studentId);
    return true;
  });
}

function buildPocDomainSet(poc: PocRaw): Set<string> {
  const tags = Array.isArray(poc.domain_tags) ? poc.domain_tags.filter(Boolean) : [];
  return new Set<string>(
    [poc.primary_domain, ...tags].filter(Boolean).map((d) => norm(d)),
  );
}

/** Format conversion display string: "3/5 - 60%" or "—" for zero denominator */
export function fmtConversion(
  convertedCount: number,
  eligibleClosedCount: number,
  pct: number | null,
): string {
  if (eligibleClosedCount === 0) return "—";
  return `${convertedCount}/${eligibleClosedCount} - ${pct !== null ? pct.toFixed(0) : 0}%`;
}
