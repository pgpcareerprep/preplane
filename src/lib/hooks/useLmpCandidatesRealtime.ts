/**
 * useLmpCandidatesRealtime
 * ------------------------
 * Side-effect hook that keeps every `useLmpCandidates*` query (counts +
 * detail lists) in sync via Supabase Realtime. Mount once on the LMP board
 * (global) or LMP detail (scoped) and react-query caches refresh on writes.
 */
import { useRealtimeInvalidate } from "./useRealtimeInvalidate";

export function useLmpCandidatesRealtime(opts: { lmpId?: string | null } = {}) {
  const { lmpId } = opts;

  useRealtimeInvalidate(
    "lmp_candidates",
    [
      ["db-lmp-candidates"],
      ["db-lmp-candidate-counts"],
      ["lmp_candidates_live"],
      ["lmp_candidates_live", lmpId ?? "all"],
      ["dashboard-kpis"],
    ],
    { filter: lmpId ? `lmp_id=eq.${lmpId}` : undefined },
  );
}
