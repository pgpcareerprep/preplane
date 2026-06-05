/**
 * useRecentTimeline — fetches the latest lmp_timeline entries (optionally
 * scoped to a list of LMP ids). Realtime-invalidated.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";

export interface RecentTimelineEvent {
  id: string;
  lmpId: string;
  eventType: string;
  description: string;
  actor: string;
  createdAt: string;
  metadata: Record<string, any>;
}

export function useRecentTimeline(opts: { lmpIds?: string[]; limit?: number } = {}) {
  const { lmpIds, limit = 12 } = opts;
  useRealtimeInvalidate("lmp_timeline" as never, [["lmp_timeline_recent"]]);
  const scopedKey = lmpIds ? [...lmpIds].sort().join(",") : "all";
  return useQuery({
    queryKey: ["lmp_timeline_recent", scopedKey, limit],
    queryFn: async () => {
      let q = (supabase as any)
        .from("lmp_timeline")
        .select("id, lmp_id, event_type, description, actor, created_at, metadata")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (lmpIds && lmpIds.length) {
        q = q.in("lmp_id", lmpIds);
      } else if (lmpIds && lmpIds.length === 0) {
        return [] as RecentTimelineEvent[];
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        lmpId: String(r.lmp_id),
        eventType: String(r.event_type ?? ""),
        description: String(r.description ?? ""),
        actor: String(r.actor ?? "System"),
        createdAt: String(r.created_at ?? ""),
        metadata: (r.metadata ?? {}) as Record<string, any>,
      })) as RecentTimelineEvent[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
