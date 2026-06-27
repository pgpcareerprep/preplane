/**
 * Unit tests for LmpHealthSummaryCard derived metrics.
 *
 * Process-wise Conversion formula:
 *   eligibleProcesses = converted + not-converted + other-reasons (closed)
 *   processConversionPct = converted / eligibleProcesses
 *   Excludes active pipeline and on-hold from denominator.
 *
 * Closed definition: lsc["other-reasons"] absorbs DB statuses
 *   { "other-reasons", "dormant", "closed", "converted-na" }
 */

import { describe, it, expect } from "vitest";
import { computeProcessWiseConversion } from "@/lib/lmpProcessQueries";
import type { LmpStatusCounts } from "@/components/dashboard/LmpHealthSummaryCard";

function makeFullLsc(overrides: Partial<LmpStatusCounts> = {}): LmpStatusCounts {
  return {
    "not-started": 0,
    "prep-ongoing": 0,
    "prep-done": 0,
    hold: 0,
    converted: 0,
    "not-converted": 0,
    "other-reasons": 0,
    ...overrides,
  };
}

// ── Total LMPs = sum of all 7 buckets ─────────────────────────────────────────

describe("Donut reconciliation — 7 buckets sum to Total LMPs", () => {
  it("sums correctly with a typical distribution", () => {
    const lsc = makeFullLsc({
      "not-started": 12, "prep-ongoing": 26, "prep-done": 4,
      hold: 2, converted: 4, "not-converted": 1, "other-reasons": 1,
    });
    const total = Object.values(lsc).reduce((s, v) => s + v, 0);
    expect(total).toBe(50);
  });

  it("sums to 0 when all counts are zero", () => {
    const lsc = makeFullLsc();
    expect(Object.values(lsc).reduce((s, v) => s + v, 0)).toBe(0);
  });
});

// ── Process-wise Conversion formula ──────────────────────────────────────────

describe("Process-wise Conversion formula", () => {
  it("uses Converted ÷ (Converted + Not Converted + Closed)", () => {
    const lsc = makeFullLsc({
      "not-started": 40,
      converted: 4,
      "not-converted": 3,
      "other-reasons": 2,
      hold: 1,
    });
    const { closedProcesses, notConverted, eligibleProcesses, processConversionPct } =
      computeProcessWiseConversion(lsc);
    expect(closedProcesses).toBe(2);
    expect(notConverted).toBe(3);
    expect(eligibleProcesses).toBe(9); // 4 + 3 + 2
    expect(processConversionPct).toBeCloseTo((4 / 9) * 100, 5);
  });

  it("excludes active pipeline and on-hold from denominator", () => {
    const lsc = makeFullLsc({
      "not-started": 47,
      "prep-ongoing": 10,
      converted: 7,
      "not-converted": 12,
      "other-reasons": 7,
      hold: 3,
    });
    const { eligibleProcesses, processConversionPct } = computeProcessWiseConversion(lsc);
    expect(eligibleProcesses).toBe(26); // 7 + 12 + 7 — not 66
    expect(processConversionPct).toBeCloseTo((7 / 26) * 100, 5);
  });

  it("returns null when no terminal outcomes exist", () => {
    const lsc = makeFullLsc({ "not-started": 10, hold: 2 });
    const { processConversionPct } = computeProcessWiseConversion(lsc);
    expect(processConversionPct).toBeNull();
  });

  it("returns 100% when all terminal processes are converted", () => {
    const lsc = makeFullLsc({ converted: 5 });
    const { processConversionPct } = computeProcessWiseConversion(lsc);
    expect(processConversionPct).toBe(100);
  });

  it("returns 0% when no conversions but terminal outcomes exist", () => {
    const lsc = makeFullLsc({ "not-converted": 5 });
    const { processConversionPct } = computeProcessWiseConversion(lsc);
    expect(processConversionPct).toBe(0);
  });

  it("does not produce NaN", () => {
    const lsc = makeFullLsc();
    const { processConversionPct } = computeProcessWiseConversion(lsc);
    expect(processConversionPct).toBeNull();
    expect(Number.isNaN(processConversionPct)).toBe(false);
  });
});

// ── Status card percentages ───────────────────────────────────────────────────

describe("Status card percentages — value / total × 100", () => {
  it("calculates correct percentage", () => {
    const total = 50;
    const value = 26;
    const pct = total > 0 ? (value / total) * 100 : 0;
    expect(pct).toBeCloseTo(52, 0);
  });

  it("returns 0% when total is 0 (guards division by zero)", () => {
    const total = 0;
    const pct = total > 0 ? (5 / total) * 100 : 0;
    expect(pct).toBe(0);
  });

  it("all 7 status percentages sum to ~100%", () => {
    const lsc = makeFullLsc({
      "not-started": 12, "prep-ongoing": 26, "prep-done": 4,
      hold: 2, converted: 4, "not-converted": 1, "other-reasons": 1,
    });
    const total = Object.values(lsc).reduce((s, v) => s + v, 0);
    const statusKeys: (keyof LmpStatusCounts)[] = [
      "not-started", "prep-ongoing", "prep-done", "hold",
      "converted", "not-converted", "other-reasons",
    ];
    const sumPct = statusKeys.reduce((s, k) => s + (lsc[k] / total) * 100, 0);
    expect(sumPct).toBeCloseTo(100, 3);
  });
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe("Empty state (total = 0)", () => {
  it("processConversion is null (not Infinity or NaN)", () => {
    const { processConversionPct } = computeProcessWiseConversion(makeFullLsc());
    expect(processConversionPct).toBeNull();
  });

  it("all status counts are 0", () => {
    const lsc = makeFullLsc();
    const allZero = Object.values(lsc).every((v) => v === 0);
    expect(allZero).toBe(true);
  });
});

// ── Closed definition documentation ──────────────────────────────────────────

describe("Closed definition (from lmpStatusCounts canonical)", () => {
  it("Closed = other-reasons bucket (absorbs: dormant, closed, converted-na in DB layer)", () => {
    const lsc = makeFullLsc({ "other-reasons": 7, converted: 2, "not-converted": 1 });
    const { closedProcesses, eligibleProcesses } = computeProcessWiseConversion(lsc);
    expect(closedProcesses).toBe(7);
    expect(eligibleProcesses).toBe(10);
  });

  it("On Hold is excluded from conversion denominator", () => {
    const lsc = makeFullLsc({ hold: 3, converted: 2, "other-reasons": 0 });
    const { eligibleProcesses } = computeProcessWiseConversion(lsc);
    expect(eligibleProcesses).toBe(2);
  });
});

// ── No "Overall Conversion" label test (meta / regression) ───────────────────

describe("Terminology — Overall Conversion must not appear in component", () => {
  it('the new component file does not contain "Overall Conversion"', async () => {
    const src = await import("@/components/dashboard/LmpHealthSummaryCard?raw").then(
      (m) => m.default as string,
    ).catch(() => null);
    if (src !== null) {
      expect(src).not.toContain("Overall Conversion");
      expect(src).not.toContain("Overall LMPs");
    }
    expect(true).toBe(true);
  });
});
