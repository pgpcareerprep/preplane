/**
 * useLmpMentorsLive
 * -----------------
 * Live mentor assignments for an LMP process. Joins `lmp_mentors` with `mentors`
 * so consumers get full mentor profiles in one query, and subscribes to realtime
 * row changes filtered by `lmp_id`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "./useRealtimeInvalidate";

export interface LmpMentorRow {
  id: string;
  lmp_id: string;
  mentor_id: string;
  status: string;
  feedback_avg: number | null;
  feedback_count: number | null;
  assigned_at: string | null;
  mentor: {
    id: string;
    name: string;
    email: string | null;
    company: string | null;
    role: string | null;
    designation: string | null;
    seniority: string | null;
    industry: string | null;
    functional_domain: string | null;
    skill_tags: string[] | null;
    source: string;
    availability: string;
    overall_score: number | null;
    rating: number | null;
    linkedin: string | null;
    mentor_code: string | null;
  } | null;
}

export function useLmpMentorsLive(lmpId?: string | null) {
  const queryKey = ["lmp-mentors-live", lmpId ?? "all"] as const;

  useRealtimeInvalidate("lmp_mentors", [["lmp-mentors-live"], queryKey], {
    filter: lmpId ? `lmp_id=eq.${lmpId}` : undefined,
    enabled: !!lmpId,
  });

  return useQuery({
    queryKey,
    queryFn: async (): Promise<LmpMentorRow[]> => {
      if (!lmpId) return [];
      const { data, error } = await supabase
        .from("lmp_mentors")
        .select(
          `id, lmp_id, mentor_id, status, feedback_avg, feedback_count, assigned_at,
           mentor:mentors!inner (
             id, name, email, company, role, designation, seniority, industry,
             functional_domain, skill_tags, source, availability, overall_score,
             rating, linkedin, mentor_code
           )`,
        )
        .eq("lmp_id", lmpId)
        .order("assigned_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      // Supabase returns mentor as an array when relationship inference is ambiguous;
      // normalize to a single object.
      return ((data ?? []) as unknown as LmpMentorRow[]).map((r) => ({
        ...r,
        mentor: Array.isArray(r.mentor) ? (r.mentor[0] ?? null) : r.mentor,
      }));
    },
    enabled: !!lmpId,
    staleTime: 30_000,
  });
}
