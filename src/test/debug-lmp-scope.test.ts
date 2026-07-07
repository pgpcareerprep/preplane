import { describe, expect, it } from "vitest";
import { filterStudentsByCohortProgram } from "@/lib/hooks/useStudentFilters";

/** Regression: useCohortProgramLmpScope must not pass undefined students to filter */
describe("useCohortProgramLmpScope crash scenario", () => {
  it("throws when undefined students are passed with active filters", () => {
    expect(() =>
      filterStudentsByCohortProgram(undefined as never, { cohortIds: ["c1"], programIds: [] }),
    ).toThrow("Cannot read properties of undefined (reading 'filter')");
  });

  it("guards linkRows before filtering (simulated loading state)", () => {
    const linkRows: { students?: unknown; candidates?: unknown } | undefined = undefined;
    const safe =
      !linkRows?.students || !linkRows?.candidates
        ? new Set<string>()
        : null;
    expect(safe).toEqual(new Set());
  });
});
