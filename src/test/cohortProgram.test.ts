import { describe, expect, it } from "vitest";
import {
  deriveLegacyProgramCode,
  formatBatchLabel,
  getStudentBatchLabel,
  resolveProgramFromLegacyText,
} from "@/lib/cohortProgram";
import { deriveLmpCohortProgram } from "@/lib/lmpCohortProgram";
import { filterStudentsByCohortProgram } from "@/lib/hooks/useStudentFilters";

describe("cohortProgram", () => {
  it("formats batch label", () => {
    expect(formatBatchLabel("C6", "YLC")).toBe("C6 · YLC");
  });

  it("derives legacy program from roll number", () => {
    expect(deriveLegacyProgramCode(null, "YLC2024001")).toBe("YLC");
    expect(deriveLegacyProgramCode(null, "PGP2024001")).toBe("TBM");
  });

  it("resolves program from aliases", () => {
    const programs = [
      { id: "p1", code: "TBM", cohort_id: "c6", aliases: ["PGP", "DBM"] },
      { id: "p2", code: "YLC", cohort_id: "c6", aliases: ["YLC2"] },
    ];
    expect(resolveProgramFromLegacyText("PGP 2024", null, programs)?.id).toBe("p1");
    expect(resolveProgramFromLegacyText("YLC2", null, programs)?.id).toBe("p2");
  });

  it("uses FK fields for batch label when present", () => {
    expect(getStudentBatchLabel({
      cohort_code: "C7",
      program_code: "HROS",
    })).toBe("C7 · HROS");
  });
});

describe("lmpCohortProgram", () => {
  it("detects mixed cohort", () => {
    const summary = deriveLmpCohortProgram([
      { student: { cohort_code: "C6", program_code: "YLC" } },
      { student: { cohort_code: "C7", program_code: "HROS" } },
    ]);
    expect(summary.cohortLabel).toBe("Mixed Cohort");
    expect(summary.isMixedCohort).toBe(true);
  });

  it("detects single cohort program", () => {
    const summary = deriveLmpCohortProgram([
      { student: { cohort_code: "C6", program_code: "YLC" } },
      { student: { cohort_code: "C6", program_code: "YLC" } },
    ]);
    expect(summary.cohortLabel).toBe("C6");
    expect(summary.programLabel).toBe("YLC");
  });
});

describe("useStudentFilters helpers", () => {
  it("filters by cohort and program ids", () => {
    const rows = [
      { id: "1", cohort_id: "c6", program_id: "ylc" },
      { id: "2", cohort_id: "c7", program_id: "hros" },
    ];
    expect(filterStudentsByCohortProgram(rows, { cohortIds: ["c6"], programIds: [] })).toHaveLength(1);
    expect(filterStudentsByCohortProgram(rows, { cohortIds: [], programIds: ["hros"] })).toHaveLength(1);
  });
});
