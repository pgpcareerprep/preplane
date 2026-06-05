/**
 * useJdRealtime
 * -------------
 * Listens to UPDATEs on `lmp_processes` for one LMP row and re-hydrates the
 * local JD cache (which fires the jdStore pub-sub → every `useJd` consumer
 * re-renders). Mount once per LMP detail view so JD added on another tab,
 * device, or session reflects instantly without a manual refresh.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchJdFromDb } from "@/lib/jdStore";

export function useJdRealtime(lmpId: string | null | undefined): void {
  useEffect(() => {
    if (!lmpId) return;
    const channel = supabase
      .channel(`jd-${lmpId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes" as never,
        { event: "UPDATE", schema: "public", table: "lmp_processes", filter: `id=eq.${lmpId}` },
        () => { void fetchJdFromDb(lmpId); },
      )
      .subscribe();
    return () => {
      try { supabase.removeChannel(channel); } catch { /* noop */ }
    };
  }, [lmpId]);
}
