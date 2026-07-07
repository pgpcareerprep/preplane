import { useMemo } from "react";
import type { StudentCohortFields } from "@/lib/cohortProgram";
import { getStudentCohortCode, getStudentProgramCode } from "@/lib/cohortProgram";
import type { CohortRow, ProgramRow } from "@/lib/hooks/useCohortProgram";
import { useCohortProgramFilter } from "@/lib/cohortProgramFilterContext";

export type StudentFilterState = {
  cohortIds: string[];
  programIds: string[];
};

/** Global cohort/program filter — backed by CohortProgramFilterProvider. */
export function useStudentFilters() {
  return useCohortProgramFilter();
}

export function filterStudentsByCohortProgram<T extends StudentCohortFields>(
  rows: T[],
  filters: StudentFilterState,
  cohorts?: CohortRow[],
  programs?: ProgramRow[],
): T[] {
  const { cohortIds, programIds } = filters;
  if (!cohortIds.length && !programIds.length) return rows;
  return rows.filter((s) => {
    if (cohortIds.length) {
      const studentCohortId = s.cohort_id ?? s.cohortId;
      const matchId = studentCohortId && cohortIds.includes(studentCohortId);
      const code = getStudentCohortCode(s, cohorts);
      const matchCode = code && cohortIds.some((id) => cohorts?.find((c) => c.id === id)?.code === code);
      if (!matchId && !matchCode) return false;
    }
    if (programIds.length) {
      const studentProgramId = s.program_id ?? s.programId;
      const studentCohortId = s.cohort_id ?? s.cohortId;
      const studentCohortCode = getStudentCohortCode(s, cohorts);
      const matchId = studentProgramId && programIds.includes(studentProgramId);
      const code = getStudentProgramCode(s, programs);
      const matchCode = code && programIds.some((id) => {
        const program = programs?.find((p) => p.id === id);
        if (!program || program.code !== code) return false;
        if (studentCohortId) return program.cohort_id === studentCohortId;
        const programCohortCode = cohorts?.find((c) => c.id === program.cohort_id)?.code;
        return !programCohortCode || !studentCohortCode || programCohortCode === studentCohortCode;
      });
      if (!matchId && !matchCode) return false;
    }
    return true;
  });
}

export function useFilteredStudentRoster<T extends StudentCohortFields>(
  roster: T[],
  filters: StudentFilterState,
  cohorts?: CohortRow[],
  programs?: ProgramRow[],
) {
  return useMemo(
    () => filterStudentsByCohortProgram(roster, filters, cohorts, programs),
    [roster, filters.cohortIds, filters.programIds, cohorts, programs],
  );
}
