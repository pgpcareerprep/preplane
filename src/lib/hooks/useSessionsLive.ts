/**
 * useSessionsLive
 * ---------------
 * Live `sessions` rows joined with mentor + student names.
 * When `lmpId` is provided, scopes to that LMP process and subscribes to
 * realtime updates filtered by `lmp_id`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "./useRealtimeInvalidate";

export interface SessionRow {
  id: string;
  lmp_id: string | null;
  mentor_id: string | null;
  student_id: string | null;
  status: string;
  session_type: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  duration_min: number | null;
  poc_name: string | null;
  poc_feedback: string | null;
  notes: string | null;
  recording_url: string | null;
  mentor_rating: number | null;
  student_rating: number | null;
  created_at: string;
  mentor_name?: string | null;
  student_name?: string | null;
}

export function useSessionsLive(opts: { lmpId?: string | null } = {}) {
  const { lmpId } = opts;
  const queryKey = ["sessions-live", lmpId ?? "all"] as const;

  useRealtimeInvalidate(
    "sessions",
    [["sessions-live"], queryKey],
    { filter: lmpId ? `lmp_id=eq.${lmpId}` : undefined },
  );

  return useQuery({
    queryKey,
    queryFn: async (): Promise<SessionRow[]> => {
      let q = supabase
        .from("sessions")
        .select(
          "id, lmp_id, mentor_id, student_id, status, session_type, scheduled_at, completed_at, duration_min, poc_name, poc_feedback, notes, recording_url, mentor_rating, student_rating, created_at",
        )
        .order("scheduled_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (lmpId) q = q.eq("lmp_id", lmpId);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as SessionRow[];

      // Hydrate mentor + student names in two batched lookups (avoid N+1).
      const mentorIds = Array.from(new Set(rows.map((r) => r.mentor_id).filter(Boolean) as string[]));
      const studentIds = Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean) as string[]));

      const [mentorRes, studentRes] = await Promise.all([
        mentorIds.length
          ? supabase.from("mentors").select("id, name").in("id", mentorIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
        studentIds.length
          ? supabase.from("students").select("id, name").in("id", studentIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      ]);

      const mentorMap = new Map<string, string>();
      for (const m of (mentorRes.data ?? []) as { id: string; name: string }[]) mentorMap.set(m.id, m.name);
      const studentMap = new Map<string, string>();
      for (const s of (studentRes.data ?? []) as { id: string; name: string }[]) studentMap.set(s.id, s.name);

      return rows.map((r) => ({
        ...r,
        mentor_name: r.mentor_id ? mentorMap.get(r.mentor_id) ?? null : null,
        student_name: r.student_id ? studentMap.get(r.student_id) ?? null : null,
      }));
    },
    staleTime: 30_000,
  });
}
