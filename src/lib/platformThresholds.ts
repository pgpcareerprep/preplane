import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type PlatformThresholds = {
  /** Max active processes a single POC can own at once. */
  poc_concurrent: number;
  /** Percentage of POC limit at which the "near capacity" warning fires. */
  near_threshold: number;
  /** Days without activity before an LMP is flagged dormant. */
  sla_dormant_days: number;
  /** PocWorkloadTable thresholds (% of POC concurrent limit). */
  workload_slow_pct: number;
  workload_red_pct: number;
  workload_stuck_pct: number;
};

export const DEFAULT_THRESHOLDS: PlatformThresholds = {
  poc_concurrent: 12,
  near_threshold: 80,
  sla_dormant_days: 14,
  workload_slow_pct: 75,
  workload_red_pct: 85,
  workload_stuck_pct: 95,
};

const SETTINGS_KEY = "platform_thresholds";
const EVENT = "lmp_platform_thresholds_changed";
let currentThresholds = { ...DEFAULT_THRESHOLDS };

function normalize(raw: unknown): PlatformThresholds {
  const p = (raw ?? {}) as Partial<PlatformThresholds>;
  const out = { ...DEFAULT_THRESHOLDS };
  (Object.keys(DEFAULT_THRESHOLDS) as (keyof PlatformThresholds)[]).forEach((k) => {
    const v = p[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  });
  return out;
}

export function getPlatformThresholds(): PlatformThresholds {
  return { ...currentThresholds };
}

export async function fetchPlatformThresholds(): Promise<PlatformThresholds> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  const v = normalize(data?.value);
  currentThresholds = v;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
  return v;
}

export async function savePlatformThresholds(v: PlatformThresholds): Promise<void> {
  const { error } = await supabase
    .from("system_settings")
    .upsert(
      { key: SETTINGS_KEY, value: v as unknown as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
  currentThresholds = normalize(v);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: currentThresholds }));
}

export function usePlatformThresholds(): PlatformThresholds {
  const [v, setV] = useState<PlatformThresholds>(() => getPlatformThresholds());
  useEffect(() => {
    let mounted = true;
    fetchPlatformThresholds()
      .then((next) => { if (mounted) setV(next); })
      .catch(() => { /* keep cache/defaults */ });
    const handler = () => setV(getPlatformThresholds());
    window.addEventListener(EVENT, handler);
    return () => {
      mounted = false;
      window.removeEventListener(EVENT, handler);
    };
  }, []);
  return v;
}
