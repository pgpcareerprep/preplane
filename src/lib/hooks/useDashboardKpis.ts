/**
 * useDashboardKpis
 * ----------------
 * Aggregates the headline KPIs for the dashboards from live DB tables.
 * Optionally scopes to a POC by `pocId`, which limits LMP rows via the
 * `lmp_poc_links` table. Subscribes to realtime updates on the underlying
 * tables so cards refresh automatically.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "./useRealtimeInvalidate";

export interface DashboardKpis {
  totalProcesses: number;
  ongoing: number;
  converted: number;
  notConverted: number;
  hold: number;
  notStarted: number;
  candidatesTotal: number;
  candidatesByStage: Record<string, number>;
  sessionsLast7d: number;
  sessionsScheduled: number;
  mentorsTotal: number;
  mentorsAvailable: number;
}

const EMPTY: DashboardKpis = {
  totalProcesses: 0,
  ongoing: 0,
  converted: 0,
  notConverted: 0,
  hold: 0,
  notStarted: 0,
  candidatesTotal: 0,
  candidatesByStage: {},
  sessionsLast7d: 0,
  sessionsScheduled: 0,
  mentorsTotal: 0,
  mentorsAvailable: 0,
};

export function useDashboardKpis(opts: { pocId?: string | null } = {}) {
  const { pocId } = opts;
  const queryKey = ["dashboard-kpis", pocId ?? "all"] as const;

  // Re-aggregate when the underlying tables change. Throttled by react-query staleTime.
  useRealtimeInvalidate("lmp_processes", [["dashboard-kpis"]]);
  useRealtimeInvalidate("lmp_candidates", [["dashboard-kpis"]]);
  useRealtimeInvalidate("sessions", [["dashboard-kpis"]]);

  return useQuery({
    queryKey,
    queryFn: async (): Promise<DashboardKpis> => {
      // 1. Resolve LMP id scope (when filtering to a POC).
      let lmpIds: string[] | null = null;
      if (pocId) {
        const { data, error } = await supabase
          .from("lmp_poc_links")
          .select("lmp_id")
          .eq("poc_id", pocId)
          .eq("is_active", true)
          .limit(5000);
        if (error) throw error;
        lmpIds = Array.from(new Set((data ?? []).map((r: any) => r.lmp_id as string)));
        if (!lmpIds.length) return EMPTY;
      }

      // 2. LMP processes — pull statuses we care about.
      let lmpQ = supabase.from("lmp_processes").select("status").limit(5000);
      if (lmpIds) lmpQ = lmpQ.in("id", lmpIds);
      const { data: lmpRows, error: lmpErr } = await lmpQ;
      if (lmpErr) throw lmpErr;

      const total = lmpRows?.length ?? 0;
      const byStatus: Record<string, number> = {};
      for (const r of lmpRows ?? []) {
        const k = String((r as any).status ?? "").toLowerCase();
        byStatus[k] = (byStatus[k] ?? 0) + 1;
      }

      // 3. Candidates by pipeline stage (scoped if needed).
      let candQ = supabase.from("lmp_candidates").select("pipeline_stage").limit(20000);
      if (lmpIds) candQ = candQ.in("lmp_id", lmpIds);
      const { data: candRows, error: candErr } = await candQ;
      if (candErr) throw candErr;
      const candidatesByStage: Record<string, number> = {};
      for (const r of candRows ?? []) {
        const k = String((r as any).pipeline_stage ?? "pool").toLowerCase();
        candidatesByStage[k] = (candidatesByStage[k] ?? 0) + 1;
      }

      // 4. Sessions: total scheduled + last 7d.
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      let scheduledQ = supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "scheduled");
      let recentQ = supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sevenDaysAgo);
      if (lmpIds) {
        scheduledQ = scheduledQ.in("lmp_id", lmpIds);
        recentQ = recentQ.in("lmp_id", lmpIds);
      }
      const [{ count: scheduledCount }, { count: recentCount }] = await Promise.all([scheduledQ, recentQ]);

      // 5. Mentors: total + available (global, not POC-scoped — supply view).
      const [{ count: mentorsTotal }, { count: mentorsAvailable }] = await Promise.all([
        supabase.from("mentors").select("id", { count: "exact", head: true }),
        supabase.from("mentors").select("id", { count: "exact", head: true }).eq("availability", "available"),
      ]);

      // Normalise legacy status slugs onto canonical buckets so the KPIs are
      // correct regardless of whether rows were written by app code ("prep-ongoing")
      // or by older sheet-sync paths ("ongoing", "dormant", etc.).
      const n = (k: string) => byStatus[k] ?? 0;
      return {
        totalProcesses: total,
        // "ongoing" is a legacy alias for the canonical "prep-ongoing" state.
        ongoing: n("prep-ongoing") + n("ongoing"),
        // "offer-received" is a legacy alias treated the same as converted.
        converted: n("converted") + n("offer-received"),
        // All terminal-loss states collapse into notConverted.
        notConverted: n("not-converted") + n("closed") + n("converted-na") + n("other-reasons"),
        // "dormant" and "on-hold" are legacy aliases for hold.
        hold: n("hold") + n("on-hold") + n("dormant"),
        notStarted: n("not-started"),
        candidatesTotal: candRows?.length ?? 0,
        candidatesByStage,
        sessionsLast7d: recentCount ?? 0,
        sessionsScheduled: scheduledCount ?? 0,
        mentorsTotal: mentorsTotal ?? 0,
        mentorsAvailable: mentorsAvailable ?? 0,
      };
    },
    staleTime: 60_000,
  });
}
