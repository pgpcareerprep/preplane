import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { normalizeCohortCode, normalizeProgramCode, parseAliasesInput } from "@/lib/cohortProgram";
import { deriveLmpCohortProgram } from "@/lib/lmpCohortProgram";

export type CohortRow = Tables<"cohorts">;
export type ProgramRow = Tables<"programs">;
export type StudentDatasetRow = Tables<"students_with_load">;

export type StudentDatasetFilters = {
  search?: string;
  cohortIds?: string[];
  programIds?: string[];
  placementStatus?: string;
  primaryDomain?: string;
  secondaryDomain?: string;
  limit?: number;
};

export function useCohorts(activeOnly = false) {
  return useQuery({
    queryKey: ["cohorts", activeOnly],
    queryFn: async () => {
      let q = supabase.from("cohorts").select("*").order("code");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CohortRow[];
    },
    staleTime: 60_000,
  });
}

export function usePrograms(cohortId?: string | null, activeOnly = false) {
  return useQuery({
    queryKey: ["programs", cohortId ?? "all", activeOnly],
    queryFn: async () => {
      let q = supabase.from("programs").select("*").order("code");
      if (cohortId) q = q.eq("cohort_id", cohortId);
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as ProgramRow[];
    },
    staleTime: 60_000,
  });
}

export function useStudentsDataset(filters: StudentDatasetFilters = {}) {
  const {
    search = "",
    cohortIds = [],
    programIds = [],
    placementStatus = "",
    primaryDomain = "",
    secondaryDomain = "",
    limit = 5000,
  } = filters;

  return useQuery({
    queryKey: [
      "students-dataset",
      search,
      cohortIds.join(","),
      programIds.join(","),
      placementStatus,
      primaryDomain,
      secondaryDomain,
      limit,
    ],
    queryFn: async () => {
      let q = supabase
        .from("students_with_load")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (cohortIds.length === 1) q = q.eq("cohort_id", cohortIds[0]);
      else if (cohortIds.length > 1) q = q.in("cohort_id", cohortIds);

      if (programIds.length === 1) q = q.eq("program_id", programIds[0]);
      else if (programIds.length > 1) q = q.in("program_id", programIds);

      if (placementStatus && placementStatus !== "All") {
        q = q.eq("placement_status", placementStatus);
      }
      if (primaryDomain && primaryDomain !== "All") {
        q = q.eq("primary_domain", primaryDomain);
      }
      if (secondaryDomain && secondaryDomain !== "All") {
        q = q.eq("secondary_domain", secondaryDomain);
      }

      const { data, error } = await q;
      if (error) throw error;
      let rows = (data ?? []) as StudentDatasetRow[];

      const qNorm = search.trim().toLowerCase();
      if (qNorm) {
        rows = rows.filter((s) => {
          const hay = [
            s.name,
            s.email,
            s.roll_no,
            s.student_code,
            s.cohort_code,
            s.program_code,
            s.batch_label,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(qNorm);
        });
      }

      return rows;
    },
    staleTime: 30_000,
  });
}

export function useUpsertCohort() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      code: string;
      name: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const payload: TablesInsert<"cohorts"> = {
        code: normalizeCohortCode(input.code),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("cohorts")
          .update(payload as TablesUpdate<"cohorts">)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data as CohortRow;
      }
      const { data, error } = await supabase.from("cohorts").insert(payload).select().single();
      if (error) throw error;
      return data as CohortRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cohorts"] });
      qc.invalidateQueries({ queryKey: ["students-dataset"] });
    },
  });
}

export function useUpsertProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      cohort_id: string;
      code: string;
      name: string;
      description?: string;
      aliases?: string[];
      aliasesInput?: string;
      is_active?: boolean;
    }) => {
      const aliases = input.aliases ?? parseAliasesInput(input.aliasesInput ?? "");
      const payload: TablesInsert<"programs"> = {
        cohort_id: input.cohort_id,
        code: normalizeProgramCode(input.code),
        name: input.name.trim(),
        description: input.description?.trim() || null,
        aliases,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        const { data, error } = await supabase
          .from("programs")
          .update(payload as TablesUpdate<"programs">)
          .eq("id", input.id)
          .select()
          .single();
        if (error) throw error;
        return data as ProgramRow;
      }
      const { data, error } = await supabase.from("programs").insert(payload).select().single();
      if (error) throw error;
      return data as ProgramRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programs"] });
      qc.invalidateQueries({ queryKey: ["students-dataset"] });
    },
  });
}

export function useProgramStudentCount(programId?: string | null) {
  return useQuery({
    queryKey: ["program-student-count", programId],
    queryFn: async () => {
      if (!programId) return 0;
      const { count, error } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("program_id", programId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!programId,
    staleTime: 15_000,
  });
}

export function useDeleteProgram() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (programId: string) => {
      const { error } = await supabase.from("programs").delete().eq("id", programId);
      if (error) throw error;
      return programId;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["programs"] });
      qc.invalidateQueries({ queryKey: ["students-dataset"] });
      qc.invalidateQueries({ queryKey: ["students_roster_full"] });
      qc.invalidateQueries({ queryKey: ["db-students"] });
      qc.invalidateQueries({ queryKey: ["db-students-with-load"] });
      qc.invalidateQueries({ queryKey: ["program-student-count"] });
    },
  });
}

export function invalidateCohortProgramCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["cohorts"] });
  qc.invalidateQueries({ queryKey: ["programs"] });
  qc.invalidateQueries({ queryKey: ["students-dataset"] });
}

export function useLmpCohortProgramSummaries() {
  const { data: cohorts = [] } = useCohorts(false);
  const { data: programs = [] } = usePrograms(null, false);

  return useQuery({
    queryKey: ["lmp-cohort-program-summaries"],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const candidates: { lmp_id: string; student_id: string | null; metadata: Record<string, string> | null }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("lmp_candidates")
          .select("lmp_id, student_id, metadata")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        const rows = data ?? [];
        candidates.push(
          ...rows.map((r) => ({
            lmp_id: r.lmp_id as string,
            student_id: (r.student_id ?? null) as string | null,
            metadata: (r.metadata ?? null) as Record<string, string> | null,
          })),
        );
        if (rows.length < PAGE) break;
        from += PAGE;
      }

      const studentIds = [...new Set(candidates.map((c) => c.student_id).filter(Boolean))] as string[];
      const studentMap = new Map<string, { cohort_id: string | null; program_id: string | null; cohort: string | null; roll_no: string | null }>();
      for (let i = 0; i < studentIds.length; i += 200) {
        const chunk = studentIds.slice(i, i + 200);
        const { data, error } = await supabase
          .from("students")
          .select("id, cohort_id, program_id, cohort, roll_no")
          .in("id", chunk);
        if (error) throw error;
        for (const s of data ?? []) {
          studentMap.set(s.id, s);
        }
      }

      const byLmp = new Map<string, { student?: import("@/lib/cohortProgram").StudentCohortFields | null; metadata?: Record<string, string> | null }[]>();
      for (const c of candidates) {
        if (!byLmp.has(c.lmp_id)) byLmp.set(c.lmp_id, []);
        const raw = c.student_id ? studentMap.get(c.student_id) : null;
        const student = raw
          ? {
              ...raw,
              cohort_code: c.metadata?.cohort_code ?? cohorts.find((x) => x.id === raw.cohort_id)?.code ?? null,
              program_code: c.metadata?.program_code ?? programs.find((x) => x.id === raw.program_id)?.code ?? null,
            }
          : c.metadata
            ? { cohort_code: c.metadata.cohort_code, program_code: c.metadata.program_code }
            : null;
        byLmp.get(c.lmp_id)!.push({ student, metadata: c.metadata });
      }

      const result = new Map<string, import("@/lib/lmpCohortProgram").LmpCohortProgramSummary>();
      byLmp.forEach((list, lmpId) => {
        result.set(lmpId, deriveLmpCohortProgram(list));
      });
      return result;
    },
    staleTime: 60_000,
  });
}
