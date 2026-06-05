/**
 * useLmpProcessesRealtime
 * -----------------------
 * Side-effect hook that keeps every `useLmpProcesses*` query in sync via
 * Supabase Realtime. Drop into any LMP board / detail page once and all
 * derived react-query caches refresh automatically when rows change.
 *
 *   useLmpProcessesRealtime();             // global
 *   useLmpProcessesRealtime({ lmpId });    // scoped to one LMP detail page
 */
import { useRealtimeInvalidate } from "./useRealtimeInvalidate";

export function useLmpProcessesRealtime(opts: { lmpId?: string | null } = {}) {
  const { lmpId } = opts;

  useRealtimeInvalidate(
    "lmp_processes",
    [
      ["db-lmp-processes"],
      ["db-lmp-process", lmpId ?? ""],
      ["db-lmp-processes-by-ids"],
      ["db-lmp-full-view"],
      ["dashboard-kpis"],
    ],
    {
      filter: lmpId ? `id=eq.${lmpId}` : undefined,
      // Wipe useDbData's 30s in-memory cache too, otherwise refetch returns
      // the pre-event snapshot and the UI stays stale until full refresh.
      cachePrefixes: ['["db-lmp-processes', '["db-lmp-process"'],
    },
  );
}
