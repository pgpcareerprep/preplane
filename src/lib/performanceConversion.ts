/**
 * Shared conversion-rate utilities used by the Performance Summary Strip.
 *
 * Formula (canonical across POC, POD, and domain performance):
 *   Conversion % = Converted ÷ (Total LMPs − Other Reasons) × 100
 */

import { calculateLmpConversionRate } from "@/lib/lmpProcessQueries";

export type PerformanceCounts = {
  converted: number;
  total: number;
  otherReasons: number;
};

/**
 * Returns conversion % or null when no eligible outcomes exist.
 * null prevents a misleading "0%" being displayed for a POC/domain with zero history.
 */
export function calculatePerformanceConversion(counts: PerformanceCounts): number | null {
  return calculateLmpConversionRate(counts.converted, counts.total, counts.otherReasons);
}

export type PerformanceEntry = PerformanceCounts & {
  name: string;
};

function conversionDenominator(counts: PerformanceCounts): number {
  return counts.total - counts.otherReasons;
}

/**
 * Stable tie-break sort order for ranking POCs, PODs, and domains.
 *
 * Priority:
 *   1. Higher conversion percentage
 *   2. Higher Converted count
 *   3. Higher eligible denominator (total − other reasons)
 *   4. Lower Other Reasons count
 *   5. Alphabetical name (stable output)
 */
export function comparePerformance(a: PerformanceEntry, b: PerformanceEntry): number {
  const pctA = calculatePerformanceConversion(a);
  const pctB = calculatePerformanceConversion(b);
  if (pctA !== null && pctB !== null && pctB !== pctA) return pctB - pctA;
  if (b.converted !== a.converted) return b.converted - a.converted;
  const eligA = conversionDenominator(a);
  const eligB = conversionDenominator(b);
  if (eligB !== eligA) return eligB - eligA;
  if (a.otherReasons !== b.otherReasons) return a.otherReasons - b.otherReasons;
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
 * Entities with zero eligible denominator are excluded from ranking.
 */
export function rankPerformance(
  entries: PerformanceEntry[],
): RankedPerformanceResult | null {
  const eligible = entries.filter((e) => conversionDenominator(e) > 0);
  if (!eligible.length) return null;

  const best = [...eligible].sort(comparePerformance)[0];
  const pct = calculatePerformanceConversion(best)!;

  return {
    name: best.name,
    converted: best.converted,
    eligible: conversionDenominator(best),
    pct,
  };
}
