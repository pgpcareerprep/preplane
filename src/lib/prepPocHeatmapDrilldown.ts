/**
 * Drilldown record builders and filters for Student-wise and Domain-wise
 * Prep POC Heatmap views. Reuses status mapping from prepPocHeatmapAgg.ts.
 */

import {
  mapStatusToBucket,
  statusBucketLabel,
  type CandidateRaw,
  type HeatmapDrilldownLmpRecord,
  type HeatmapDrilldownStudentRecord,
  type LinkRaw,
  type PocRaw,
  type PrepPocHeatmapSource,
  type StatusBucket,
} from "@/lib/prepPocHeatmapAgg";
import type { FullPrepPocHeatmapResponse } from "@/lib/prepPocHeatmapViews";

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

// ── Metric keys ───────────────────────────────────────────────────────────────

export type StudentWiseMetricKey =
  | "totalStudents"
  | "currentStudents"
  | "placedStudentsLoad"
  | "notStartedCount"
  | "prepOngoingCount"
  | "prepDoneCount"
  | "placedCount"
  | "notPlacedCount"
  | "onHoldCount"
  | "otherReasonsCount";

export type DomainWiseMetricKey =
  | "totalLmps"
  | "currentLmps"
  | "closedLmps"
  | "notStartedCount"
  | "prepOngoingCount"
  | "prepDoneCount"
  | "placedCount"
  | "notPlacedCount"
  | "onHoldCount"
  | "otherReasonsCount"
  | "studentsPlaced"
  | "lmpConversion";

export const STUDENT_WISE_METRIC_LABELS: Record<StudentWiseMetricKey, string> = {
  totalStudents: "Total Students",
  currentStudents: "Current Students",
  placedStudentsLoad: "Placed Students",
  notStartedCount: "Not Started",
  prepOngoingCount: "Prep Ongoing",
  prepDoneCount: "Prep Done",
  placedCount: "Placed",
  notPlacedCount: "Not Placed",
  onHoldCount: "On hold",
  otherReasonsCount: "Other reasons",
};

export const DOMAIN_WISE_METRIC_LABELS: Record<DomainWiseMetricKey, string> = {
  totalLmps: "Total LMPs",
  currentLmps: "Current LMPs",
  closedLmps: "Closed LMPs",
  notStartedCount: "Not Started",
  prepOngoingCount: "Prep Ongoing",
  prepDoneCount: "Prep Done",
  placedCount: "Placed",
  notPlacedCount: "Not Placed",
  onHoldCount: "On hold",
  otherReasonsCount: "Other reasons",
  studentsPlaced: "Students Placed",
  lmpConversion: "LMP Conversion",
};

export function isStudentWiseMetricClickable(dataKey: string): dataKey is StudentWiseMetricKey {
  return dataKey in STUDENT_WISE_METRIC_LABELS;
}

export function isDomainWiseMetricClickable(dataKey: string): dataKey is DomainWiseMetricKey {
  return dataKey in DOMAIN_WISE_METRIC_LABELS;
}

// ── Extended record types ─────────────────────────────────────────────────────

export type HeatmapDrilldownStudentWiseRecord = HeatmapDrilldownStudentRecord & {
  matchingBucket: string;
  lastUpdated: string;
};

export type HeatmapDrilldownDomainLmpRecord = HeatmapDrilldownLmpRecord & {
  domainId: string;
  domainName: string;
};

export type HeatmapDrilldownDomainStudentRecord = HeatmapDrilldownStudentRecord & {
  domainId: string;
  domainName: string;
  matchingDomain: string;
  outcomeStatus: string;
  lastUpdated: string;
};

export type PrepPocHeatmapDrilldownSource = {
  studentWise: HeatmapDrilldownStudentWiseRecord[];
  domainLmps: HeatmapDrilldownDomainLmpRecord[];
  domainStudents: HeatmapDrilldownDomainStudentRecord[];
};

export type HeatmapDrilldownFilterResult = {
  recordType: "lmp" | "student" | "conversion";
  lmps: HeatmapDrilldownLmpRecord[];
  students: HeatmapDrilldownStudentRecord[];
  denominatorLmps?: HeatmapDrilldownLmpRecord[];
  convertedLmps?: HeatmapDrilldownLmpRecord[];
};

// ── Shared indexes (mirrors prepPocHeatmapViews) ──────────────────────────────

type HeatmapIndexes = {
  lmpStatusMap: Map<string, StatusBucket>;
  lmpDomainMap: Map<string, string>;
  lmpDomainDisplayMap: Map<string, string>;
  lmpDomainIdMap: Map<string, string>;
  lmpStudentsMap: Map<string, Set<string>>;
  studentProfileMap: Map<string, CandidateRaw["students"]>;
  candidateByStudentLmp: Map<string, CandidateRaw>;
  pocLinkIndex: Map<string, { prepIds: Set<string>; supportIds: Set<string> }>;
  lmpDetailsById: Map<string, NonNullable<LinkRaw["lmp_processes"]>>;
  pocNameById: Map<string, string>;
  primaryPocsByLmp: Map<string, string>;
  supportPocsByLmp: Map<string, string>;
};

function buildIndexes(pocs: PocRaw[], links: LinkRaw[], candidates: CandidateRaw[]): HeatmapIndexes {
  const lmpStatusMap = new Map<string, StatusBucket>();
  const lmpDomainMap = new Map<string, string>();
  const lmpDomainDisplayMap = new Map<string, string>();
  const lmpDomainIdMap = new Map<string, string>();
  const lmpDetailsById = new Map<string, NonNullable<LinkRaw["lmp_processes"]>>();

  for (const l of links) {
    const id = l.lmp_id;
    if (!lmpStatusMap.has(id)) lmpStatusMap.set(id, mapStatusToBucket(l.lmp_processes?.status));
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
    if (l.lmp_processes && !lmpDetailsById.has(id)) lmpDetailsById.set(id, l.lmp_processes);
  }

  const lmpStudentsMap = new Map<string, Set<string>>();
  const studentProfileMap = new Map<string, CandidateRaw["students"]>();
  const candidateByStudentLmp = new Map<string, CandidateRaw>();
  for (const c of candidates) {
    if (!c.student_id || !c.lmp_id) continue;
    const s = lmpStudentsMap.get(c.lmp_id) ?? new Set<string>();
    s.add(c.student_id);
    lmpStudentsMap.set(c.lmp_id, s);
    if (!studentProfileMap.has(c.student_id) && c.students) {
      studentProfileMap.set(c.student_id, c.students);
    }
    candidateByStudentLmp.set(`${c.student_id}:${c.lmp_id}`, c);
  }

  const activePrepPocIds = new Set(pocs.map((p) => p.id));
  const pocLinkIndex = new Map<string, { prepIds: Set<string>; supportIds: Set<string> }>();
  const pocNameById = new Map(pocs.map((p) => [p.id, p.name]));

  for (const l of links) {
    if (!activePrepPocIds.has(l.poc_id)) continue;
    const entry = pocLinkIndex.get(l.poc_id) ?? { prepIds: new Set(), supportIds: new Set() };
    if (l.role === "prep") entry.prepIds.add(l.lmp_id);
    else if (l.role === "support") entry.supportIds.add(l.lmp_id);
    pocLinkIndex.set(l.poc_id, entry);
  }

  const primaryPocsByLmp = buildRoleNamesByLmp(links, "prep", pocNameById);
  const supportPocsByLmp = buildRoleNamesByLmp(links, "support", pocNameById);

  return {
    lmpStatusMap,
    lmpDomainMap,
    lmpDomainDisplayMap,
    lmpDomainIdMap,
    lmpStudentsMap,
    studentProfileMap,
    candidateByStudentLmp,
    pocLinkIndex,
    lmpDetailsById,
    pocNameById,
    primaryPocsByLmp,
    supportPocsByLmp,
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

function studentLmpsForPoc(pocId: string, studentId: string, idx: HeatmapIndexes): string[] {
  const entry = idx.pocLinkIndex.get(pocId);
  if (!entry) return [];
  const totalIds = new Set([...entry.prepIds, ...entry.supportIds]);
  const out: string[] = [];
  for (const lmpId of totalIds) {
    if (idx.lmpStudentsMap.get(lmpId)?.has(studentId)) out.push(lmpId);
  }
  return out;
}

function pickRepresentativeLmp(
  lmpIds: string[],
  cls: StudentClass,
  idx: HeatmapIndexes,
): string | null {
  if (!lmpIds.length) return null;
  const bucketForOutcome = (o: StudentClass["outcome"]): StatusBucket | null => {
    if (o === "placed") return "converted";
    if (o === "notPlaced") return "notConverted";
    if (o === "onHold") return "onHold";
    if (o === "otherReasons") return "otherReasons";
    return null;
  };
  const bucketForPrep = (p: StudentClass["prepStatus"]): StatusBucket | null => {
    if (p === "notStarted") return "notStarted";
    if (p === "prepOngoing") return "prepOngoing";
    if (p === "prepDone") return "prepDone";
    return null;
  };

  const target = cls.outcome ? bucketForOutcome(cls.outcome) : bucketForPrep(cls.prepStatus);
  if (target) {
    const match = lmpIds.find((id) => (idx.lmpStatusMap.get(id) ?? "unknown") === target);
    if (match) return match;
  }
  return lmpIds[0];
}

function matchingBucketLabel(cls: StudentClass): string {
  if (cls.outcome === "placed") return "Placed";
  if (cls.outcome === "notPlaced") return "Not Placed";
  if (cls.outcome === "onHold") return "On hold";
  if (cls.outcome === "otherReasons") return "Other reasons";
  if (cls.prepStatus === "notStarted") return "Not Started";
  if (cls.prepStatus === "prepOngoing") return "Prep Ongoing";
  if (cls.prepStatus === "prepDone") return "Prep Done";
  return "Unknown";
}

function buildStudentRecord(
  pocId: string,
  pocName: string,
  studentId: string,
  lmpId: string,
  matchingBucket: string,
  idx: HeatmapIndexes,
): HeatmapDrilldownStudentWiseRecord {
  const details = idx.lmpDetailsById.get(lmpId);
  const candidate = idx.candidateByStudentLmp.get(`${studentId}:${lmpId}`);
  const profile = idx.studentProfileMap.get(studentId);
  const domain = details?.domains?.name || details?.domain_raw || "";
  const bucket = idx.lmpStatusMap.get(lmpId) ?? "unknown";

  return {
    pocId,
    pocName,
    studentId,
    studentName: profile?.name || candidate?.student_name || studentId,
    studentCode: profile?.roll_no || candidate?.roll_no || profile?.student_code || "",
    email: profile?.email || "",
    phone: profile?.phone || "",
    cohort: profile?.cohort || "",
    primaryDomain: profile?.primary_domain || "",
    secondaryDomain: profile?.secondary_domain || "",
    lmpId,
    lmpCode: details?.lmp_code || "",
    company: details?.company || "",
    role: details?.role || "",
    domain,
    placementStatus: profile?.placement_status || (bucket === "converted" ? "Converted" : statusBucketLabel(bucket)),
    placementDate: details?.updated_at || details?.created_at || "",
    primaryPoc: idx.primaryPocsByLmp.get(lmpId) || "",
    supportPoc: idx.supportPocsByLmp.get(lmpId) || "",
    matchingBucket,
    lastUpdated: details?.updated_at || details?.created_at || "",
  };
}

function domainKeyForLmp(lmpId: string, idx: HeatmapIndexes): { key: string; id: string; name: string } {
  const key = idx.lmpDomainMap.get(lmpId) || "unmapped";
  const id = idx.lmpDomainIdMap.get(lmpId) || key;
  const name = idx.lmpDomainDisplayMap.get(lmpId) || (key === "unmapped" ? "Unmapped" : key);
  return { key, id, name };
}

// ── Source builder ────────────────────────────────────────────────────────────

export function buildHeatmapDrilldownSource(
  pocs: PocRaw[],
  links: LinkRaw[],
  candidates: CandidateRaw[],
  lmpSource: PrepPocHeatmapSource,
): PrepPocHeatmapDrilldownSource {
  const idx = buildIndexes(pocs, links, candidates);
  const studentWise: HeatmapDrilldownStudentWiseRecord[] = [];
  const domainLmps: HeatmapDrilldownDomainLmpRecord[] = [];
  const domainStudents: HeatmapDrilldownDomainStudentRecord[] = [];
  const seenDomainLmps = new Set<string>();
  const seenDomainStudents = new Set<string>();

  for (const poc of pocs) {
    const entry = idx.pocLinkIndex.get(poc.id);
    if (!entry) continue;
    const totalIds = new Set([...entry.prepIds, ...entry.supportIds]);
    const pocStudents = new Set<string>();
    for (const lmpId of totalIds) {
      for (const sid of idx.lmpStudentsMap.get(lmpId) ?? []) pocStudents.add(sid);
    }

    for (const studentId of pocStudents) {
      const lmpIds = studentLmpsForPoc(poc.id, studentId, idx);
      const statuses = lmpIds.map((id) => idx.lmpStatusMap.get(id) ?? "unknown");
      const cls = classifyStudentStatuses(statuses);
      const repLmp = pickRepresentativeLmp(lmpIds, cls, idx);
      if (!repLmp) continue;
      studentWise.push(
        buildStudentRecord(poc.id, poc.name, studentId, repLmp, matchingBucketLabel(cls), idx),
      );
    }
  }

  const lmpById = new Map(lmpSource.lmps.map((r) => [r.lmpId, r]));
  const scopedLmpIds = new Set(links.map((l) => l.lmp_id));

  for (const lmpId of scopedLmpIds) {
    const { id: domainId, name: domainName } = domainKeyForLmp(lmpId, idx);
    const base = lmpById.get(lmpId);
    if (!base) continue;
    const dedupeKey = `${domainId}:${lmpId}`;
    if (!seenDomainLmps.has(dedupeKey)) {
      seenDomainLmps.add(dedupeKey);
      domainLmps.push({ ...base, domainId, domainName, pocId: "", pocName: "" });
    }

    const bucket = idx.lmpStatusMap.get(lmpId) ?? "unknown";
    for (const studentId of idx.lmpStudentsMap.get(lmpId) ?? []) {
      const studentKey = `${domainId}:${studentId}:${bucket}`;
      if (seenDomainStudents.has(studentKey)) continue;
      seenDomainStudents.add(studentKey);

      const candidate = idx.candidateByStudentLmp.get(`${studentId}:${lmpId}`);
      const profile = idx.studentProfileMap.get(studentId);
      const details = idx.lmpDetailsById.get(lmpId);
      const matchingDomain = domainName;
      let outcomeStatus = statusBucketLabel(bucket);
      if (bucket === "converted") outcomeStatus = "Placed";
      else if (bucket === "notConverted") outcomeStatus = "Not Placed";

      domainStudents.push({
        pocId: "",
        pocName: "",
        studentId,
        studentName: profile?.name || candidate?.student_name || studentId,
        studentCode: profile?.roll_no || candidate?.roll_no || profile?.student_code || "",
        email: profile?.email || "",
        phone: profile?.phone || "",
        cohort: profile?.cohort || "",
        primaryDomain: profile?.primary_domain || "",
        secondaryDomain: profile?.secondary_domain || "",
        lmpId,
        lmpCode: details?.lmp_code || "",
        company: details?.company || "",
        role: details?.role || "",
        domain: matchingDomain,
        placementStatus: profile?.placement_status || outcomeStatus,
        placementDate: details?.updated_at || details?.created_at || "",
        primaryPoc: idx.primaryPocsByLmp.get(lmpId) || "",
        supportPoc: idx.supportPocsByLmp.get(lmpId) || "",
        domainId,
        domainName,
        matchingDomain,
        outcomeStatus,
        lastUpdated: details?.updated_at || details?.created_at || "",
      });
    }
  }

  return { studentWise, domainLmps, domainStudents };
}

// ── Filter helpers ────────────────────────────────────────────────────────────

function emptyResult(recordType: "lmp" | "student" | "conversion" = "lmp"): HeatmapDrilldownFilterResult {
  return { recordType, lmps: [], students: [], denominatorLmps: [], convertedLmps: [] };
}

function matchesStudentMetric(record: HeatmapDrilldownStudentWiseRecord, metricKey: StudentWiseMetricKey): boolean {
  const bucket = record.matchingBucket;
  switch (metricKey) {
    case "totalStudents":
      return true;
    case "currentStudents":
      return ["Not Started", "Prep Ongoing", "Prep Done"].includes(bucket);
    case "placedStudentsLoad":
    case "placedCount":
      return bucket === "Placed";
    case "notStartedCount":
      return bucket === "Not Started";
    case "prepOngoingCount":
      return bucket === "Prep Ongoing";
    case "prepDoneCount":
      return bucket === "Prep Done";
    case "notPlacedCount":
      return bucket === "Not Placed";
    case "onHoldCount":
      return bucket === "On hold";
    case "otherReasonsCount":
      return bucket === "Other reasons";
    default:
      return false;
  }
}

export function filterStudentWiseMetricRecords(
  data: FullPrepPocHeatmapResponse,
  pocId: string,
  metricKey: StudentWiseMetricKey,
): HeatmapDrilldownFilterResult {
  const source = data.drilldownSource;
  if (!source) return emptyResult("student");

  const seen = new Set<string>();
  const students = source.studentWise.filter((record) => {
    if (record.pocId !== pocId) return false;
    if (!matchesStudentMetric(record, metricKey)) return false;
    if (seen.has(record.studentId)) return false;
    seen.add(record.studentId);
    return true;
  });

  return { recordType: "student", lmps: [], students, denominatorLmps: [], convertedLmps: [] };
}

function recordsForDomain<T extends { domainId: string; domainName: string }>(
  records: T[],
  domainId: string,
  domainRows: FullPrepPocHeatmapResponse["domainRows"],
): T[] {
  const row = domainRows.find((r) => r.domainId === domainId);
  if (!row) return records.filter((r) => r.domainId === domainId);
  const nameKey = norm(row.domainName);
  return records.filter(
    (r) => r.domainId === domainId || norm(r.domainName) === nameKey || r.domainId === nameKey,
  );
}

function filterDomainLmps(
  source: PrepPocHeatmapDrilldownSource,
  domainId: string,
  domainRows: FullPrepPocHeatmapResponse["domainRows"],
  predicate: (r: HeatmapDrilldownDomainLmpRecord) => boolean,
): HeatmapDrilldownLmpRecord[] {
  const seen = new Set<string>();
  return recordsForDomain(source.domainLmps, domainId, domainRows).filter((record) => {
    if (!predicate(record)) return false;
    if (seen.has(record.lmpId)) return false;
    seen.add(record.lmpId);
    return true;
  });
}

function filterDomainStudents(
  source: PrepPocHeatmapDrilldownSource,
  domainId: string,
  domainRows: FullPrepPocHeatmapResponse["domainRows"],
  predicate: (r: HeatmapDrilldownDomainStudentRecord) => boolean,
): HeatmapDrilldownStudentRecord[] {
  const seen = new Set<string>();
  return recordsForDomain(source.domainStudents, domainId, domainRows).filter((record) => {
    if (!predicate(record)) return false;
    if (seen.has(record.studentId)) return false;
    seen.add(record.studentId);
    return true;
  });
}

export function filterDomainWiseMetricRecords(
  data: FullPrepPocHeatmapResponse,
  domainId: string,
  metricKey: DomainWiseMetricKey,
): HeatmapDrilldownFilterResult {
  const source = data.drilldownSource;
  if (!source) return emptyResult();

  const isCurrent = (b: StatusBucket) =>
    b === "notStarted" || b === "prepOngoing" || b === "prepDone";
  const isClosed = (b: StatusBucket) =>
    b === "converted" || b === "notConverted" || b === "onHold" || b === "otherReasons";

  if (metricKey === "lmpConversion") {
    const denominatorLmps = filterDomainLmps(source, domainId, data.domainRows, (r) =>
      r.statusBucket === "converted" || r.statusBucket === "notConverted" || r.statusBucket === "otherReasons",
    );
    const convertedLmps = denominatorLmps.filter((r) => r.statusBucket === "converted");
    return {
      recordType: "conversion",
      lmps: denominatorLmps,
      students: [],
      denominatorLmps,
      convertedLmps,
    };
  }

  const studentMetrics: DomainWiseMetricKey[] = [
    "placedCount", "notPlacedCount", "onHoldCount", "otherReasonsCount", "studentsPlaced",
  ];
  if (studentMetrics.includes(metricKey)) {
    const predicate = (r: HeatmapDrilldownDomainStudentRecord) => {
      switch (metricKey) {
        case "placedCount":
        case "studentsPlaced":
          return r.outcomeStatus === "Placed";
        case "notPlacedCount":
          return r.outcomeStatus === "Not Placed";
        case "onHoldCount":
          return r.outcomeStatus === "On hold";
        case "otherReasonsCount":
          return r.outcomeStatus === "Other reasons";
        default:
          return false;
      }
    };
    return {
      recordType: "student",
      lmps: [],
      students: filterDomainStudents(source, domainId, data.domainRows, predicate),
      denominatorLmps: [],
      convertedLmps: [],
    };
  }

  const lmps = filterDomainLmps(source, domainId, data.domainRows, (r) => {
    switch (metricKey) {
      case "totalLmps":
        return true;
      case "currentLmps":
        return isCurrent(r.statusBucket);
      case "closedLmps":
        return isClosed(r.statusBucket);
      case "notStartedCount":
        return r.statusBucket === "notStarted";
      case "prepOngoingCount":
        return r.statusBucket === "prepOngoing";
      case "prepDoneCount":
        return r.statusBucket === "prepDone";
      default:
        return false;
    }
  });

  return { recordType: "lmp", lmps, students: [], denominatorLmps: [], convertedLmps: [] };
}
