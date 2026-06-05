// External Mentor Discovery — config persisted to localStorage.

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

const KEY = "externalDiscoveryConfig";

export const DEFAULT_EXTERNAL_DISCOVERY_CONFIG: ExternalDiscoveryConfig = {
  topmate: true,
  adplist: true,
  linkedin: false,
  superpeer: false,
  region: "global",
  ttl: { topmate: 6, adplist: 6, linkedin: 24 },
};

export function getExternalDiscoveryConfig(): ExternalDiscoveryConfig & { anyEnabled: boolean } {
  let cfg: ExternalDiscoveryConfig = DEFAULT_EXTERNAL_DISCOVERY_CONFIG;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ExternalDiscoveryConfig>;
      cfg = {
        ...DEFAULT_EXTERNAL_DISCOVERY_CONFIG,
        ...parsed,
        ttl: { ...DEFAULT_EXTERNAL_DISCOVERY_CONFIG.ttl, ...(parsed.ttl || {}) },
      };
    }
  } catch {
    /* ignore */
  }
  const anyEnabled = cfg.topmate || cfg.adplist || cfg.linkedin || cfg.superpeer;
  return { ...cfg, anyEnabled };
}

export function setExternalDiscoveryConfig(cfg: ExternalDiscoveryConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}
