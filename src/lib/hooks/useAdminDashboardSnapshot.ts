import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { CohortRow, ProgramRow } from "@/lib/hooks/useCohortProgram";
import { clearCachePrefix } from "@/lib/hooks/useDbData";

export type AdminDashboardSnapshotStudent = {
  id: string | null;
  email: string | null;
  name: string;
  cohort: string;
  cohortId: string | null;
  programId: string | null;
  primaryDomain: string;
  secondaryDomain: string;
  rollNo: string;
  studentCode: string;
  phone: string;
  lmpCount: number;
  activeLmpCount: number;
  placementStatus: string | null;
};

export type AdminDashboardSnapshotCandidate = {
  id: string;
  lmpId: string;
  studentId: string | null;
  email: string | null;
  studentName: string;
  rollNo: string | null;
  pipelineStage: string | null;
  offerStatus: string | null;
  status: string | null;
  r1Status: string | null;
  r2Status: string | null;
  r3Status: string | null;
};

export type AdminDashboardPrepPocCapacity = {
  name: string;
  active: number;
  hasDomain: boolean;
};

export type AdminDashboardSnapshot = {
  students: AdminDashboardSnapshotStudent[];
  lmp_processes: Record<string, unknown>[];
  candidates: AdminDashboardSnapshotCandidate[];
  cohorts: CohortRow[];
  programs: ProgramRow[];
  prep_poc_capacity: AdminDashboardPrepPocCapacity[];
};

function mapStudent(row: Record<string, unknown>): AdminDashboardSnapshotStudent {
  return {
    id: (row.id ?? null) as string | null,
    email: (row.email ?? null) as string | null,
    name: String(row.name ?? "").trim(),
    cohort: String(row.cohort ?? "").trim(),
    cohortId: (row.cohort_id ?? null) as string | null,
    programId: (row.program_id ?? null) as string | null,
    primaryDomain: String(row.primary_domain ?? "").trim(),
    secondaryDomain: String(row.secondary_domain ?? "").trim(),
    rollNo: String(row.roll_no ?? "").trim(),
    studentCode: String(row.student_code ?? "").trim(),
    phone: String(row.phone ?? "").trim(),
    lmpCount: Number(row.lmp_count ?? 0),
    activeLmpCount: Number(row.active_lmp_count ?? 0),
    placementStatus: (row.placement_status ?? null) as string | null,
  };
}

function mapCandidate(row: Record<string, unknown>): AdminDashboardSnapshotCandidate {
  return {
    id: String(row.id ?? ""),
    lmpId: String(row.lmp_id ?? ""),
    studentId: (row.student_id ?? null) as string | null,
    email: (row.email ?? null) as string | null,
    studentName: String(row.student_name ?? ""),
    rollNo: (row.roll_no ?? null) as string | null,
    pipelineStage: (row.pipeline_stage ?? null) as string | null,
    offerStatus: (row.offer_status ?? null) as string | null,
    status: (row.status ?? null) as string | null,
    r1Status: (row.r1_status ?? null) as string | null,
    r2Status: (row.r2_status ?? null) as string | null,
    r3Status: (row.r3_status ?? null) as string | null,
  };
}

function mapCapacity(row: Record<string, unknown>): AdminDashboardPrepPocCapacity {
  return {
    name: String(row.name ?? "").trim(),
    active: Number(row.active ?? 0),
    hasDomain: Boolean(row.has_domain),
  };
}

export function parseAdminDashboardSnapshot(raw: unknown): AdminDashboardSnapshot {
  const payload = (raw ?? {}) as Record<string, unknown>;
  return {
    students: ((payload.students as Record<string, unknown>[]) ?? []).map(mapStudent),
    lmp_processes: (payload.lmp_processes as Record<string, unknown>[]) ?? [],
    candidates: ((payload.candidates as Record<string, unknown>[]) ?? []).map(mapCandidate),
    cohorts: (payload.cohorts as CohortRow[]) ?? [],
    programs: (payload.programs as ProgramRow[]) ?? [],
    prep_poc_capacity: ((payload.prep_poc_capacity as Record<string, unknown>[]) ?? []).map(mapCapacity),
  };
}

/** Seed react-query caches so existing hooks read snapshot data without extra fetches. */
export function hydrateAdminDashboardCache(
  queryClient: ReturnType<typeof useQueryClient>,
  snapshot: AdminDashboardSnapshot,
) {
  queryClient.setQueryData(["db-lmp-processes", { includeArchived: true }], snapshot.lmp_processes);
  queryClient.setQueryData(["students_roster_full"], snapshot.students);
  queryClient.setQueryData(["cohorts", false], snapshot.cohorts);
  queryClient.setQueryData(["programs", "all", false], snapshot.programs);
  queryClient.setQueryData(["prep_poc_capacity_live_v2"], snapshot.prep_poc_capacity);
  clearCachePrefix('["db-lmp-processes');
}

export function useAdminDashboardSnapshot(cohortIds: string[], programIds: string[]) {
  const queryClient = useQueryClient();
  const cohortKey = cohortIds.length ? [...cohortIds].sort().join(",") : "all";
  const programKey = programIds.length ? [...programIds].sort().join(",") : "all";

  return useQuery({
    queryKey: ["admin_dashboard_snapshot", cohortKey, programKey],
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_admin_dashboard_snapshot", {
        p_cohort_ids: cohortIds.length ? cohortIds : null,
        p_program_ids: programIds.length ? programIds : null,
      });
      if (error) throw new Error(error.message);
      const snapshot = parseAdminDashboardSnapshot(data);
      hydrateAdminDashboardCache(queryClient, snapshot);
      return snapshot;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  });
}
