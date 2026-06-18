/**
 * Shared conversion-rate utilities used by the Performance Summary Strip.
 *
 * Formula (canonical across POC, POD, and domain performance):
 *   Conversion % = Converted ÷ (Converted + Not Converted) × 100
 *
 * Only LMPs with a terminal outcome (Converted OR Not Converted) count toward
 * the denominator. All other statuses (Not Started, Prep Ongoing, Prep Done,
 * On Hold, Other Reasons) are excluded unless the canonical lmpStatusCounts
 * function already maps them to one of the two outcome buckets.
 */

export type PerformanceCounts = {
  converted: number;
  notConverted: number;
};

/**
 * Returns conversion % or null when no eligible outcomes exist.
 * null prevents a misleading "0%" being displayed for a POC/domain with zero history.
 */
export function calculatePerformanceConversion(counts: PerformanceCounts): number | null {
  const eligible = counts.converted + counts.notConverted;
  if (eligible <= 0) return null;
  return (counts.converted / eligible) * 100;
}

export type PerformanceEntry = PerformanceCounts & {
  name: string;
};

/**
 * Stable tie-break sort order for ranking POCs, PODs, and domains.
 *
 * Priority:
 *   1. Higher conversion percentage
 *   2. Higher Converted count
 *   3. Higher eligible outcome count (converted + not-converted)
 *   4. Lower Not Converted count
 *   5. Alphabetical name (stable output)
 */
export function comparePerformance(a: PerformanceEntry, b: PerformanceEntry): number {
  const pctA = calculatePerformanceConversion(a);
  const pctB = calculatePerformanceConversion(b);
  if (pctA !== null && pctB !== null && pctB !== pctA) return pctB - pctA;
  if (b.converted !== a.converted) return b.converted - a.converted;
  const eligA = a.converted + a.notConverted;
  const eligB = b.converted + b.notConverted;
  if (eligB !== eligA) return eligB - eligA;
  if (a.notConverted !== b.notConverted) return a.notConverted - b.notConverted;
  return a.name.localeCompare(b.name);
}

export type RankedPerformanceResult = {
  name: string;
  converted: number;
  eligible: number;
  pct: number;
};

/**
 * Given a map of entity→counts, return the top-ranked entity or null.
 *
 * Entities with zero eligible outcomes (converted + not-converted = 0) are
 * excluded from ranking — they have no meaningful conversion signal.
 * Minimum eligible threshold: 1.
 */
export function rankPerformance(
  entries: PerformanceEntry[],
): RankedPerformanceResult | null {
  const eligible = entries.filter((e) => e.converted + e.notConverted >= 1);
  if (!eligible.length) return null;

  const best = [...eligible].sort(comparePerformance)[0];
  const pct = calculatePerformanceConversion(best)!;

  return {
    name: best.name,
    converted: best.converted,
    eligible: best.converted + best.notConverted,
    pct,
  };
}
