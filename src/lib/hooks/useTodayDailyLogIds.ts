/**
 * useTodayDailyLogIds — returns a Set<lmp_id> for LMPs that received any
 * `progress`-type daily log entry today (local time). Realtime-invalidated.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";

function startOfTodayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function useTodayDailyLogIds(): Set<string> {
  useRealtimeInvalidate("lmp_daily_logs", [["lmp_daily_logs_today"]]);
  const { data } = useQuery({
    queryKey: ["lmp_daily_logs_today"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_daily_logs")
        .select("lmp_id, entry_type, created_at")
        .gte("created_at", startOfTodayISO())
        .eq("entry_type", "progress");
      if (error) throw new Error(error.message);
      return (data ?? []).map((r: any) => String(r.lmp_id));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  return new Set(data ?? []);
}
