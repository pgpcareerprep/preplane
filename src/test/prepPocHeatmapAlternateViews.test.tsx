import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  GenericHeatmapTable,
  STUDENT_SECTION_CONFIG,
  DOMAIN_SECTION_CONFIG,
} from "@/components/dashboard/PrepPocHeatmapAlternateViews";
import type { DomainWiseRow, StudentWiseRow } from "@/lib/prepPocHeatmapViews";

const studentRow: StudentWiseRow = {
  pocId: "p1",
  pocName: "Alice",
  totalStudents: 3,
  currentStudents: 2,
  placedStudentsLoad: 1,
  notStartedCount: 1,
  prepOngoingCount: 1,
  prepDoneCount: 0,
  placedCount: 1,
  notPlacedCount: 0,
  onHoldCount: 0,
  otherReasonsCount: 0,
  placementRatePct: 33.3,
  avgSessionsPerStudent: null,
};

const domainRow: DomainWiseRow = {
  domainId: "d1",
  domainName: "Finance",
  totalLmps: 2,
  currentLmps: 1,
  closedLmps: 1,
  notStartedCount: 0,
  prepOngoingCount: 1,
  prepDoneCount: 0,
  placedCount: 1,
  notPlacedCount: 0,
  onHoldCount: 0,
  otherReasonsCount: 0,
  studentsPlaced: 1,
  placementRatePct: 50,
  eligibleClosedCount: 1,
  lmpConversionPercentage: 100,
  convertedCount: 1,
};

describe("GenericHeatmapTable alternate views", () => {
  it("renders student-wise rate columns without ReferenceError", () => {
    render(
      <GenericHeatmapTable
        rowHeader="POC"
        rows={[{ id: "p1", label: "Alice", row: studentRow }]}
        totals={{ placementRatePct: 33.3 }}
        visibleConfig={STUDENT_SECTION_CONFIG}
        colMaxValues={{ totalStudents: 3 }}
      />,
    );
    expect(screen.getByText("Alice")).toBeTruthy();
    expect(screen.getAllByText("33%").length).toBeGreaterThan(0);
  });

  it("renders domain-wise conversion and rate columns without ReferenceError", () => {
    render(
      <GenericHeatmapTable
        rowHeader="DOMAIN"
        rows={[{ id: "d1", label: "Finance", row: domainRow }]}
        totals={{ placementRatePct: 50, convertedCount: 1, eligibleClosedCount: 1, lmpConversionPercentage: 100 }}
        visibleConfig={DOMAIN_SECTION_CONFIG}
        colMaxValues={{ totalLmps: 2 }}
      />,
    );
    expect(screen.getByText("Finance")).toBeTruthy();
    expect(screen.getAllByText("1/1 - 100%").length).toBeGreaterThan(0);
    expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });
});
