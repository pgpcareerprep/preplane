/** Pure conversion-report aggregation for Copilot fast paths (no React/Deno deps). */

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
  if (s === "not-converted" || s === "not converted") return "notConverted";
  if (s === "other-reasons" || s === "dormant" || s === "closed" || s === "converted-na") return "otherReasons";
  return "unknown";
}

const OPTED_OUT = new Set([
  "opted out", "opt out", "opted-out", "opt-out", "placement opt out",
  "withdrawn", "not participating", "deferred", "defaulted",
  "dropout", "drop out", "dropped out", "not interested",
]);

function isOptedOut(status: string | null | undefined): boolean {
  return OPTED_OUT.has(norm(status));
}

function domainName(raw: string | null | undefined, nested?: { name?: string | null } | null): string {
  const fromNested = String(nested?.name ?? "").trim();
  if (fromNested) return fromNested;
  const fromRaw = String(raw ?? "").trim();
  return fromRaw || "Unspecified";
}

function domainKey(raw: string | null | undefined, nested?: { name?: string | null } | null): string {
  return norm(domainName(raw, nested)) || "unspecified";
}

function pct(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.round((n / d) * 1000) / 10;
}

function fmtPct(v: number | null): string {
  return v === null ? "—" : `${v}%`;
}

/** LMP process conversion: Converted ÷ (Total − closed). `closed` = other-reasons bucket. */
export function calculateLmpProcessConversionPct(
  converted: number,
  total: number,
  closedCount: number,
): number | null {
  return pct(converted, total - closedCount);
}

/** POC performance conversion: Converted ÷ (Converted + Not Converted). */
export function calculatePocPerformanceConversionPct(
  converted: number,
  notConverted: number,
): number | null {
  return pct(converted, converted + notConverted);
}

export type LmpConversionBuckets = {
  converted: number;
  notConverted: number;
  closed: number;
  total: number;
  lmpProcessDenominator: number;
  pocPerformanceDenominator: number;
  lmpProcessConversionPct: number | null;
  pocPerformanceConversionPct: number | null;
};

export function tallyLmpConversionBuckets(
  statuses: Iterable<string | null | undefined>,
): LmpConversionBuckets {
  let converted = 0;
  let notConverted = 0;
  let closed = 0;
  let total = 0;
  for (const raw of statuses) {
    total += 1;
    const bucket = mapStatusToBucket(raw);
    if (bucket === "converted") converted += 1;
    else if (bucket === "notConverted") notConverted += 1;
    else if (bucket === "otherReasons") closed += 1;
  }
  const lmpProcessDenominator = total - closed;
  const pocPerformanceDenominator = converted + notConverted;
  return {
    converted,
    notConverted,
    closed,
    total,
    lmpProcessDenominator,
    pocPerformanceDenominator,
    lmpProcessConversionPct: calculateLmpProcessConversionPct(converted, total, closed),
    pocPerformanceConversionPct: calculatePocPerformanceConversionPct(converted, notConverted),
  };
}

export function formatLmpProcessConversionRate(buckets: LmpConversionBuckets): string {
  if (buckets.lmpProcessDenominator <= 0 || buckets.lmpProcessConversionPct === null) return "—";
  return `${buckets.converted}/${buckets.lmpProcessDenominator} - ${buckets.lmpProcessConversionPct}%`;
}

export function formatPocPerformanceConversionRate(buckets: LmpConversionBuckets): string {
  if (buckets.pocPerformanceDenominator <= 0 || buckets.pocPerformanceConversionPct === null) return "—";
  return `${buckets.converted}/${buckets.pocPerformanceDenominator} - ${buckets.pocPerformanceConversionPct}%`;
}

export type ConversionReportPocRow = {
  pocName: string;
  eligibleClosed: number;
  converted: number;
  lmpConversionPct: number | null;
  studentsPlaced: number;
};

export type ConversionReportDomainRow = {
  domain: string;
  totalLmps: number;
  eligibleClosed: number;
  convertedLmps: number;
  lmpConversionPct: number | null;
  studentsOpted: number;
  studentsPlaced: number;
  studentPlacementConversionPct: number | null;
};

export type ConversionReport = {
  summary: {
    totalLmps: number;
    eligibleClosedLmps: number;
    convertedLmps: number;
    lmpConversionPct: number | null;
    studentsOpted: number;
    studentsPlaced: number;
    studentPlacementConversionPct: number | null;
    activePocCount: number;
  };
  pocRows: ConversionReportPocRow[];
  domainRows: ConversionReportDomainRow[];
};

type PocRaw = {
  id: string;
  name: string;
  primary_domain?: string | null;
  domain_tags?: string[] | null;
  role_type?: string | null;
  status?: string | null;
};

export type LinkRaw = {
  poc_id: string;
  role: string;
  lmp_id: string;
  lmp_processes?: {
    status?: string | null;
    domain_raw?: string | null;
    domains?: { name?: string | null } | null;
  } | null;
};

type CandidateRaw = { lmp_id: string; student_id: string | null };

type StudentRaw = {
  id?: string | null;
  name?: string | null;
  primary_domain?: string | null;
  secondary_domain?: string | null;
  placement_status?: string | null;
};

export type LmpRaw = {
  id: string;
  status?: string | null;
  domain_raw?: string | null;
  domains?: { name?: string | null } | null;
};

export function buildConversionReport(
  pocs: PocRaw[],
  links: LinkRaw[],
  candidates: CandidateRaw[],
  students: StudentRaw[],
  allLmps: LmpRaw[],
): ConversionReport {
  const activePocs = pocs.filter((p) =>
    (p.status ?? "active") === "active" && p.role_type !== "outreach_poc",
  );
  const activePocIds = new Set(activePocs.map((p) => p.id));

  const lmpStatusMap = new Map<string, StatusBucket>();
  const lmpDomainMap = new Map<string, string>();
  const lmpDomainLabelMap = new Map<string, string>();
  for (const l of links) {
    if (!lmpStatusMap.has(l.lmp_id)) {
      lmpStatusMap.set(l.lmp_id, mapStatusToBucket(l.lmp_processes?.status));
    }
    if (!lmpDomainMap.has(l.lmp_id)) {
      const label = domainName(l.lmp_processes?.domain_raw, l.lmp_processes?.domains);
      lmpDomainMap.set(l.lmp_id, domainKey(l.lmp_processes?.domain_raw, l.lmp_processes?.domains));
      lmpDomainLabelMap.set(l.lmp_id, label);
    }
  }
  for (const lmp of allLmps) {
    if (!lmpStatusMap.has(lmp.id)) {
      lmpStatusMap.set(lmp.id, mapStatusToBucket(lmp.status));
    }
    if (!lmpDomainMap.has(lmp.id)) {
      const label = domainName(lmp.domain_raw, lmp.domains);
      lmpDomainMap.set(lmp.id, domainKey(lmp.domain_raw, lmp.domains));
      lmpDomainLabelMap.set(lmp.id, label);
    }
  }

  const lmpStudentsMap = new Map<string, Set<string>>();
  for (const c of candidates) {
    if (!c.student_id || !c.lmp_id) continue;
    const set = lmpStudentsMap.get(c.lmp_id) ?? new Set<string>();
    set.add(c.student_id);
    lmpStudentsMap.set(c.lmp_id, set);
  }

  type PocEntry = { prepIds: Set<string>; supportIds: Set<string> };
  const pocLinkIndex = new Map<string, PocEntry>();
  for (const l of links) {
    if (!activePocIds.has(l.poc_id)) continue;
    const entry = pocLinkIndex.get(l.poc_id) ?? { prepIds: new Set<string>(), supportIds: new Set<string>() };
    if (l.role === "prep") entry.prepIds.add(l.lmp_id);
    else if (l.role === "support") entry.supportIds.add(l.lmp_id);
    pocLinkIndex.set(l.poc_id, entry);
  }

  const scopedLmpIds = new Set<string>();
  for (const [pocId, entry] of pocLinkIndex.entries()) {
    if (!activePocIds.has(pocId)) continue;
    for (const id of entry.prepIds) scopedLmpIds.add(id);
    for (const id of entry.supportIds) scopedLmpIds.add(id);
  }

  const globalPlacedStudents = new Set<string>();
  let globalConverted = 0;
  let globalClosed = 0;
  for (const id of scopedLmpIds) {
    const bucket = lmpStatusMap.get(id) ?? "unknown";
    if (bucket === "converted") {
      globalConverted++;
      for (const sid of lmpStudentsMap.get(id) ?? []) globalPlacedStudents.add(sid);
    }
    if (bucket === "otherReasons") globalClosed++;
  }
  const globalLmpDenominator = scopedLmpIds.size - globalClosed;

  const pocRows: ConversionReportPocRow[] = [];
  for (const poc of activePocs) {
    const { prepIds = new Set<string>(), supportIds = new Set<string>() } = pocLinkIndex.get(poc.id) ?? {};
    const totalIds = new Set<string>([...prepIds, ...supportIds]);
    if (!totalIds.size) continue;

    let converted = 0;
    let notConverted = 0;
    let closed = 0;
    const placedStudents = new Set<string>();
    for (const id of totalIds) {
      const bucket = lmpStatusMap.get(id) ?? "unknown";
      if (bucket === "converted") {
        converted++;
        for (const sid of lmpStudentsMap.get(id) ?? []) placedStudents.add(sid);
      }
      if (bucket === "notConverted") notConverted++;
      if (bucket === "otherReasons") closed++;
    }
    const pocDenominator = converted + notConverted;
    pocRows.push({
      pocName: poc.name,
      eligibleClosed: pocDenominator,
      converted,
      lmpConversionPct: calculatePocPerformanceConversionPct(converted, notConverted),
      studentsPlaced: placedStudents.size,
    });
  }
  pocRows.sort((a, b) => (b.lmpConversionPct ?? -1) - (a.lmpConversionPct ?? -1) || a.pocName.localeCompare(b.pocName));

  const domainLmps = new Map<string, Set<string>>();
  const domainLabels = new Map<string, string>();
  for (const lmp of allLmps) {
    const key = lmpDomainMap.get(lmp.id) ?? "unspecified";
    const set = domainLmps.get(key) ?? new Set<string>();
    set.add(lmp.id);
    domainLmps.set(key, set);
    if (!domainLabels.has(key)) {
      domainLabels.set(key, lmpDomainLabelMap.get(lmp.id) ?? "Unspecified");
    }
  }

  const domainPlacedStudents = new Map<string, Set<string>>();
  for (const [domain, ids] of domainLmps.entries()) {
    const placed = new Set<string>();
    for (const id of ids) {
      if (lmpStatusMap.get(id) !== "converted") continue;
      for (const sid of lmpStudentsMap.get(id) ?? []) placed.add(sid);
    }
    domainPlacedStudents.set(domain, placed);
  }

  const domainOptedStudents = new Map<string, Set<string>>();
  for (const student of students) {
    if (isOptedOut(student.placement_status)) continue;
    const key = student.id ? `id:${student.id}` : `name:${norm(student.name)}`;
    if (!key || key === "name:") continue;
    const domains = [student.primary_domain, student.secondary_domain]
      .map((d) => norm(String(d ?? "").trim()))
      .filter(Boolean);
    for (const d of domains) {
      const set = domainOptedStudents.get(d) ?? new Set<string>();
      set.add(key);
      domainOptedStudents.set(d, set);
    }
  }

  const allDomains = new Set<string>([
    ...domainLmps.keys(),
    ...domainOptedStudents.keys(),
    ...domainPlacedStudents.keys(),
  ]);

  const domainRows: ConversionReportDomainRow[] = [];
  for (const domainKeyVal of allDomains) {
    const ids = domainLmps.get(domainKeyVal) ?? new Set<string>();
    let convertedLmps = 0;
    let notConvertedLmps = 0;
    let closedLmps = 0;
    for (const id of ids) {
      const bucket = lmpStatusMap.get(id) ?? "unknown";
      if (bucket === "converted") convertedLmps++;
      if (bucket === "notConverted") notConvertedLmps++;
      if (bucket === "otherReasons") closedLmps++;
    }
    const eligibleClosed = ids.size - closedLmps;
    const studentsOpted = (domainOptedStudents.get(domainKeyVal) ?? new Set()).size;
    const studentsPlaced = (domainPlacedStudents.get(domainKeyVal) ?? new Set()).size;
    if (!ids.size && !studentsOpted && !studentsPlaced) continue;
    domainRows.push({
      domain: domainLabels.get(domainKeyVal) ?? domainKeyVal,
      totalLmps: ids.size,
      eligibleClosed,
      convertedLmps,
      lmpConversionPct: calculateLmpProcessConversionPct(convertedLmps, ids.size, closedLmps),
      studentsOpted,
      studentsPlaced,
      studentPlacementConversionPct: pct(studentsPlaced, studentsOpted),
    });
  }
  domainRows.sort((a, b) => b.totalLmps - a.totalLmps || a.domain.localeCompare(b.domain));

  const eligibleRoster = students.filter((s) => !isOptedOut(s.placement_status));
  const studentsOpted = eligibleRoster.length;

  return {
    summary: {
      totalLmps: scopedLmpIds.size,
      eligibleClosedLmps: globalLmpDenominator,
      convertedLmps: globalConverted,
      lmpConversionPct: calculateLmpProcessConversionPct(globalConverted, scopedLmpIds.size, globalClosed),
      studentsOpted,
      studentsPlaced: globalPlacedStudents.size,
      studentPlacementConversionPct: pct(globalPlacedStudents.size, studentsOpted),
      activePocCount: pocRows.length,
    },
    pocRows,
    domainRows,
  };
}

export function formatConversionReportSse(report: ConversionReport): string {
  const s = report.summary;
  const topDomains = report.domainRows.slice(0, 12);
  const topPocs = report.pocRows.slice(0, 20);

  return [
    `LMP conversion is **${fmtPct(s.lmpConversionPct)}** (${s.convertedLmps}/${s.eligibleClosedLmps} eligible closed LMPs). Student placement conversion is **${fmtPct(s.studentPlacementConversionPct)}** (${s.studentsPlaced}/${s.studentsOpted} eligible students).`,
    "",
    ":::blocks",
    JSON.stringify([
      {
        type: "executive-summary",
        content: `Across **${s.activePocCount} active prep POCs** and **${s.totalLmps} scoped LMPs**, LMP conversion is **${fmtPct(s.lmpConversionPct)}** and student placement conversion is **${fmtPct(s.studentPlacementConversionPct)}**.`,
      },
      {
        type: "kpi-row",
        items: [
          { label: "LMP conversion", value: fmtPct(s.lmpConversionPct), color: "green" },
          { label: "Converted LMPs", value: s.convertedLmps, color: "green" },
          { label: "Eligible closed LMPs", value: s.eligibleClosedLmps, color: "blue" },
          { label: "Student placement conversion", value: fmtPct(s.studentPlacementConversionPct), color: "purple" },
          { label: "Students placed", value: s.studentsPlaced, color: "purple" },
          { label: "Eligible students", value: s.studentsOpted, color: "orange" },
        ],
      },
      {
        type: "table",
        title: "LMP conversion by POC",
        headers: ["POC", "Eligible closed", "Converted", "LMP conversion %", "Students placed"],
        rows: topPocs.map((r) => [
          r.pocName,
          r.eligibleClosed,
          r.converted,
          fmtPct(r.lmpConversionPct),
          r.studentsPlaced,
        ]),
      },
      {
        type: "table",
        title: "LMP & student placement conversion by domain",
        headers: ["Domain", "Total LMPs", "Converted LMPs", "LMP conv %", "Students opted", "Students placed", "Placement conv %"],
        rows: topDomains.map((r) => [
          r.domain,
          r.totalLmps,
          r.convertedLmps,
          fmtPct(r.lmpConversionPct),
          r.studentsOpted,
          r.studentsPlaced,
          fmtPct(r.studentPlacementConversionPct),
        ]),
      },
      {
        type: "bar-chart",
        title: "Top domains by LMP conversion %",
        data: topDomains
          .filter((r) => r.lmpConversionPct !== null && r.eligibleClosed > 0)
          .slice(0, 8)
          .map((r) => ({ label: r.domain, value: r.lmpConversionPct ?? 0 })),
      },
      {
        type: "follow-ups",
        suggestions: [
          "Break down conversion by POC",
          "Show students placed this month",
          "Which domains have the lowest conversion?",
        ],
      },
    ]),
    ":::",
  ].join("\n");
}
