import { useQuery } from "@tanstack/react-query";
import { useEffect, useId } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Reads the sheet-mirrored `comments` column for one LMP and subscribes
 * to realtime updates so the drawer reflects sheet edits live.
 */
export function useLmpProcessComment(lmpId: string | null) {
  const qc = useQueryClient();
  const instanceId = useId();
  const queryKey = ["lmp-process-comment", lmpId ?? ""] as const;

  const query = useQuery({
    queryKey,
    enabled: !!lmpId,
    queryFn: async () => {
      // Fire-and-forget pull from sheet so Column Z edits show up promptly.
      supabase.functions.invoke("sheets-pull-comments").catch(() => {});
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
  }, [lmpId, qc, instanceId]);

  // Re-pull col Z when the tab regains focus, throttled to once per 10s,
  // so switching back into the app picks up new sheet edits fast.
  useEffect(() => {
    if (!lmpId) return;
    let last = 0;
    const onFocus = () => {
      const now = Date.now();
      if (now - last < 10_000) return;
      last = now;
      supabase.functions.invoke("sheets-pull-comments").catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [lmpId]);

  return query;
}
