import { describe, expect, it } from "vitest";
import { buildConversionReport, buildConversionMetricsToolPayload, formatConversionReportSse, mapStatusToBucket, summarizeConversionStatuses, tallyLmpConversionBuckets } from "../../../supabase/functions/_shared/conversionReport";

describe("conversionReport", () => {
  it("maps terminal LMP statuses", () => {
    expect(mapStatusToBucket("converted")).toBe("converted");
    expect(mapStatusToBucket("not-converted")).toBe("notConverted");
    expect(mapStatusToBucket("hold")).toBe("onHold");
  });

  it("builds LMP and student placement conversion summary", () => {
    const report = buildConversionReport(
      [{ id: "p1", name: "Alice", status: "active", role_type: "prep_poc" }],
      [{
        poc_id: "p1",
        role: "prep",
        lmp_id: "l1",
        lmp_processes: { status: "converted", domain_raw: "Finance", domains: { name: "Finance" } },
      }, {
        poc_id: "p1",
        role: "prep",
        lmp_id: "l2",
        lmp_processes: { status: "not-converted", domain_raw: "Finance", domains: { name: "Finance" } },
      }],
      [{ lmp_id: "l1", student_id: "s1" }],
      [{ id: "s1", name: "Sam", primary_domain: "Finance", placement_status: "active" }],
      [
        { id: "l1", status: "converted", domain_raw: "Finance", domains: { name: "Finance" } },
        { id: "l2", status: "not-converted", domain_raw: "Finance", domains: { name: "Finance" } },
      ],
    );

    expect(report.summary.convertedLmps).toBe(1);
    expect(report.summary.eligibleClosedLmps).toBe(2);
    expect(report.summary.lmpConversionPct).toBe(50);
    expect(report.summary.studentsPlaced).toBe(1);
    expect(report.pocRows[0]?.pocName).toBe("Alice");
    expect(report.domainRows.find((r) => r.domain === "Finance")?.lmpConversionPct).toBe(50);
    expect(formatConversionReportSse(report)).toContain("LMP conversion");
  });

  it("uses distinct formulas for POC performance vs LMP process conversion", () => {
    const report = buildConversionReport(
      [{ id: "p1", name: "Alice", status: "active", role_type: "prep_poc" }],
      [{
        poc_id: "p1",
        role: "prep",
        lmp_id: "l1",
        lmp_processes: { status: "converted", domain_raw: "Finance", domains: { name: "Finance" } },
      }, {
        poc_id: "p1",
        role: "prep",
        lmp_id: "l2",
        lmp_processes: { status: "not-converted", domain_raw: "Finance", domains: { name: "Finance" } },
      }, {
        poc_id: "p1",
        role: "prep",
        lmp_id: "l3",
        lmp_processes: { status: "prep-ongoing", domain_raw: "Finance", domains: { name: "Finance" } },
      }],
      [],
      [],
      [
        { id: "l1", status: "converted", domain_raw: "Finance", domains: { name: "Finance" } },
        { id: "l2", status: "not-converted", domain_raw: "Finance", domains: { name: "Finance" } },
        { id: "l3", status: "prep-ongoing", domain_raw: "Finance", domains: { name: "Finance" } },
      ],
    );

    expect(report.pocRows[0]?.lmpConversionPct).toBe(50); // 1 / (1 + 1)
    expect(report.summary.lmpConversionPct).toBeCloseTo(33.3, 1); // 1 / 3
    expect(report.domainRows.find((r) => r.domain === "Finance")?.lmpConversionPct).toBeCloseTo(33.3, 1);
  });

  it("tallyLmpConversionBuckets normalizes sheet-style statuses", () => {
    const buckets = tallyLmpConversionBuckets(["Converted", "Not Converted", "Ongoing", "Closed"]);
    expect(buckets.converted).toBe(1);
    expect(buckets.notConverted).toBe(1);
    expect(buckets.closed).toBe(1);
    expect(buckets.lmpProcessDenominator).toBe(3);
    expect(buckets.pocPerformanceDenominator).toBe(2);
    expect(buckets.lmpProcessConversionPct).toBeCloseTo(33.3, 1);
    expect(buckets.pocPerformanceConversionPct).toBe(50);
  });

  it("summarizeConversionStatuses separates pipeline from closed not-converted", () => {
    const summary = summarizeConversionStatuses([
      "converted",
      "not-converted",
      "prep-ongoing",
      "hold",
      "closed",
    ]);
    expect(summary.converted).toBe(1);
    expect(summary.notConverted).toBe(1);
    expect(summary.inPipeline).toBe(2);
    expect(summary.closed).toBe(1);
    expect(summary.pocPerformanceConversionPct).toBe(50);
    const payload = buildConversionMetricsToolPayload(summary, "Radhika Goyal");
    expect(payload.not_converted_closed_outcome).toBe(1);
    expect(payload.in_pipeline).toBe(2);
    expect(payload.kpi_labeling.not_converted_closed_outcome).toContain("closed outcome");
  });
});
