import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCohortProgramFilter } from "@/lib/cohortProgramFilterContext";
import { useCohorts, usePrograms } from "@/lib/hooks/useCohortProgram";
import { filterStudentsByCohortProgram } from "@/lib/hooks/useStudentFilters";

/**
 * When global cohort/program filters are active, returns the set of LMP ids
 * that have at least one linked candidate in the selected cohort/program.
 * Returns null when no global filter is set (show all LMPs).
 */
export function useCohortProgramLmpScope(): Set<string> | null {
  const { cohortIds, programIds, hasFilters } = useCohortProgramFilter();
  const { data: cohorts = [] } = useCohorts(false);
  const { data: programs = [] } = usePrograms(null, false);

  const { data: linkRows, isLoading: linkRowsLoading } = useQuery({
    queryKey: ["cohort_program_lmp_scope_links"],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const candidates: { lmp_id: string; student_id: string | null }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("lmp_candidates")
          .select("lmp_id, student_id")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        candidates.push(...rows.map((r) => ({
          lmp_id: (r.lmp_id ?? "") as string,
          student_id: (r.student_id ?? null) as string | null,
        })));
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      let sFrom = 0;
      const students: { id: string; cohort_id: string | null; program_id: string | null; cohort?: string; roll_no?: string }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("students")
          .select("id, cohort_id, program_id, cohort, roll_no")
          .range(sFrom, sFrom + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        students.push(...rows.map((r) => ({
          id: r.id as string,
          cohort_id: (r.cohort_id ?? null) as string | null,
          program_id: (r.program_id ?? null) as string | null,
          cohort: (r.cohort ?? undefined) as string | undefined,
          roll_no: (r.roll_no ?? undefined) as string | undefined,
        })));
        if (rows.length < PAGE) break;
        sFrom += PAGE;
      }

      return { candidates, students };
    },
    staleTime: 60_000,
    enabled: hasFilters,
  });

  return useMemo(() => {
    if (!hasFilters) return null;
    // While scope data is loading, do not filter everything out.
    if (linkRowsLoading || !linkRows?.students || !linkRows?.candidates) return null;

    const scopedStudents = filterStudentsByCohortProgram(
      linkRows.students,
      { cohortIds, programIds },
      cohorts,
      programs,
    );
    const allowedStudentIds = new Set(scopedStudents.map((s) => s.id));
    const allowed = new Set<string>();

    for (const c of linkRows.candidates) {
      if (!c.lmp_id || !c.student_id) continue;
      if (allowedStudentIds.has(c.student_id)) allowed.add(c.lmp_id);
    }

    return allowed;
  }, [hasFilters, linkRows, linkRowsLoading, cohortIds, programIds, cohorts, programs]);
}
