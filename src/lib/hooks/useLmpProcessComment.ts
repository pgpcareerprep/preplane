import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Reads the sheet-mirrored `comments` column for one LMP and subscribes
 * to realtime updates so the drawer reflects sheet edits live.
 */
export function useLmpProcessComment(lmpId: string | null) {
  const qc = useQueryClient();
  const instanceId = useId();
  const queryKey = useMemo(() => ["lmp-process-comment", lmpId ?? ""] as const, [lmpId]);

  const query = useQuery({
    queryKey,
    enabled: !!lmpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_processes")
        .select("comments")
        .eq("id", lmpId!)
        .maybeSingle();
      if (error) throw error;
      return (data?.comments ?? "") as string;
    },
  });

  useEffect(() => {
    if (!lmpId) return;
    const ch = supabase
      .channel(`lmp_comment_${lmpId}_${instanceId.replace(/:/g, "")}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "lmp_processes", filter: `id=eq.${lmpId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lmpId, qc, instanceId, queryKey]);

  return query;
}
