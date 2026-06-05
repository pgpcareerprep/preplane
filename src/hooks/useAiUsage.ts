import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AiUsageRange = "24h" | "7d" | "30d";

function rangeStart(range: AiUsageRange): string {
  const now = Date.now();
  const ms =
    range === "24h" ? 24 * 60 * 60 * 1000 :
    range === "7d"  ? 7  * 24 * 60 * 60 * 1000 :
                      30 * 24 * 60 * 60 * 1000;
  return new Date(now - ms).toISOString();
}

export interface AiUsageRow {
  id: string;
  user_id: string | null;
  feature: string;
  model: string | null;
  prompt_tokens: number;
  response_tokens: number;
  total_tokens: number;
  latency_ms: number | null;
  status: string;
  error_message: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
}

export interface AiUsageSnapshot {
  rows: AiUsageRow[];
  totalRequests: number;
  totalTokens: number;
  errorCount: number;
  byFeature: { feature: string; requests: number; tokens: number }[];
  byModel:   { model: string;   requests: number; tokens: number }[];
  byUser:    { user_id: string; name: string; requests: number; tokens: number; last: string }[];
  byDay:     { day: string; requests: number; tokens: number }[];
  topErrors: { message: string; count: number }[];
}

export function useAiUsage(range: AiUsageRange = "7d") {
  return useQuery({
    queryKey: ["ai-usage", range],
    refetchInterval: 30_000,
    queryFn: async (): Promise<AiUsageSnapshot> => {
      const since = rangeStart(range);
      const { data, error } = await supabase
        .from("ai_usage_events" as never)
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AiUsageRow[];

      const userIds = Array.from(new Set(rows.map(r => r.user_id).filter((x): x is string => !!x)));
      let profilesById: Record<string, string> = {};
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .in("user_id", userIds);
        profilesById = Object.fromEntries(
          ((profs ?? []) as Array<{ user_id: string | null; display_name: string | null; email: string | null }>)
            .filter(p => !!p.user_id)
            .map(p => [p.user_id as string, p.display_name || p.email || (p.user_id as string).slice(0, 8)]),
        );
      }

      const featMap = new Map<string, { requests: number; tokens: number }>();
      const modelMap = new Map<string, { requests: number; tokens: number }>();
      const userMap = new Map<string, { requests: number; tokens: number; last: string }>();
      const dayMap = new Map<string, { requests: number; tokens: number }>();
      const errMap = new Map<string, number>();
      let errorCount = 0;
      let totalTokens = 0;

      for (const r of rows) {
        totalTokens += r.total_tokens || 0;
        if (r.status && r.status !== "ok") {
          errorCount++;
          const k = r.error_message?.slice(0, 80) || r.status;
          errMap.set(k, (errMap.get(k) || 0) + 1);
        }
        const f = featMap.get(r.feature) || { requests: 0, tokens: 0 };
        f.requests++; f.tokens += r.total_tokens || 0;
        featMap.set(r.feature, f);

        const m = r.model || "unknown";
        const mm = modelMap.get(m) || { requests: 0, tokens: 0 };
        mm.requests++; mm.tokens += r.total_tokens || 0;
        modelMap.set(m, mm);

        if (r.user_id) {
          const u = userMap.get(r.user_id) || { requests: 0, tokens: 0, last: r.created_at };
          u.requests++; u.tokens += r.total_tokens || 0;
          if (r.created_at > u.last) u.last = r.created_at;
          userMap.set(r.user_id, u);
        }

        const day = r.created_at.slice(0, 10);
        const d = dayMap.get(day) || { requests: 0, tokens: 0 };
        d.requests++; d.tokens += r.total_tokens || 0;
        dayMap.set(day, d);
      }

      return {
        rows,
        totalRequests: rows.length,
        totalTokens,
        errorCount,
        byFeature: Array.from(featMap, ([feature, v]) => ({ feature, ...v }))
          .sort((a, b) => b.requests - a.requests),
        byModel: Array.from(modelMap, ([model, v]) => ({ model, ...v }))
          .sort((a, b) => b.requests - a.requests),
        byUser: Array.from(userMap, ([user_id, v]) => ({
          user_id, name: profilesById[user_id] || user_id.slice(0, 8), ...v,
        })).sort((a, b) => b.requests - a.requests),
        byDay: Array.from(dayMap, ([day, v]) => ({ day, ...v })).sort((a, b) => a.day.localeCompare(b.day)),
        topErrors: Array.from(errMap, ([message, count]) => ({ message, count }))
          .sort((a, b) => b.count - a.count).slice(0, 5),
      };
    },
  });
}
