// External Mentor Discovery — system_settings is authoritative.
import { supabase } from "@/integrations/supabase/client";

export type ExternalPlatformKey = "topmate" | "adplist" | "linkedin" | "superpeer";

export type ExternalRegion = "global" | "in" | "us" | "uk" | "eu" | "sg" | "ae";

export const EXTERNAL_REGION_OPTIONS: { value: ExternalRegion; label: string; country?: string }[] = [
  { value: "global", label: "Global (any region)" },
  { value: "in",     label: "India",           country: "IN" },
  { value: "us",     label: "United States",   country: "US" },
  { value: "uk",     label: "United Kingdom",  country: "GB" },
  { value: "eu",     label: "Europe",          country: "DE" },
  { value: "sg",     label: "Singapore",       country: "SG" },
  { value: "ae",     label: "UAE",             country: "AE" },
];

export type ExternalDiscoveryConfig = {
  topmate: boolean;
  adplist: boolean;
  linkedin: boolean;
  superpeer: boolean;
  region: ExternalRegion;
  ttl: {
    topmate: number;   // hours
    adplist: number;   // hours
    linkedin: number;  // hours
  };
};

const SETTINGS_KEY = "external_discovery_config";
let currentConfig: ExternalDiscoveryConfig;

export const DEFAULT_EXTERNAL_DISCOVERY_CONFIG: ExternalDiscoveryConfig = {
  topmate: true,
  adplist: true,
  linkedin: false,
  superpeer: false,
  region: "global",
  ttl: { topmate: 6, adplist: 6, linkedin: 24 },
};
currentConfig = { ...DEFAULT_EXTERNAL_DISCOVERY_CONFIG, ttl: { ...DEFAULT_EXTERNAL_DISCOVERY_CONFIG.ttl } };

export function getExternalDiscoveryConfig(): ExternalDiscoveryConfig & { anyEnabled: boolean } {
  const cfg = currentConfig;
  const anyEnabled = cfg.topmate || cfg.adplist || cfg.linkedin || cfg.superpeer;
  return { ...cfg, anyEnabled };
}

export async function fetchExternalDiscoveryConfig(): Promise<ExternalDiscoveryConfig> {
  const { data, error } = await supabase.from("system_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  if (error) throw error;
  const parsed = (data?.value ?? {}) as Partial<ExternalDiscoveryConfig>;
  currentConfig = {
    ...DEFAULT_EXTERNAL_DISCOVERY_CONFIG,
    ...parsed,
    ttl: { ...DEFAULT_EXTERNAL_DISCOVERY_CONFIG.ttl, ...(parsed.ttl || {}) },
  };
  return currentConfig;
}

export async function setExternalDiscoveryConfig(cfg: ExternalDiscoveryConfig): Promise<void> {
  const { error } = await supabase.from("system_settings").upsert({
    key: SETTINGS_KEY,
    value: cfg as unknown as never,
    updated_at: new Date().toISOString(),
  }, { onConflict: "key" });
  if (error) throw error;
  currentConfig = { ...cfg, ttl: { ...cfg.ttl } };
}
