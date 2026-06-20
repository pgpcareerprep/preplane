import { describe, it, expect } from "vitest";
import {
  buildStudentWiseData,
  buildDomainWiseData,
  buildFullHeatmapData,
  type PocRaw,
  type LinkRaw,
  type CandidateRaw,
} from "@/lib/prepPocHeatmapViews";
import { buildHeatmapData } from "@/lib/prepPocHeatmapAgg";

function poc(id: string, name: string): PocRaw {
  return { id, name, primary_domain: null, domain_tags: [] };
}

function link(pocId: string, lmpId: string, role: "prep" | "support", status: string, domain?: string): LinkRaw {
  return {
    poc_id: pocId,
    role,
    lmp_id: lmpId,
    lmp_processes: {
      status,
      domain_id: domain ? `dom-${domain.toLowerCase()}` : null,
      domains: domain ? { name: domain } : null,
    },
  };
}

function candidate(lmpId: string, studentId: string, primaryDomain?: string): CandidateRaw {
  return {
    lmp_id: lmpId,
    student_id: studentId,
    students: primaryDomain ? { primary_domain: primaryDomain } : null,
  };
}

describe("Student-wise heatmap", () => {
  const pocs = [poc("p1", "Alice"), poc("p2", "Bob")];
  const links = [
    link("p1", "lmp1", "prep", "prep-ongoing"),
    link("p2", "lmp1", "support", "prep-ongoing"),
    link("p1", "lmp2", "prep", "converted", "Sales"),
  ];
  const candidates = [
    candidate("lmp1", "s1"),
    candidate("lmp2", "s2", "Sales"),
  ];

  it("renders student rows per POC", () => {
    const { rows, summary } = buildStudentWiseData(pocs, links, candidates);
    expect(rows.length).toBeGreaterThan(0);
    expect(summary.uniqueStudents).toBe(2);
  });

  it("deduplicates students globally for KPIs", () => {
    const { summary } = buildStudentWiseData(pocs, links, candidates);
    expect(summary.studentsPlaced).toBe(1);
    expect(summary.placedStudentsPct).toBeCloseTo(50, 0);
  });

  it("counts student once per POC row", () => {
    const { rows } = buildStudentWiseData(pocs, links, candidates);
    const alice = rows.find((r) => r.pocId === "p1")!;
    expect(alice.totalStudents).toBe(2);
  });

  it("uses On hold label path via outcome bucket", () => {
    const holdLinks = [link("p1", "lmp3", "prep", "hold")];
    const holdCandidates = [candidate("lmp3", "s3")];
    const { rows } = buildStudentWiseData([poc("p1", "Alice")], holdLinks, holdCandidates);
    expect(rows[0].onHoldCount).toBe(1);
  });
});

describe("Domain-wise heatmap", () => {
  it("loads dynamic domain names from data", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [
      link("p1", "lmp1", "prep", "not-started", "Product Management"),
      link("p1", "lmp2", "prep", "converted", "Sales"),
    ];
    const candidates = [
      candidate("lmp2", "s1", "Sales"),
      candidate("lmp1", "s2", "Product Management"),
    ];
    const { rows } = buildDomainWiseData(pocs, links, candidates);
    const names = rows.map((r) => r.domainName);
    expect(names).toContain("Sales");
    expect(names).toContain("Product Management");
    expect(names.some((n) => n === "Consulting")).toBe(false);
  });

  it("deduplicates global LMP totals", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [link("p1", "lmp1", "prep", "converted", "Sales")];
    const { summary } = buildDomainWiseData(pocs, links, [candidate("lmp1", "s1", "Sales")]);
    expect(summary.totalLmps).toBe(1);
    expect(summary.studentsPlaced).toBe(1);
  });

  it("handles zero placement rate denominator", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [link("p1", "lmp1", "prep", "not-started", "Finance")];
    const { summary, rows } = buildDomainWiseData(pocs, links, []);
    expect(summary.placementRatePct).toBeNull();
    expect(rows[0]?.placementRatePct).toBeNull();
  });

  it("handles LMP conversion zero denominator", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [link("p1", "lmp1", "prep", "not-started", "Finance")];
    const { summary } = buildDomainWiseData(pocs, links, []);
    expect(summary.lmpConversionPct).toBeNull();
  });
});

describe("buildFullHeatmapData", () => {
  it("preserves existing LMP-wise output", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [link("p1", "lmp1", "prep", "not-started")];
    const lmpOnly = buildHeatmapData(pocs, links, []);
    const full = buildFullHeatmapData(pocs, links, []);
    expect(full.summary).toEqual(lmpOnly.summary);
    expect(full.rows).toEqual(lmpOnly.rows);
  });

  it("scopes data to filtered LMP ids", () => {
    const pocs = [poc("p1", "Alice")];
    const links = [
      link("p1", "lmp1", "prep", "not-started"),
      link("p1", "lmp2", "prep", "converted", "Sales"),
    ];
    const scoped = buildFullHeatmapData(pocs, links, [], new Set(["lmp1"]));
    expect(scoped.summary.uniqueLmpCount).toBe(1);
    expect(scoped.domainRows.every((r) => r.totalLmps <= 1)).toBe(true);
  });
});

describe("On hold label", () => {
  it("does not use Held label in student section config", async () => {
    const { STUDENT_SECTION_CONFIG } = await import("@/components/dashboard/PrepPocHeatmapAlternateViews");
    const labels = STUDENT_SECTION_CONFIG.flatMap((s) => s.cols.map((c) => c.label));
    expect(labels.some((l) => /on hold/i.test(l))).toBe(true);
    expect(labels.some((l) => /held/i.test(l))).toBe(false);
  });
});
