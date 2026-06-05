import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Heuristic: an LMP id that is a valid uuid but missing from the DB MAY be a
 * just-created row whose sheet round-trip is in flight. We check two signals:
 *   1) `sheet_write_queue` has a recent (<10min) pending/in_progress entry
 *      mentioning this id, OR
 *   2) `sheet_sync_events` has a recent app→sheet insert for this id.
 *
 * Returns { pending, queued, retry } so the UI can show a friendly hint and
 * trigger an auto-refetch loop.
 */
export function useIsLmpSyncPending(rawId: string | undefined) {
  const id = rawId ?? "";
  const isUuid = UUID_RE.test(id);

  const [tick, setTick] = useState(0);

  const query = useQuery({
    queryKey: ["lmp-sync-pending", id, tick],
    enabled: isUuid,
    staleTime: 5_000,
    queryFn: async () => {
      const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
      const [queue, events, row] = await Promise.all([
        supabase
          .from("sheet_write_queue")
          .select("id, status, created_at, payload")
          .gte("created_at", tenMinAgo)
          .in("status", ["pending", "in_progress", "failed"])
          .limit(50),
        supabase
          .from("sheet_sync_events")
          .select("id, created_at, direction, operation, record_id")
          .gte("created_at", tenMinAgo)
          .eq("direction", "app_to_sheet")
          .limit(50),
        supabase.from("lmp_processes").select("id").eq("id", id).maybeSingle(),
      ]);

      const matchesQueue = (queue.data ?? []).some((q) => {
        const p = JSON.stringify(q.payload ?? "");
        return p.includes(id);
      });
      const matchesEvent = (events.data ?? []).some((e) => e.record_id === id);
      const exists = !!row.data?.id;

      return {
        exists,
        queued: matchesQueue || matchesEvent,
        pending: !exists && (matchesQueue || matchesEvent),
      };
    },
  });

  // Poll every 3s up to 30s while we suspect it's pending.
  useEffect(() => {
    if (!isUuid) return;
    if (query.data?.exists) return;
    if (tick >= 10) return;
    const t = setTimeout(() => setTick((n) => n + 1), 3000);
    return () => clearTimeout(t);
  }, [isUuid, query.data?.exists, tick]);

  return {
    isUuid,
    pending: !!query.data?.pending,
    exists: !!query.data?.exists,
    timedOut: tick >= 10,
    loading: query.isLoading,
  };
}
