import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";

export type OutreachFeedbackEntry = {
  id: string;
  lmp_id: string;
  feedback: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
};

export function useOutreachFeedback(lmpId: string | null | undefined) {
  return useQuery({
    queryKey: ["outreach-feedback", lmpId],
    queryFn: async () => {
      if (!lmpId) return [];
      const { data, error } = await supabase
        .from("lmp_outreach_feedback")
        .select("*")
        .eq("lmp_id", lmpId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OutreachFeedbackEntry[];
    },
    enabled: !!lmpId,
    staleTime: 30_000,
  });
}

export function useAddOutreachFeedback() {
  const queryClient = useQueryClient();
  const { user } = useRole();

  return useMutation({
    mutationFn: async ({ lmpId, feedback }: { lmpId: string; feedback: string }) => {
      const pocName =
        user.pocProfileName || user.name || user.email || "Unknown";

      // 1. Get current poc profile id
      let pocId: string | null = null;
      if (user.email) {
        const { data: poc } = await supabase
          .from("poc_profiles")
          .select("id")
          .eq("email", user.email)
          .maybeSingle();
        pocId = poc?.id ?? null;
      }

      // 2. Insert feedback history row
      const { error: insertError } = await supabase
        .from("lmp_outreach_feedback")
        .insert({
          lmp_id: lmpId,
          feedback,
          created_by: pocId,
          created_by_name: pocName,
        });
      if (insertError) throw insertError;

      // 3. Update latest feedback on lmp_processes
      const { error: updateError } = await supabase
        .from("lmp_processes")
        .update({ feedback_by_outreach: feedback })
        .eq("id", lmpId);
      if (updateError) throw updateError;

      return { lmpId };
    },
    onSuccess: ({ lmpId }) => {
      queryClient.invalidateQueries({ queryKey: ["outreach-feedback", lmpId] });
      queryClient.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      queryClient.invalidateQueries({ queryKey: ["db-lmp-full-view"] });
      queryClient.invalidateQueries({ queryKey: ["db-lmp-process", lmpId] });
    },
  });
}
