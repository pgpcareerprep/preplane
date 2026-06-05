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
const CACHE_KEY = "lmp_scoring_weights_cache_v2";
const EVENT = "lmp_scoring_weights_changed";

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
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { ...DEFAULT_WEIGHTS };
    return normalize(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
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
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: w }));
  } catch {
    // ignore
  }
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
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(w));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: w }));
  } catch {
    // ignore
  }
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
    window.addEventListener("storage", handler);
    return () => {
      mounted = false;
      window.removeEventListener(EVENT, handler);
      window.removeEventListener("storage", handler);
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
