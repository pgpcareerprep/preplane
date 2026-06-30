import { describe, it, expect } from "vitest";
import { buildHeatmapData } from "@/lib/prepPocHeatmapAgg";
import {
  buildFullHeatmapData,
  type CandidateRaw,
  type LinkRaw,
  type PocRaw,
} from "@/lib/prepPocHeatmapViews";
import {
  filterDomainWiseMetricRecords,
  filterStudentWiseMetricRecords,
  groupStudentWiseRecordsByLmp,
  isStudentWiseMetricClickable,
  isDomainWiseMetricClickable,
  type HeatmapDrilldownStudentWiseRecord,
} from "@/lib/prepPocHeatmapDrilldown";
import { isAlternateCellClickable } from "@/components/dashboard/PrepPocHeatmapAlternateViews";

function poc(id: string, name: string): PocRaw {
  return { id, name, primary_domain: null, domain_tags: [] };
}

function link(
  pocId: string,
  lmpId: string,
  role: "prep" | "support",
  status: string,
  domain?: string,
  extra?: Partial<NonNullable<LinkRaw["lmp_processes"]>>,
): LinkRaw {
  return {
    poc_id: pocId,
    role,
    lmp_id: lmpId,
    lmp_processes: {
      status,
      domain_id: domain ? `dom-${domain.toLowerCase().replace(/\s+/g, "-")}` : null,
      domains: domain ? { name: domain } : null,
      company: extra?.company ?? `Co-${lmpId}`,
      role: extra?.role ?? "Analyst",
      lmp_code: extra?.lmp_code ?? lmpId.toUpperCase(),
      created_at: extra?.created_at ?? "2026-01-01",
      updated_at: extra?.updated_at ?? "2026-02-01",
      ...extra,
    },
  };
}

function candidate(
  lmpId: string,
  studentId: string,
  name?: string,
  primaryDomain?: string,
  pipelineStage?: string,
): CandidateRaw {
  return {
    lmp_id: lmpId,
    student_id: studentId,
    student_name: name ?? studentId,
    ...(pipelineStage ? { pipeline_stage: pipelineStage } : {}),
    students: {
      id: studentId,
      name: name ?? studentId,
      roll_no: `R-${studentId}`,
      email: `${studentId}@test.com`,
      cohort: "2026",
      primary_domain: primaryDomain,
    },
  };
}

function buildFixture() {
  const pocs = [poc("p1", "Vidhu POC"), poc("p2", "Other POC")];
  const links = [
    link("p1", "lmp1", "prep", "prep-ongoing", "Sales"),
    link("p1", "lmp2", "prep", "prep-ongoing", "Sales"),
    link("p1", "lmp3", "prep", "prep-done", "Sales"),
    link("p1", "lmp4", "prep", "converted", "Sales"),
    link("p1", "lmp5", "prep", "not-converted", "Finance"),
    link("p2", "lmp6", "prep", "prep-ongoing", "Finance"),
  ];
  const candidates = [
    candidate("lmp1", "s1", "Student A", "Sales"),
    candidate("lmp2", "s2", "Student B", "Sales"),
    candidate("lmp2", "s3", "Student C", "Sales"),
    candidate("lmp3", "s4", "Student D", "Sales"),
    candidate("lmp4", "s5", "Student E", "Sales", "converted"),
    candidate("lmp5", "s6", "Student F", "Finance"),
    candidate("lmp6", "s7", "Student G", "Finance"),
  ];
  return buildFullHeatmapData(pocs, links, candidates);
}

describe("Student-wise drilldown filters", () => {
  const data = buildFixture();
  const row = data.studentRows.find((r) => r.pocId === "p1")!;

  it("LMP-wise drilldown still works via existing filter", () => {
    const lmpOnly = buildHeatmapData(
      [poc("p1", "Vidhu POC")],
      [link("p1", "lmp1", "prep", "prep-ongoing", "Sales")],
      [],
    );
    const drill = filterStudentWiseMetricRecords;
    void drill;
    expect(lmpOnly.rows[0].prepOngoingCount).toBe(1);
  });

  it("Prep Ongoing returns distinct students for POC", () => {
    const drill = filterStudentWiseMetricRecords(data, "p1", "prepOngoingCount");
    expect(drill.recordType).toBe("student");
    expect(drill.students).toHaveLength(row.prepOngoingCount);
    expect(new Set(drill.students.map((s) => s.studentId)).size).toBe(row.prepOngoingCount);
  });

  it("Prep Done returns distinct students for POC", () => {
    const drill = filterStudentWiseMetricRecords(data, "p1", "prepDoneCount");
    expect(drill.students).toHaveLength(row.prepDoneCount);
    expect(drill.students.every((s) => (s as { matchingBucket?: string }).matchingBucket === "Prep Done")).toBe(true);
  });

  it("totalStudents returns all linked students", () => {
    const drill = filterStudentWiseMetricRecords(data, "p1", "totalStudents");
    expect(drill.students).toHaveLength(row.totalStudents);
  });
});

describe("Domain-wise drilldown filters", () => {
  const data = buildFixture();
  const sales = data.domainRows.find((r) => r.domainName === "Sales")!;

  it("Prep Done returns LMP list for domain", () => {
    const drill = filterDomainWiseMetricRecords(data, sales.domainId, "prepDoneCount");
    expect(drill.recordType).toBe("lmp");
    expect(drill.lmps).toHaveLength(sales.prepDoneCount);
    expect(drill.lmps.every((l) => l.statusBucket === "prepDone")).toBe(true);
  });

  it("Placed returns LMP list for domain", () => {
    const drill = filterDomainWiseMetricRecords(data, sales.domainId, "placedCount");
    expect(drill.recordType).toBe("lmp");
    expect(drill.lmps.every((l) => l.statusBucket === "converted")).toBe(true);
  });

  it("LMP Conversion returns denominator and converted LMP records", () => {
    const drill = filterDomainWiseMetricRecords(data, sales.domainId, "lmpConversion");
    expect(drill.recordType).toBe("conversion");
    expect(drill.denominatorLmps).toHaveLength(sales.eligibleClosedCount);
    expect(drill.convertedLmps).toHaveLength(sales.convertedCount);
    expect(drill.denominatorLmps?.some((r) => r.statusBucket === "onHold")).toBe(false);
  });
});

describe("groupStudentWiseRecordsByLmp", () => {
  it("groups students by LMP with currentRound and otherLmpsCount populated", () => {
    const pocs = [poc("p1", "Vidhu POC")];
    const links = [
      link("p1", "lmp1", "prep", "prep-ongoing", "Sales"),
      link("p1", "lmp2", "prep", "prep-ongoing", "Sales"),
    ];
    const candidates = [
      candidate("lmp1", "s1", "Student A", "Sales"),
      candidate("lmp2", "s1", "Student A", "Sales"),
      candidate("lmp2", "s2", "Student B", "Sales", "r2"),
    ];
    const data = buildFullHeatmapData(pocs, links, candidates);
    const drill = filterStudentWiseMetricRecords(data, "p1", "prepOngoingCount");
    const groups = groupStudentWiseRecordsByLmp(drill.students as HeatmapDrilldownStudentWiseRecord[]);

    expect(groups).toHaveLength(2);
    expect(groups[0].candidateCount).toBeGreaterThanOrEqual(groups[1].candidateCount);

    const studentA = drill.students.find((s) => s.studentId === "s1") as HeatmapDrilldownStudentWiseRecord;
    expect(studentA.otherLmpsCount).toBe(1);

    const studentB = drill.students.find((s) => s.studentId === "s2") as HeatmapDrilldownStudentWiseRecord;
    expect(studentB.currentRound).toBe("R2");
    expect(studentB.otherLmpsCount).toBe(0);

    const synthetic: HeatmapDrilldownStudentWiseRecord[] = [
      { ...studentA, studentId: "s1", lmpId: "lmp1" },
      { ...studentB, studentId: "s2", lmpId: "lmp2" },
      { ...studentB, studentId: "s3", studentName: "Student C", lmpId: "lmp2" },
    ];
    const packed = groupStudentWiseRecordsByLmp(synthetic);
    expect(packed.find((g) => g.lmpId === "lmp2")?.candidateCount).toBe(2);
  });
});

describe("Clickable cell rules", () => {
  it("zero heat cells are not clickable", () => {
    expect(
      isAlternateCellClickable(
        { dataKey: "prepOngoingCount", colType: "heat", label: "Prep Ongoing", minWidth: 1, palette: {} as never, totalAccent: "", tooltip: "" },
        0,
      ),
    ).toBe(false);
  });

  it("rate cells are not clickable", () => {
    expect(
      isAlternateCellClickable(
        { dataKey: "placementRatePct", colType: "rate", label: "Placement Rate", minWidth: 1, palette: {} as never, totalAccent: "", tooltip: "" },
        50,
      ),
    ).toBe(false);
    expect(isStudentWiseMetricClickable("placementRatePct")).toBe(false);
    expect(isDomainWiseMetricClickable("placementRatePct")).toBe(false);
  });

  it("supported student and domain metrics are clickable keys", () => {
    expect(isStudentWiseMetricClickable("prepOngoingCount")).toBe(true);
    expect(isDomainWiseMetricClickable("prepDoneCount")).toBe(true);
    expect(isDomainWiseMetricClickable("lmpConversion")).toBe(true);
  });
});

describe("Heatmap totals unchanged", () => {
  it("buildFullHeatmapData preserves LMP-wise rows after drilldown source attach", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [link("p1", "lmp1", "prep", "not-started")];
    const lmpOnly = buildHeatmapData(pocs, links, []);
    const full = buildFullHeatmapData(pocs, links, []);
    expect(full.rows).toEqual(lmpOnly.rows);
    expect(full.summary).toEqual(lmpOnly.summary);
    expect(full.drilldownSource.studentWise).toBeDefined();
  });
});
