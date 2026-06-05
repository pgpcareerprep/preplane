import type { ExternalDiscoveryConfig } from "./externalDiscoveryConfig";

/**
 * Metadata for each external mentor-discovery platform.
 * This is configuration (label, transport, ToS warnings) — NOT user data.
 * Per-user enable/disable state lives in `externalDiscoveryConfig`.
 */
export type ExternalPlatform = {
  key: keyof Pick<ExternalDiscoveryConfig, "topmate" | "adplist" | "linkedin" | "superpeer">;
  label: string;
  transport: string;
  status: "ok" | "warn" | "low";
  note?: string;
};

export const EXTERNAL_PLATFORMS: ExternalPlatform[] = [
  { key: "topmate",   label: "Topmate",   transport: "API / Scrape",   status: "ok" },
  { key: "adplist",   label: "ADPList",   transport: "API / Scrape",   status: "ok" },
  { key: "linkedin",  label: "LinkedIn",  transport: "Cached Dataset", status: "warn", note: "Read ToS note" },
  { key: "superpeer", label: "Superpeer", transport: "Scrape",         status: "low",  note: "lower signal" },
];

export const EXTERNAL_PLATFORM_STATUS_DOT: Record<ExternalPlatform["status"], string> = {
  ok:   "bg-sage-400",
  warn: "bg-yellow-400",
  low:  "bg-n400",
};
