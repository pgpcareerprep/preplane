/**
 * Tests for dashboard KPI status-counting logic.
 * Verifies that legacy status aliases (dormant, on-hold, offer-received, etc.)
 * are correctly normalized into canonical KPI buckets.
 */
import { describe, it, expect } from "vitest";

// Mirror of the normalization logic in useDashboardKpis.ts
// so we can unit-test it without mocking Supabase.
function computeKpis(statusRows: { status: string }[]) {
  const byStatus: Record<string, number> = {};
  for (const r of statusRows) {
    const k = String(r.status ?? "").toLowerCase();
    byStatus[k] = (byStatus[k] ?? 0) + 1;
  }
  const n = (k: string) => byStatus[k] ?? 0;
  return {
    totalProcesses: statusRows.length,
    ongoing: n("prep-ongoing") + n("ongoing"),
    converted: n("converted") + n("offer-received"),
    notConverted: n("not-converted") + n("closed") + n("converted-na") + n("other-reasons"),
    hold: n("hold") + n("on-hold") + n("dormant"),
    notStarted: n("not-started"),
  };
}

describe("dashboard KPI status normalization", () => {
  it("counts canonical prep-ongoing status", () => {
    const rows = [{ status: "prep-ongoing" }, { status: "prep-ongoing" }];
    const kpis = computeKpis(rows);
    expect(kpis.ongoing).toBe(2);
    expect(kpis.totalProcesses).toBe(2);
  });

  it("maps legacy 'ongoing' alias to ongoing bucket", () => {
    const rows = [{ status: "ongoing" }, { status: "prep-ongoing" }];
    const kpis = computeKpis(rows);
    expect(kpis.ongoing).toBe(2);
  });

  it("maps legacy 'offer-received' to converted bucket", () => {
    const rows = [{ status: "converted" }, { status: "offer-received" }];
    const kpis = computeKpis(rows);
    expect(kpis.converted).toBe(2);
  });

  it("maps 'closed', 'converted-na', 'other-reasons' to notConverted", () => {
    const rows = [
      { status: "not-converted" },
      { status: "closed" },
      { status: "converted-na" },
      { status: "other-reasons" },
    ];
    const kpis = computeKpis(rows);
    expect(kpis.notConverted).toBe(4);
  });

  it("maps legacy 'dormant' and 'on-hold' to hold bucket", () => {
    const rows = [{ status: "hold" }, { status: "dormant" }, { status: "on-hold" }];
    const kpis = computeKpis(rows);
    expect(kpis.hold).toBe(3);
  });

  it("handles mixed statuses from different sync paths", () => {
    const rows = [
      { status: "prep-ongoing" }, // new DB path
      { status: "ongoing" },      // old sheet-sync path
      { status: "converted" },
      { status: "offer-received" },
      { status: "not-started" },
      { status: "dormant" },
      { status: "closed" },
    ];
    const kpis = computeKpis(rows);
    expect(kpis.totalProcesses).toBe(7);
    expect(kpis.ongoing).toBe(2);
    expect(kpis.converted).toBe(2);
    expect(kpis.notConverted).toBe(1);
    expect(kpis.hold).toBe(1);
    expect(kpis.notStarted).toBe(1);
    // Totals should add up
    expect(kpis.ongoing + kpis.converted + kpis.notConverted + kpis.hold + kpis.notStarted)
      .toBe(kpis.totalProcesses);
  });

  it("returns zeros for empty input", () => {
    const kpis = computeKpis([]);
    expect(kpis.totalProcesses).toBe(0);
    expect(kpis.ongoing).toBe(0);
    expect(kpis.converted).toBe(0);
  });

  it("is case-insensitive (normalizes uppercase status values)", () => {
    const rows = [{ status: "PREP-ONGOING" }, { status: "Converted" }];
    const kpis = computeKpis(rows);
    expect(kpis.ongoing).toBe(1);
    expect(kpis.converted).toBe(1);
  });
});
