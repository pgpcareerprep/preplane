import { describe, expect, it } from "vitest";
import { buildConversionReport, formatConversionReportSse, mapStatusToBucket } from "../../../supabase/functions/_shared/conversionReport";

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
});
