/**
 * Shared conversion-rate utilities for dashboard performance ranking.
 *
 * Two canonical formulas:
 *   LMP process:  Converted ÷ (Total LMPs − closed) × 100
 *   POC performance: Converted ÷ (Converted + Not Converted) × 100
 */

import {
  calculateLmpConversionRate,
  calculatePocPerformanceConversionRate,
} from "@/lib/lmpProcessQueries";

export type LmpProcessCounts = {
  converted: number;
  total: number;
  closed: number;
};

export type PocPerformanceCounts = {
  converted: number;
  notConverted: number;
};

/** @deprecated Use LmpProcessCounts or PocPerformanceCounts explicitly. */
export type PerformanceCounts = LmpProcessCounts & { otherReasons: number };

export function calculateLmpProcessConversion(counts: LmpProcessCounts): number | null {
  return calculateLmpConversionRate(counts.converted, counts.total, counts.closed);
}

export function calculatePocPerformanceConversion(counts: PocPerformanceCounts): number | null {
  return calculatePocPerformanceConversionRate(counts.converted, counts.notConverted);
}

/** @deprecated Use calculateLmpProcessConversion or calculatePocPerformanceConversion. */
export function calculatePerformanceConversion(counts: PerformanceCounts): number | null {
  return calculateLmpProcessConversion({
    converted: counts.converted,
    total: counts.total,
    closed: counts.closed ?? counts.otherReasons,
  });
}

export type LmpProcessEntry = LmpProcessCounts & { name: string };
export type PocPerformanceEntry = PocPerformanceCounts & { name: string };

function lmpDenominator(counts: LmpProcessCounts): number {
  return counts.total - counts.closed;
}

function pocDenominator(counts: PocPerformanceCounts): number {
  return counts.converted + counts.notConverted;
}

function compareLmpProcess(a: LmpProcessEntry, b: LmpProcessEntry): number {
  const pctA = calculateLmpProcessConversion(a);
  const pctB = calculateLmpProcessConversion(b);
  if (pctA !== null && pctB !== null && pctB !== pctA) return pctB - pctA;
  if (b.converted !== a.converted) return b.converted - a.converted;
  const eligA = lmpDenominator(a);
  const eligB = lmpDenominator(b);
  if (eligB !== eligA) return eligB - eligA;
  if (a.closed !== b.closed) return a.closed - b.closed;
  return a.name.localeCompare(b.name);
}

function comparePocPerformance(a: PocPerformanceEntry, b: PocPerformanceEntry): number {
  const pctA = calculatePocPerformanceConversion(a);
  const pctB = calculatePocPerformanceConversion(b);
  if (pctA !== null && pctB !== null && pctB !== pctA) return pctB - pctA;
  if (b.converted !== a.converted) return b.converted - a.converted;
  const eligA = pocDenominator(a);
  const eligB = pocDenominator(b);
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

export function rankLmpProcessPerformance(entries: LmpProcessEntry[]): RankedPerformanceResult | null {
  const eligible = entries.filter((e) => lmpDenominator(e) > 0);
  if (!eligible.length) return null;
  const best = [...eligible].sort(compareLmpProcess)[0];
  return {
    name: best.name,
    converted: best.converted,
    eligible: lmpDenominator(best),
    pct: calculateLmpProcessConversion(best)!,
  };
}

export function rankPocPerformance(entries: PocPerformanceEntry[]): RankedPerformanceResult | null {
  const eligible = entries.filter((e) => pocDenominator(e) > 0);
  if (!eligible.length) return null;
  const best = [...eligible].sort(comparePocPerformance)[0];
  return {
    name: best.name,
    converted: best.converted,
    eligible: pocDenominator(best),
    pct: calculatePocPerformanceConversion(best)!,
  };
}

/** @deprecated Use rankLmpProcessPerformance or rankPocPerformance. */
export function comparePerformance(
  a: PerformanceCounts & { name: string },
  b: PerformanceCounts & { name: string },
): number {
  return compareLmpProcess(
    { name: a.name, converted: a.converted, total: a.total, closed: a.closed ?? a.otherReasons },
    { name: b.name, converted: b.converted, total: b.total, closed: b.closed ?? b.otherReasons },
  );
}

/** @deprecated Use rankLmpProcessPerformance or rankPocPerformance. */
export function rankPerformance(entries: (PerformanceCounts & { name: string })[]): RankedPerformanceResult | null {
  return rankLmpProcessPerformance(
    entries.map((e) => ({
      name: e.name,
      converted: e.converted,
      total: e.total,
      closed: e.closed ?? e.otherReasons,
    })),
  );
}
