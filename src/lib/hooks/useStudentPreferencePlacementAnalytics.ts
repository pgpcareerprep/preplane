import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDomains } from "@/lib/hooks/useDbData";
import { useLmpRows } from "@/lib/sheets/hooks";
import {
  computeDomainPreferencePlacementData,
  computePocLensData,
  type CandidateEntry,
  type StudentRosterEntry,
} from "@/lib/analytics/studentPreferencePlacement";
import type { LmpRecord } from "@/lib/lmpTypes";

async function fetchStudentRosterFull(): Promise<StudentRosterEntry[]> {
  const PAGE = 1000;
  let from = 0;
  const out: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("students")
      .select("id, email, name, cohort, primary_domain, secondary_domain, lmp_count, active_lmp_count, placement_status, roll_no, student_code, phone")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out.map((s) => ({
    id: (s.id ?? null) as string | null,
    email: (s.email ?? null) as string | null,
    name: (s.name ?? "").trim(),
    cohort: (s.cohort ?? "").trim(),
    primaryDomain: (s.primary_domain ?? "").trim(),
    secondaryDomain: (s.secondary_domain ?? "").trim(),
    rollNo: (s.roll_no ?? "").trim(),
    studentCode: (s.student_code ?? "").trim(),
    phone: (s.phone ?? "").trim(),
    lmpCount: Number(s.lmp_count ?? 0),
    activeLmpCount: Number(s.active_lmp_count ?? 0),
    placementStatus: (s.placement_status ?? null) as string | null,
  }));
}

async function fetchAllCandidates(): Promise<CandidateEntry[]> {
  const PAGE = 1000;
  let from = 0;
  const out: any[] = [];
  while (true) {
    const { data, error } = await supabase
      .from("lmp_candidates")
      .select("id, lmp_id, student_id, email, student_name, roll_no, pipeline_stage, offer_status, status, r1_status, r2_status, r3_status")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
  }
  return out.map((c) => ({
    id: (c.id ?? "") as string,
    lmpId: (c.lmp_id ?? "") as string,
    studentId: (c.student_id ?? null) as string | null,
    email: (c.email ?? null) as string | null,
    studentName: (c.student_name ?? "") as string,
    rollNo: (c.roll_no ?? null) as string | null,
    pipelineStage: (c.pipeline_stage ?? null) as string | null,
    offerStatus: (c.offer_status ?? null) as string | null,
    status: (c.status ?? null) as string | null,
    r1Status: (c.r1_status ?? null) as string | null,
    r2Status: (c.r2_status ?? null) as string | null,
    r3Status: (c.r3_status ?? null) as string | null,
  }));
}

/** Same inputs as the former Admin Dashboard student analytics card (full LMP scope). */
export function useStudentPreferencePlacementAnalytics(enabled = true) {
  const { data: lmpRecords = [], isLoading: lmpLoading } = useLmpRows();
  const { data: domainRows = [] } = useDomains();

  const { data: studentRoster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["students_roster_full"],
    queryFn: fetchStudentRosterFull,
    enabled,
    staleTime: 60_000,
  });

  const { data: allCandidateRows = [], isLoading: candLoading } = useQuery({
    queryKey: ["lmp_candidates_all"],
    queryFn: fetchAllCandidates,
    enabled,
    staleTime: 60_000,
  });

  const lmpIds = useMemo(() => new Set(lmpRecords.map((r) => r.id)), [lmpRecords]);

  const filteredCandidates = useMemo(
    () => allCandidateRows.filter((c) => lmpIds.has(c.lmpId)),
    [allCandidateRows, lmpIds],
  );

  const candidatesByLmp = useMemo(() => {
    const m = new Map<string, CandidateEntry[]>();
    filteredCandidates.forEach((c) => {
      if (!m.has(c.lmpId)) m.set(c.lmpId, []);
      m.get(c.lmpId)!.push(c);
    });
    return m;
  }, [filteredCandidates]);

  const domainPrefData = useMemo(
    () => computeDomainPreferencePlacementData(lmpRecords, studentRoster, candidatesByLmp, domainRows),
    [lmpRecords, studentRoster, candidatesByLmp, domainRows],
  );

  const pocLensData = useMemo(
    () => computePocLensData(lmpRecords, candidatesByLmp),
    [lmpRecords, candidatesByLmp],
  );

  return {
    domainPrefData,
    pocLensData,
    lmpRecords,
    isLoading: enabled && (lmpLoading || rosterLoading || candLoading),
  };
}
