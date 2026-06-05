import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live goal-met rate for a mentor, derived from real session feedback —
 * NOT from the synthetic `mentors.outcome_pct` (which is a re-label of the
 * pipeline match score).
 *
 * Goal-met counts a completed session where either:
 *   - `session_student_feedbacks.feedback.goal_met` is truthy, OR
 *   - `student_rating >= 4` on the session row itself.
 */
export function useMentorGoalMet(mentorId: string | undefined) {
  return useQuery({
    enabled: !!mentorId,
    queryKey: ["mentor-goal-met", mentorId],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select(
          "id, student_rating, completed_at, session_student_feedbacks(feedback, student_rating)"
        )
        .eq("mentor_id", mentorId!)
        .not("completed_at", "is", null);
      if (error) throw error;
      const rows = (data ?? []) as Array<{
        id: string;
        student_rating: number | null;
        completed_at: string | null;
        session_student_feedbacks?: Array<{
          feedback: any;
          student_rating: number | null;
        }> | null;
      }>;
      const total = rows.length;
      if (total === 0) {
        return { goalMetPct: null as number | null, met: 0, total: 0 };
      }
      const met = rows.filter((r) => {
        const fbList = r.session_student_feedbacks ?? [];
        const fbGoalMet = fbList.some((f) => {
          const v = f.feedback?.goal_met ?? f.feedback?.goalMet;
          return v === true || v === "yes" || v === "Yes";
        });
        const fbRating = fbList
          .map((f) => Number(f.student_rating ?? f.feedback?.rating ?? 0))
          .filter((n) => n > 0);
        const bestFbRating = fbRating.length ? Math.max(...fbRating) : 0;
        const rating = Math.max(Number(r.student_rating ?? 0), bestFbRating);
        return fbGoalMet || rating >= 4;
      }).length;
      return {
        goalMetPct: Math.round((met / total) * 100),
        met,
        total,
      };
    },
  });
}
