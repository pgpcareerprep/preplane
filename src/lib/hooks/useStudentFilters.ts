import { useMemo, useState } from "react";
import type { StudentCohortFields } from "@/lib/cohortProgram";
import { getStudentCohortCode, getStudentProgramCode } from "@/lib/cohortProgram";
import type { CohortRow, ProgramRow } from "@/lib/hooks/useCohortProgram";

export type StudentFilterState = {
  cohortIds: string[];
  programIds: string[];
};

export function useStudentFilters() {
  const [cohortIds, setCohortIds] = useState<string[]>([]);
  const [programIds, setProgramIds] = useState<string[]>([]);

  return {
    cohortIds,
    programIds,
    setCohortIds,
    setProgramIds,
    clear: () => {
      setCohortIds([]);
      setProgramIds([]);
    },
    hasFilters: cohortIds.length > 0 || programIds.length > 0,
  };
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
      const matchId = s.cohort_id && cohortIds.includes(s.cohort_id);
      const code = getStudentCohortCode(s, cohorts);
      const matchCode = code && cohortIds.some((id) => cohorts?.find((c) => c.id === id)?.code === code);
      if (!matchId && !matchCode) return false;
    }
    if (programIds.length) {
      const matchId = s.program_id && programIds.includes(s.program_id);
      const code = getStudentProgramCode(s, programs);
      const matchCode = code && programIds.some((id) => programs?.find((p) => p.id === id)?.code === code);
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
