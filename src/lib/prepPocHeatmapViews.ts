/**
 * Student-wise and Domain-wise aggregations for Prep POC Heatmap.
 * Reuses status mapping and link indexing conventions from prepPocHeatmapAgg.ts.
 */

import {
  buildHeatmapData,
  mapStatusToBucket,
  fmtConversion,
  type CandidateRaw,
  type LinkRaw,
  type PocRaw,
  type PrepPocHeatmapResponse,
  type StatusBucket,
} from "@/lib/prepPocHeatmapAgg";
import { buildHeatmapDrilldownSource, type PrepPocHeatmapDrilldownSource } from "@/lib/prepPocHeatmapDrilldown";

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

export type StudentWiseRow = {
  pocId: string;
  pocName: string;
  totalStudents: number;
  currentStudents: number;
  placedStudentsLoad: number;
  notStartedCount: number;
  prepOngoingCount: number;
  prepDoneCount: number;
  placedCount: number;
  notPlacedCount: number;
  onHoldCount: number;
  otherReasonsCount: number;
  placementRatePct: number | null;
  avgSessionsPerStudent: number | null;
};

export type StudentWiseSummary = {
  activePocCount: number;
  uniqueStudents: number;
  studentsPlaced: number;
  placedStudentsPct: number | null;
};

export type DomainWiseRow = {
  domainId: string;
  domainName: string;
  totalLmps: number;
  currentLmps: number;
  closedLmps: number;
  notStartedCount: number;
  prepOngoingCount: number;
  prepDoneCount: number;
  placedCount: number;
  notPlacedCount: number;
  onHoldCount: number;
  otherReasonsCount: number;
  studentsPlaced: number;
  placementRatePct: number | null;
  eligibleClosedCount: number;
  lmpConversionPercentage: number | null;
  convertedCount: number;
};

export type DomainWiseSummary = {
  activeDomains: number;
  totalLmps: number;
  totalStudents: number;
  studentsPlaced: number;
  placementRatePct: number | null;
  convertedLmpCount: number;
  eligibleClosedLmpCount: number;
  lmpConversionPct: number | null;
};

type HeatmapIndexes = ReturnType<typeof buildSharedIndexes>;

function buildSharedIndexes(pocs: PocRaw[], links: LinkRaw[], candidates: CandidateRaw[]) {
  const lmpStatusMap = new Map<string, StatusBucket>();
  const lmpDomainMap = new Map<string, string>();
  const lmpDomainDisplayMap = new Map<string, string>();
  const lmpDomainIdMap = new Map<string, string>();

  for (const l of links) {
    const id = l.lmp_id;
    if (!lmpStatusMap.has(id)) {
      lmpStatusMap.set(id, mapStatusToBucket(l.lmp_processes?.status));
    }
    if (!lmpDomainMap.has(id)) {
      const display = String(l.lmp_processes?.domains?.name ?? l.lmp_processes?.domain_raw ?? "").trim();
      const dn = norm(display);
      if (dn) {
        lmpDomainMap.set(id, dn);
        lmpDomainDisplayMap.set(id, display);
      }
    }
    if (!lmpDomainIdMap.has(id) && l.lmp_processes?.domain_id) {
      lmpDomainIdMap.set(id, l.lmp_processes.domain_id);
    }
  }

  const lmpStudentsMap = new Map<string, Set<string>>();
  const studentProfileMap = new Map<string, CandidateRaw["students"]>();
  for (const c of candidates) {
    if (!c.student_id || !c.lmp_id) continue;
    const s = lmpStudentsMap.get(c.lmp_id) ?? new Set<string>();
    s.add(c.student_id);
    lmpStudentsMap.set(c.lmp_id, s);
    if (!studentProfileMap.has(c.student_id) && c.students) {
      studentProfileMap.set(c.student_id, c.students);
    }
  }

  const activePrepPocIds = new Set(pocs.map((p) => p.id));
  type PocLinkEntry = { prepIds: Set<string>; supportIds: Set<string> };
  const pocLinkIndex = new Map<string, PocLinkEntry>();

  for (const l of links) {
    if (!activePrepPocIds.has(l.poc_id)) continue;
    const entry = pocLinkIndex.get(l.poc_id) ?? { prepIds: new Set(), supportIds: new Set() };
    if (l.role === "prep") entry.prepIds.add(l.lmp_id);
    else if (l.role === "support") entry.supportIds.add(l.lmp_id);
    pocLinkIndex.set(l.poc_id, entry);
  }

  return {
    lmpStatusMap,
    lmpDomainMap,
    lmpDomainDisplayMap,
    lmpDomainIdMap,
    lmpStudentsMap,
    studentProfileMap,
    pocLinkIndex,
    activePrepPocIds,
  };
}

type StudentClass = {
  prepStatus: "notStarted" | "prepOngoing" | "prepDone" | null;
  outcome: "placed" | "notPlaced" | "onHold" | "otherReasons" | null;
  isActive: boolean;
};

function classifyStudentStatuses(statuses: StatusBucket[]): StudentClass {
  const has = (b: StatusBucket) => statuses.includes(b);
  if (has("converted")) return { outcome: "placed", prepStatus: null, isActive: false };
  if (has("notConverted")) return { outcome: "notPlaced", prepStatus: null, isActive: false };
  if (has("otherReasons")) return { outcome: "otherReasons", prepStatus: null, isActive: false };
  if (has("onHold")) return { outcome: "onHold", prepStatus: null, isActive: false };

  const isActive = has("notStarted") || has("prepOngoing") || has("prepDone");
  let prepStatus: StudentClass["prepStatus"] = null;
  if (has("prepDone")) prepStatus = "prepDone";
  else if (has("prepOngoing")) prepStatus = "prepOngoing";
  else if (has("notStarted")) prepStatus = "notStarted";
  return { outcome: null, prepStatus, isActive };
}

function studentStatusesForPoc(
  pocId: string,
  studentId: string,
  idx: HeatmapIndexes,
): StatusBucket[] {
  const entry = idx.pocLinkIndex.get(pocId);
  if (!entry) return [];
  const totalIds = new Set([...entry.prepIds, ...entry.supportIds]);
  const buckets: StatusBucket[] = [];
  for (const lmpId of totalIds) {
    if (idx.lmpStudentsMap.get(lmpId)?.has(studentId)) {
      buckets.push(idx.lmpStatusMap.get(lmpId) ?? "unknown");
    }
  }
  return buckets;
}

function resolveStudentDomains(
  studentId: string,
  idx: HeatmapIndexes,
): Set<string> {
  const profile = idx.studentProfileMap.get(studentId);
  const domains = new Set<string>();
  [profile?.primary_domain, profile?.secondary_domain].forEach((d) => {
    const n = norm(d);
    if (n) domains.add(n);
  });
  return domains;
}

export function buildStudentWiseData(
  pocs: PocRaw[],
  links: LinkRaw[],
  candidates: CandidateRaw[],
): { summary: StudentWiseSummary; rows: StudentWiseRow[] } {
  const idx = buildSharedIndexes(pocs, links, candidates);
  const rows: StudentWiseRow[] = [];
  const globalStudents = new Set<string>();
  const globalPlaced = new Set<string>();

  for (const poc of pocs) {
    const entry = idx.pocLinkIndex.get(poc.id);
    if (!entry) continue;
    const totalIds = new Set([...entry.prepIds, ...entry.supportIds]);
    const pocStudents = new Set<string>();
    for (const lmpId of totalIds) {
      for (const sid of idx.lmpStudentsMap.get(lmpId) ?? []) pocStudents.add(sid);
    }
    if (!pocStudents.size) continue;

    const buckets = {
      total: new Set<string>(),
      current: new Set<string>(),
      placedLoad: new Set<string>(),
      notStarted: new Set<string>(),
      prepOngoing: new Set<string>(),
      prepDone: new Set<string>(),
      placed: new Set<string>(),
      notPlaced: new Set<string>(),
      onHold: new Set<string>(),
      otherReasons: new Set<string>(),
    };

    for (const studentId of pocStudents) {
      buckets.total.add(studentId);
      globalStudents.add(studentId);
      const cls = classifyStudentStatuses(studentStatusesForPoc(poc.id, studentId, idx));
      if (cls.isActive) buckets.current.add(studentId);
      if (cls.outcome === "placed") {
        buckets.placed.add(studentId);
        buckets.placedLoad.add(studentId);
        globalPlaced.add(studentId);
      } else if (cls.outcome === "notPlaced") buckets.notPlaced.add(studentId);
      else if (cls.outcome === "onHold") buckets.onHold.add(studentId);
      else if (cls.outcome === "otherReasons") buckets.otherReasons.add(studentId);
      if (cls.prepStatus === "notStarted") buckets.notStarted.add(studentId);
      if (cls.prepStatus === "prepOngoing") buckets.prepOngoing.add(studentId);
      if (cls.prepStatus === "prepDone") buckets.prepDone.add(studentId);
    }

    const placementRatePct =
      buckets.total.size > 0 ? (buckets.placed.size / buckets.total.size) * 100 : null;

    rows.push({
      pocId: poc.id,
      pocName: poc.name,
      totalStudents: buckets.total.size,
      currentStudents: buckets.current.size,
      placedStudentsLoad: buckets.placedLoad.size,
      notStartedCount: buckets.notStarted.size,
      prepOngoingCount: buckets.prepOngoing.size,
      prepDoneCount: buckets.prepDone.size,
      placedCount: buckets.placed.size,
      notPlacedCount: buckets.notPlaced.size,
      onHoldCount: buckets.onHold.size,
      otherReasonsCount: buckets.otherReasons.size,
      placementRatePct,
      avgSessionsPerStudent: null,
    });
  }

  rows.sort((a, b) => b.totalStudents - a.totalStudents || a.pocName.localeCompare(b.pocName));

  const activePocCount = rows.length;
  const uniqueStudents = globalStudents.size;
  const studentsPlaced = globalPlaced.size;

  return {
    summary: {
      activePocCount,
      uniqueStudents,
      studentsPlaced,
      placedStudentsPct: uniqueStudents > 0 ? (studentsPlaced / uniqueStudents) * 100 : null,
    },
    rows,
  };
}

export function buildDomainWiseData(
  pocs: PocRaw[],
  links: LinkRaw[],
  candidates: CandidateRaw[],
): { summary: DomainWiseSummary; rows: DomainWiseRow[] } {
  const idx = buildSharedIndexes(pocs, links, candidates);

  type DomainAcc = {
    domainId: string;
    domainName: string;
    lmpIds: Set<string>;
    byBucket: Record<StatusBucket, Set<string>>;
    placedStudents: Set<string>;
    optedStudents: Set<string>;
    notPlacedStudents: Set<string>;
    onHoldStudents: Set<string>;
    otherStudents: Set<string>;
  };

  const byDomain = new Map<string, DomainAcc>();
  const getDomain = (key: string, displayName: string, domainId = key) => {
    const existing = byDomain.get(key);
    if (existing) return existing;
    const next: DomainAcc = {
      domainId,
      domainName: displayName,
      lmpIds: new Set(),
      byBucket: {
        notStarted: new Set(),
        prepOngoing: new Set(),
        prepDone: new Set(),
        onHold: new Set(),
        converted: new Set(),
        notConverted: new Set(),
        otherReasons: new Set(),
        unknown: new Set(),
      },
      placedStudents: new Set(),
      optedStudents: new Set(),
      notPlacedStudents: new Set(),
      onHoldStudents: new Set(),
      otherStudents: new Set(),
    };
    byDomain.set(key, next);
    return next;
  };

  const scopedLmpIds = new Set<string>();
  for (const l of links) scopedLmpIds.add(l.lmp_id);

  for (const lmpId of scopedLmpIds) {
    const domainKey = idx.lmpDomainMap.get(lmpId) || "unmapped";
    const domainId = idx.lmpDomainIdMap.get(lmpId) || domainKey;
    const displayName = idx.lmpDomainDisplayMap.get(lmpId)
      || (domainKey === "unmapped" ? "Unmapped" : domainKey);
    const row = getDomain(domainKey, displayName, domainId);
    row.lmpIds.add(lmpId);
    const bucket = idx.lmpStatusMap.get(lmpId) ?? "unknown";
    row.byBucket[bucket].add(lmpId);

    if (bucket === "converted") {
      for (const sid of idx.lmpStudentsMap.get(lmpId) ?? []) row.placedStudents.add(sid);
    }
  }

  for (const studentId of idx.studentProfileMap.keys()) {
    const domains = resolveStudentDomains(studentId, idx);
    domains.forEach((d) => getDomain(d, d).optedStudents.add(studentId));
  }

  for (const [domainKey, row] of byDomain.entries()) {
    for (const lmpId of row.lmpIds) {
      for (const sid of idx.lmpStudentsMap.get(lmpId) ?? []) {
        if (!row.optedStudents.has(sid)) row.optedStudents.add(sid);
        const bucket = idx.lmpStatusMap.get(lmpId) ?? "unknown";
        if (bucket === "notConverted") row.notPlacedStudents.add(sid);
        if (bucket === "onHold") row.onHoldStudents.add(sid);
        if (bucket === "otherReasons") row.otherStudents.add(sid);
      }
    }
    void domainKey;
  }

  const globalLmps = new Set<string>();
  const globalOpted = new Set<string>();
  const globalPlaced = new Set<string>();

  const rows: DomainWiseRow[] = [];
  for (const row of byDomain.values()) {
    if (!row.lmpIds.size && !row.optedStudents.size) continue;

    row.lmpIds.forEach((id) => globalLmps.add(id));
    row.optedStudents.forEach((id) => globalOpted.add(id));
    row.placedStudents.forEach((id) => globalPlaced.add(id));

    const notStartedCount = row.byBucket.notStarted.size;
    const prepOngoingCount = row.byBucket.prepOngoing.size;
    const prepDoneCount = row.byBucket.prepDone.size;
    const convertedCount = row.byBucket.converted.size;
    const notConvertedCount = row.byBucket.notConverted.size;
    const onHoldCount = row.byBucket.onHold.size;
    const otherReasonsCount = row.byBucket.otherReasons.size;
    const currentLmps = notStartedCount + prepOngoingCount + prepDoneCount;
    const closedLmps = convertedCount + notConvertedCount + onHoldCount + otherReasonsCount;
    const eligibleClosedCount = convertedCount + notConvertedCount + otherReasonsCount;
    const lmpConversionPercentage =
      eligibleClosedCount > 0 ? (convertedCount / eligibleClosedCount) * 100 : null;
    const placementRatePct =
      row.optedStudents.size > 0 ? (row.placedStudents.size / row.optedStudents.size) * 100 : null;

    rows.push({
      domainId: row.domainId,
      domainName: row.domainName,
      totalLmps: row.lmpIds.size,
      currentLmps,
      closedLmps,
      notStartedCount,
      prepOngoingCount,
      prepDoneCount,
      placedCount: row.placedStudents.size,
      notPlacedCount: row.notPlacedStudents.size,
      onHoldCount: row.onHoldStudents.size,
      otherReasonsCount: row.otherStudents.size,
      studentsPlaced: row.placedStudents.size,
      placementRatePct,
      eligibleClosedCount,
      lmpConversionPercentage,
      convertedCount,
    });
  }

  rows.sort((a, b) => b.totalLmps - a.totalLmps || a.domainName.localeCompare(b.domainName));

  let globalConverted = 0;
  let globalEligible = 0;
  for (const lmpId of globalLmps) {
    const bucket = idx.lmpStatusMap.get(lmpId) ?? "unknown";
    if (bucket === "converted") globalConverted++;
    if (bucket === "converted" || bucket === "notConverted" || bucket === "otherReasons") globalEligible++;
  }

  return {
    summary: {
      activeDomains: rows.length,
      totalLmps: globalLmps.size,
      totalStudents: globalOpted.size,
      studentsPlaced: globalPlaced.size,
      placementRatePct: globalOpted.size > 0 ? (globalPlaced.size / globalOpted.size) * 100 : null,
      convertedLmpCount: globalConverted,
      eligibleClosedLmpCount: globalEligible,
      lmpConversionPct: globalEligible > 0 ? (globalConverted / globalEligible) * 100 : null,
    },
    rows,
  };
}

export type FullPrepPocHeatmapResponse = PrepPocHeatmapResponse & {
  studentSummary: StudentWiseSummary;
  studentRows: StudentWiseRow[];
  domainSummary: DomainWiseSummary;
  domainRows: DomainWiseRow[];
  drilldownSource: PrepPocHeatmapDrilldownSource;
};

export function buildFullHeatmapData(
  pocs: PocRaw[],
  links: LinkRaw[],
  candidates: CandidateRaw[],
  scopeLmpIds?: Set<string>,
): FullPrepPocHeatmapResponse {
  const scope = scopeLmpIds && scopeLmpIds.size > 0 ? scopeLmpIds : null;
  const scopedLinks = scope ? links.filter((l) => scope.has(l.lmp_id)) : links;
  const scopedCandidates = scope ? candidates.filter((c) => scope.has(c.lmp_id)) : candidates;

  const lmp = buildHeatmapData(pocs, scopedLinks, scopedCandidates);
  const student = buildStudentWiseData(pocs, scopedLinks, scopedCandidates);
  const domain = buildDomainWiseData(pocs, scopedLinks, scopedCandidates);

  return {
    ...lmp,
    studentSummary: student.summary,
    studentRows: student.rows,
    domainSummary: domain.summary,
    domainRows: domain.rows,
    drilldownSource: buildHeatmapDrilldownSource(pocs, scopedLinks, scopedCandidates, lmp.source),
  };
}
