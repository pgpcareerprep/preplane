/**
 * Centralized platform threshold constants.
 * These are the static defaults; runtime-tunable thresholds live in
 * `system_settings.platform_thresholds` and are surfaced via
 * `usePlatformThresholds()` / `getPlatformThresholds()` in
 * `src/lib/platformThresholds.ts`.
 */

/** Days without activity before an LMP/process is flagged dormant. */
export const SLA_DORMANT_DAYS = 14;

/** Ongoing-process count above which a POC is considered overloaded. */
export const POC_OVERLOAD_THRESHOLD = 10;

/** Total mentor candidates retained after merging MU + ALU + EXT pipelines. */
export const TOTAL_LIMIT = 15;

/** If MU+ALU yield >= this many mentors, the external (EXT) pipeline is skipped. */
export const SKIP_EXT_THRESHOLD = 25;

/** Window (days) used to classify a mentor as "active" in performance rollups. */
export const ACTIVE_WINDOW_DAYS = 30;

/** POC workload band thresholds (% of POC concurrent limit). */
export const WORKLOAD_BANDS = {
  slow: 75,
  red: 85,
  stuck: 95,
} as const;

export {
  usePlatformThresholds,
  getPlatformThresholds,
  fetchPlatformThresholds,
  savePlatformThresholds,
  DEFAULT_THRESHOLDS,
  type PlatformThresholds,
} from "@/lib/platformThresholds";
