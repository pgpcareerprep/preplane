import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ScoringWeights = {
  role: number;
  skills: number;
  company: number;
  industry: number;
  seniority: number;
};

export const DEFAULT_WEIGHTS: ScoringWeights = {
  role: 35,
  skills: 25,
  company: 15,
  industry: 15,
  seniority: 10,
};

const SETTINGS_KEY = "scoring_weights";
const EVENT = "lmp_scoring_weights_changed";
let currentWeights = { ...DEFAULT_WEIGHTS };

function normalize(raw: unknown): ScoringWeights {
  const p = (raw ?? {}) as Partial<ScoringWeights>;
  return {
    role: Number(p.role ?? DEFAULT_WEIGHTS.role),
    skills: Number(p.skills ?? DEFAULT_WEIGHTS.skills),
    company: Number(p.company ?? DEFAULT_WEIGHTS.company),
    industry: Number(p.industry ?? DEFAULT_WEIGHTS.industry),
    seniority: Number(p.seniority ?? DEFAULT_WEIGHTS.seniority),
  };
}

/** Synchronous read — returns cached value if available, else defaults. */
export function getScoringWeights(): ScoringWeights {
  return { ...currentWeights };
}

/** Authoritative read from system_settings (refreshes cache). */
export async function fetchScoringWeights(): Promise<ScoringWeights> {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (error) throw error;
  const w = normalize(data?.value);
  currentWeights = w;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: w }));
  return w;
}

export async function saveScoringWeights(w: ScoringWeights): Promise<void> {
  const { error } = await supabase
    .from("system_settings")
    .upsert(
      { key: SETTINGS_KEY, value: w as unknown as never, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw error;
  currentWeights = normalize(w);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: currentWeights }));
}

export function useScoringWeights(): ScoringWeights {
  const [w, setW] = useState<ScoringWeights>(() => getScoringWeights());
  useEffect(() => {
    let mounted = true;
    fetchScoringWeights()
      .then((next) => {
        if (mounted) setW(next);
      })
      .catch(() => {
        // keep cache/defaults
      });
    const handler = () => setW(getScoringWeights());
    window.addEventListener(EVENT, handler);
    return () => {
      mounted = false;
      window.removeEventListener(EVENT, handler);
    };
  }, []);
  return w;
}

/** Multiplier for a given signal vs the Balanced default. 0 disables signal. */
export function weightFactor(w: ScoringWeights, key: keyof ScoringWeights): number {
  const def = DEFAULT_WEIGHTS[key];
  if (!def) return 1;
  return w[key] / def;
}
