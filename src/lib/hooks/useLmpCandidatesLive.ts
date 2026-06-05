/**
 * useLmpCandidatesLive
 * --------------------
 * Loads live `lmp_candidates` rows and maps them to the legacy `Candidate`
 * shape consumed by AssignMentorModal and other detail UIs.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Candidate } from "@/lib/lmpProcessMutations";
import { useRealtimeInvalidate } from "./useRealtimeInvalidate";

const COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-plum-400/30 text-plum-400",
  "bg-sage-200 text-sage-600",
  "bg-yellow-200 text-yellow-600",
  "bg-sky-200 text-sky-600",
];

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function pipelineToRoundId(stage: string | null | undefined): string {
  switch ((stage ?? "").toLowerCase()) {
    case "r1":
    case "r1_done":
      return "r1";
    case "r2":
    case "r2_done":
      return "r2";
    case "r3":
    case "r3_done":
      return "r3";
    case "final":
      return "r4";
    case "offer":
    case "converted":
      return "offer";
    default:
      return "pool";
  }
}

export function useLmpCandidatesLive(lmpId?: string | null) {
  useRealtimeInvalidate(
    "lmp_candidates",
    [
      ["lmp_candidates_live", lmpId ?? "all"],
      ["lmp_candidates_live"],
      ["db-lmp-candidates", lmpId],
      ["db-lmp-candidates"],
      ["db-lmp-candidate-counts", lmpId],
      ["db-lmp-candidate-counts"],
    ],
    { filter: lmpId ? `lmp_id=eq.${lmpId}` : undefined },
  );

  return useQuery({
    queryKey: ["lmp_candidates_live", lmpId ?? "all"],
    queryFn: async (): Promise<Candidate[]> => {
      let q = supabase
        .from("lmp_candidates")
        .select("id,student_id,student_name,roll_no,pipeline_stage,lmp_id")
        .order("created_at", { ascending: true })
        .limit(1000);
      if (lmpId) q = q.eq("lmp_id", lmpId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((row, i) => ({
        id: row.id as string,
        studentId: (row.student_id as string | null) ?? undefined,
        name: (row.student_name as string) ?? "Unnamed",
        initials: initialsOf((row.student_name as string) ?? ""),
        color: COLORS[i % COLORS.length],
        cohort: (row.roll_no as string | null) ?? "—",
        roundId: pipelineToRoundId(row.pipeline_stage as string | null),
      }));
    },
    staleTime: 0,
  });
}
