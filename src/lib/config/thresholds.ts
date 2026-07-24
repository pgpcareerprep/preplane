/**
 * Centralized platform threshold constants.
 * These are the static defaults; runtime-tunable thresholds live in
 * `system_settings.platform_thresholds` and are surfaced via
 * `usePlatformThresholds()` / `getPlatformThresholds()` in
 * `src/lib/platformThresholds.ts`.
 */

/** Days without activity before an LMP/process is flagged dormant. */
export const SLA_DORMANT_DAYS = 14;

/** Days without a progress update before the "No Updates > 3 Days" flag. */
export const NO_PROGRESS_UPDATE_DAYS = 3;

/** Days without a status change before the "Status Unchanged > 7 Days" flag. */
export const STATUS_UNCHANGED_DAYS = 7;

/** Days without status/progress/checklist activity before the "Dormant" flag. */
export const LMP_INACTIVITY_DAYS = 20;

/** Ongoing-process count above which a POC is considered overloaded. */
export const POC_OVERLOAD_THRESHOLD = 10;

/** Default total mentor candidates retained after merging MU + ALU + EXT pipelines. */
export const TOTAL_LIMIT = 15;

/** Expanded suggestion cap used only by the LMP Mentors tab. */
export const LMP_MENTOR_SUGGESTION_LIMIT = 30;

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
