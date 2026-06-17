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

export type LinkRaw = {
  poc_id: string;
  role: string; // "prep" | "support"
  lmp_id: string;
  lmp_processes: {
    id?: string;
    status: string | null;
    domain_id?: string | null;
    domains?: { name: string | null } | null;
  } | null;
};

export type CandidateRaw = {
  lmp_id: string;
  student_id: string | null;
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

export type PrepPocHeatmapResponse = {
  summary: PrepPocHeatmapSummary;
  rows: PrepPocHeatmapRow[];
  generatedAt: string;
};

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

type StatusBucket =
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
  for (const c of candidates) {
    if (!c.student_id || !c.lmp_id) continue;
    const s = lmpStudentsMap.get(c.lmp_id) ?? new Set<string>();
    s.add(c.student_id);
    lmpStudentsMap.set(c.lmp_id, s);
  }

  // Build per-POC link index
  const activePrepPocIds = new Set<string>(pocs.map((p) => p.id));

  type PocLinkEntry = { prepIds: Set<string>; supportIds: Set<string> };
  const pocLinkIndex = new Map<string, PocLinkEntry>();

  for (const l of links) {
    if (!activePrepPocIds.has(l.poc_id)) continue; // only active Prep POCs
    const entry = pocLinkIndex.get(l.poc_id) ?? { prepIds: new Set(), supportIds: new Set() };
    if (l.role === "prep") entry.prepIds.add(l.lmp_id);
    else if (l.role === "support") entry.supportIds.add(l.lmp_id);
    pocLinkIndex.set(l.poc_id, entry);
  }

  // Build POC rows
  const rows: PrepPocHeatmapRow[] = [];

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
    generatedAt: new Date().toISOString(),
  };
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
