import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type InsightsRange = "24h" | "7d" | "30d";

export interface CopilotTurnRow {
  id: string;
  user_id: string | null;
  thread_id: string | null;
  created_at: string;
  latency_ms: number | null;
  role: string | null;
  mode: string | null;
  scope: string | null;
  model: string | null;
  intent: string | null;
  prompt_chars: number | null;
  response_chars: number | null;
  tool_rounds: number | null;
  tool_calls_count: number | null;
  tools_used: unknown;
  used_write_tool: boolean | null;
  cache_hit: boolean | null;
  status: string | null;
  error_message: string | null;
}

export interface InsightsAggregates {
  total: number;
  uniqueUsers: number;
  uniqueThreads: number;
  errorCount: number;
  errorRate: number;
  cacheHits: number;
  cacheRate: number;
  writeTurns: number;
  writeRate: number;
  latency: { p50: number; p95: number; avg: number };
  cachedAvgMs: number;
  missAvgMs: number;
  perDay: { day: string; ok: number; error: number; p50: number; p95: number }[];
  modeMix: { name: string; value: number }[];
  intentMix: { name: string; value: number }[];
  topTools: { name: string; value: number }[];
  statusMix: { name: string; value: number }[];
}

function rangeToHours(r: InsightsRange): number {
  return r === "24h" ? 24 : r === "7d" ? 24 * 7 : 24 * 30;
}

function pct(n: number, d: number) {
  return d === 0 ? 0 : (n / d) * 100;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function aggregate(rows: CopilotTurnRow[]): InsightsAggregates {
  const total = rows.length;
  const uniqueUsers = new Set(rows.map((r) => r.user_id).filter(Boolean)).size;
  const uniqueThreads = new Set(rows.map((r) => r.thread_id).filter(Boolean)).size;
  const errorRows = rows.filter((r) => r.status && r.status !== "ok" && r.status !== "ok_nostream" && r.status !== "ok_empty_stream");
  const cacheHitRows = rows.filter((r) => r.cache_hit);
  const writeRows = rows.filter((r) => r.used_write_tool);

  const latencies = rows.map((r) => r.latency_ms || 0).filter((n) => n > 0).sort((a, b) => a - b);
  const avg = latencies.length ? latencies.reduce((s, v) => s + v, 0) / latencies.length : 0;

  const cachedLat = cacheHitRows.map((r) => r.latency_ms || 0).filter((n) => n > 0);
  const missLat = rows.filter((r) => !r.cache_hit).map((r) => r.latency_ms || 0).filter((n) => n > 0);
  const cachedAvgMs = cachedLat.length ? cachedLat.reduce((s, v) => s + v, 0) / cachedLat.length : 0;
  const missAvgMs = missLat.length ? missLat.reduce((s, v) => s + v, 0) / missLat.length : 0;

  // Per-day buckets
  const dayMap = new Map<string, { ok: number; error: number; lats: number[] }>();
  for (const r of rows) {
    const day = (r.created_at || "").slice(0, 10);
    if (!day) continue;
    const bucket = dayMap.get(day) ?? { ok: 0, error: 0, lats: [] };
    if (errorRows.includes(r)) bucket.error++; else bucket.ok++;
    if (r.latency_ms && r.latency_ms > 0) bucket.lats.push(r.latency_ms);
    dayMap.set(day, bucket);
  }
  const perDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, b]) => {
      const sorted = [...b.lats].sort((x, y) => x - y);
      return { day, ok: b.ok, error: b.error, p50: percentile(sorted, 50), p95: percentile(sorted, 95) };
    });

  const counter = (key: keyof CopilotTurnRow) => {
    const m = new Map<string, number>();
    for (const r of rows) {
      const k = (r[key] as string | null) || "unknown";
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  };

  const toolCounter = new Map<string, number>();
  for (const r of rows) {
    const tools = Array.isArray(r.tools_used) ? (r.tools_used as string[]) : [];
    for (const t of tools) toolCounter.set(t, (toolCounter.get(t) || 0) + 1);
  }
  const topTools = [...toolCounter.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  return {
    total,
    uniqueUsers,
    uniqueThreads,
    errorCount: errorRows.length,
    errorRate: pct(errorRows.length, total),
    cacheHits: cacheHitRows.length,
    cacheRate: pct(cacheHitRows.length, total),
    writeTurns: writeRows.length,
    writeRate: pct(writeRows.length, total),
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95), avg },
    cachedAvgMs,
    missAvgMs,
    perDay,
    modeMix: counter("mode"),
    intentMix: counter("intent"),
    topTools,
    statusMix: counter("status"),
  };
}

export function useCopilotInsights(range: InsightsRange) {
  const [rows, setRows] = useState<CopilotTurnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const since = new Date(Date.now() - rangeToHours(range) * 3600 * 1000).toISOString();
    const { data, error } = await supabase
      .from("copilot_turns")
      .select("id,user_id,thread_id,created_at,latency_ms,role,mode,scope,model,intent,prompt_chars,response_chars,tool_rounds,tool_calls_count,tools_used,used_write_tool,cache_hit,status,error_message")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as CopilotTurnRow[]);
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { rows, aggregates: aggregate(rows), loading, error, refresh };
}
