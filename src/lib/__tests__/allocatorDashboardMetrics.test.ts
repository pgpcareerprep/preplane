import { describe, it, expect } from "vitest";
import { isUserOperationalPoc } from "@/lib/lmpViewingContext";
import type { LmpRecord } from "@/lib/lmpTypes";
import {
  countActiveLmps,
  countAllocatedDomains,
  countCompletedThisMonth,
  sortRecentlyUpdated,
  taskStatusSegments,
} from "@/lib/allocatorDashboardMetrics";

function makeRec(overrides: Partial<LmpRecord> = {}): LmpRecord {
  return {
    id: "lmp-1",
    reqId: "REQ-1",
    company: "Acme",
    role: "PM",
    domain: "Consulting",
    candidates: 0,
    stage: "R1",
    status: "prep-ongoing",
    pocs: [],
    health: "Healthy",
    slaDays: 30,
    createdAt: "2025-01-01T00:00:00Z",
    lastActivity: "2025-06-01T00:00:00Z",
    ...overrides,
  } as LmpRecord;
}

describe("allocatorDashboardMetrics", () => {
  const rows = [
    makeRec({ id: "a", domain: "Consulting", status: "not-started" }),
    makeRec({ id: "b", domain: "Data", status: "prep-ongoing", lastActivity: "2025-06-10T00:00:00Z" }),
    makeRec({ id: "c", domain: "Consulting", status: "prep-done" }),
    makeRec({
      id: "d",
      domain: "Sales",
      status: "converted",
      lastActivity: "2025-06-15T00:00:00Z",
      closingDate: "2025-06-15T00:00:00Z",
    }),
  ];

  it("uses live record fields — no hardcoded counts", () => {
    expect(countAllocatedDomains(rows)).toBe(3);
    expect(countActiveLmps(rows)).toBe(3);
    expect(taskStatusSegments(rows).reduce((s, x) => s + x.value, 0)).toBeGreaterThan(0);
  });

  it("completed this month uses closing/activity timestamps", () => {
    const now = new Date("2025-06-20T00:00:00Z");
    expect(countCompletedThisMonth(rows, now)).toBe(1);
    expect(countCompletedThisMonth(rows, new Date("2025-07-01T00:00:00Z"))).toBe(0);
  });

  it("sortRecentlyUpdated orders by latest timestamp", () => {
    const sorted = sortRecentlyUpdated(rows, 2);
    expect(sorted.map((r) => r.id)).toEqual(["d", "b"]);
  });
});

describe("POC dashboard scoping excludes allocator-only ownership", () => {
  it("allocator/admin-owner fields do not grant operational POC scope", () => {
    const rec = makeRec({
      allocator: "Allocator Bob",
      adminOwner: "Admin Carol",
      prepPoc: undefined,
      supportPoc: undefined,
      prepPocId: undefined,
      supportPocId: undefined,
    });
    expect(isUserOperationalPoc(rec, "Allocator Bob")).toBe(false);
    expect(isUserOperationalPoc(rec, "Admin Carol")).toBe(false);
  });

  it("prep/support links still grant operational POC scope", () => {
    const rec = makeRec({
      prepPoc: { name: "Vidit Sinha", initials: "VS", color: "#000" },
      prepPocId: "poc-uuid",
    });
    expect(isUserOperationalPoc(rec, "Vidit Sinha", "poc-uuid")).toBe(true);
  });
});
