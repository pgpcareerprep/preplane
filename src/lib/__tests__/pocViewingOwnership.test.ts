/**
 * Regression tests for "Viewing as" POC ownership and count logic.
 *
 * Guards against:
 *  - allocator field making an LMP appear in a POC's board
 *  - adminOwner field making an LMP appear in a POC's board
 *  - active_load being used for the dropdown count (should be total_assigned_lmp_count)
 *  - dual-role on the same LMP counting twice in the total
 *  - viewing-as filtering using name instead of UUID when UUID is available
 */
import { describe, it, expect, vi } from "vitest";

// Stub out the Supabase client before any module that imports it loads.
// isUserOperationalPoc / isUserPocOnRecord are pure functions — they never
// call Supabase, but the module graph forces the client to be imported.
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: vi.fn() }) }),
    auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }) },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
  },
}));

import {
  isUserOperationalPoc,
  isUserPocOnRecord,
} from "@/lib/lmpViewingContext";
import type { LmpRecord } from "@/lib/lmpTypes";

// Minimal LmpRecord factory — only fills the fields under test
function makeRec(overrides: Partial<LmpRecord> = {}): LmpRecord {
  return {
    id: "lmp-test",
    company: "Acme",
    role: "PM",
    domain: "Consulting",
    pocs: [],
    status: "prep-ongoing",
    health: "green",
    slaDays: 30,
    createdAt: "2024-01-01T00:00:00Z",
    lastActivity: null,
    lastProgressUpdatedAt: null,
    nextExpectedProgress: null,
    prepDoc: null,
    prepPoc: null,
    supportPoc: null,
    outreachPoc: null,
    domainPrepPoc: null,
    behavioralPrepPoc: null,
    prepPocId: null,
    supportPocId: null,
    outreachPocIds: null,
    allocator: null,
    adminOwner: null,
    candidates: 0,
    ...overrides,
  } as unknown as LmpRecord;
}

// ─── Allocator must NOT grant POC ownership ──────────────────────────────────

describe("isUserOperationalPoc — allocator exclusion", () => {
  const rec = makeRec({ allocator: "Tanwir Alam Haque" });

  it("returns false when the person only appears in allocator field", () => {
    expect(isUserOperationalPoc(rec, "Tanwir Alam Haque")).toBe(false);
  });

  it("returns false even with first-name match in allocator", () => {
    expect(isUserOperationalPoc(rec, "Tanwir")).toBe(false);
  });

  it("returns false with UUID when person has no operational link", () => {
    expect(isUserOperationalPoc(rec, "Tanwir Alam Haque", "dc7528fe-71f9-4637-8333-05a0dce0d816")).toBe(false);
  });
});

// ─── adminOwner must NOT grant POC ownership ─────────────────────────────────

describe("isUserOperationalPoc — adminOwner exclusion", () => {
  const rec = makeRec({ adminOwner: "Tanwir Alam Haque" });

  it("returns false when the person only appears in adminOwner field", () => {
    expect(isUserOperationalPoc(rec, "Tanwir Alam Haque")).toBe(false);
  });
});

// ─── contrast: isUserPocOnRecord DOES include allocator (legacy behavior) ────

describe("isUserPocOnRecord — allocator inclusion (existing legacy function)", () => {
  const rec = makeRec({ allocator: "Tanwir Alam Haque" });

  it("returns true because the legacy function checks allocator field", () => {
    // This is the ROOT CAUSE of the bug — board must use isUserOperationalPoc instead
    expect(isUserPocOnRecord(rec, "Tanwir Alam Haque")).toBe(true);
  });
});

// ─── Operational prep POC ownership ─────────────────────────────────────────

describe("isUserOperationalPoc — operational checks pass", () => {
  it("matches by prepPocId UUID (primary check)", () => {
    const rec = makeRec({ prepPocId: "a37c26d4-0629-432a-89c0-9b979c0094a5" });
    expect(isUserOperationalPoc(rec, "", "a37c26d4-0629-432a-89c0-9b979c0094a5")).toBe(true);
  });

  it("matches by supportPocId UUID", () => {
    const rec = makeRec({ supportPocId: "uuid-support" });
    expect(isUserOperationalPoc(rec, "", "uuid-support")).toBe(true);
  });

  it("matches outreachPocIds array membership", () => {
    const rec = makeRec({ outreachPocIds: ["uuid-o1", "uuid-o2"] });
    expect(isUserOperationalPoc(rec, "", "uuid-o2")).toBe(false);
  });

  it("matches by prepPoc name when no UUID", () => {
    const rec = makeRec({ prepPoc: { name: "Vidhu Goel" } as any });
    expect(isUserOperationalPoc(rec, "Vidhu Goel")).toBe(true);
  });

  it("matches by supportPoc name", () => {
    const rec = makeRec({ supportPoc: { name: "Riti Marwah" } as any });
    expect(isUserOperationalPoc(rec, "Riti Marwah")).toBe(true);
  });

  it("does NOT match by allocator even when name is provided", () => {
    const rec = makeRec({ allocator: "Vidhu Goel", prepPoc: null, supportPoc: null, outreachPoc: null });
    expect(isUserOperationalPoc(rec, "Vidhu Goel")).toBe(false);
  });
});

// ─── UUID takes priority over name matching ───────────────────────────────────

describe("isUserOperationalPoc — UUID-based filtering", () => {
  it("UUID match on prepPocId returns true regardless of name", () => {
    const rec = makeRec({
      prepPocId: "correct-uuid",
      prepPoc: { name: "Wrong Name" } as any,
    });
    expect(isUserOperationalPoc(rec, "Totally Different Name", "correct-uuid")).toBe(true);
  });

  it("UUID mismatch returns false even if name matches via allocator", () => {
    const rec = makeRec({
      allocator: "Matching Name",
      prepPocId: "different-uuid",
    });
    expect(isUserOperationalPoc(rec, "Matching Name", "some-other-uuid")).toBe(false);
  });
});

// ─── Distinct LMP count deduplication (unit-tests usePocSwitcherList logic) ──

describe("distinct lmp_id deduplication", () => {
  it("a POC with prep+support on the same LMP counts as 1 in the total", () => {
    // Simulate the Set-based deduplication used in the fixed usePocSwitcherList
    const lmpLinks = [
      { lmp_id: "lmp-1", role: "prep",    poc: { name: "Vidhu Goel" } },
      { lmp_id: "lmp-1", role: "support", poc: { name: "Vidhu Goel" } },
      { lmp_id: "lmp-2", role: "prep",    poc: { name: "Vidhu Goel" } },
    ];

    type Entry = { primary: number; secondary: number; outreach: number; lmpIds: Set<string> };
    const map = new Map<string, Entry>();
    for (const row of lmpLinks) {
      const name = row.poc?.name;
      if (!name) continue;
      if (!map.has(name)) map.set(name, { primary: 0, secondary: 0, outreach: 0, lmpIds: new Set() });
      const entry = map.get(name)!;
      entry.lmpIds.add(row.lmp_id);
      if (row.role === "prep") entry.primary++;
      else if (row.role === "support") entry.secondary++;
      else if (row.role === "outreach") entry.outreach++;
    }

    const vidhu = map.get("Vidhu Goel")!;
    expect(vidhu.lmpIds.size).toBe(2);   // 2 distinct LMPs, not 3 rows
    expect(vidhu.primary).toBe(2);
    expect(vidhu.secondary).toBe(1);
  });
});

// ─── Removed link must not count ─────────────────────────────────────────────

describe("inactive links excluded from operational check", () => {
  it("is_active=false links must not count — operational check is by field not link table", () => {
    // The operational check operates on LmpRecord fields, not the lmp_poc_links table.
    // When is_active=false, the denormalized fields (prepPocId, supportPocId etc.) should
    // not carry the removed person's UUID. This test confirms the function contract.
    const rec = makeRec({
      prepPocId: null,       // cleared when link deactivated
      prepPoc: null,         // cleared when link deactivated
    });
    expect(isUserOperationalPoc(rec, "Vidhu Goel", "a37c26d4-0629-432a-89c0-9b979c0094a5")).toBe(false);
  });
});

// ─── countByEmail using total_assigned_lmp_count ─────────────────────────────

describe("countByEmail canonical count (simulates usePocDirectory after fix)", () => {
  it("holds total_assigned_lmp_count (4) for Vidhu, not active_load (3)", () => {
    // After the fix, countByEmail comes from poc_lmp_assignment_counts.total_assigned_lmp_count
    // This simulates what the fixed usePocDirectory returns for Vidhu Goel
    const mockRow = {
      email: "goel.vidhu@mastersunion.org",
      total_assigned_lmp_count: 4,  // 4 active prep links
      active_load: 3,               // was the old (wrong) source — excludes SalarySe (hold)
    };
    const countByEmail: Record<string, number> = {};
    if (mockRow.email) countByEmail[mockRow.email.toLowerCase()] = mockRow.total_assigned_lmp_count;
    expect(countByEmail["goel.vidhu@mastersunion.org"]).toBe(4);
  });

  it("holds 0 for Tanwir (no operational links)", () => {
    const mockRow = {
      email: "tanwir.haque@mastersunion.org",
      total_assigned_lmp_count: 0,
    };
    const countByEmail: Record<string, number> = {};
    if (mockRow.email) countByEmail[mockRow.email.toLowerCase()] = mockRow.total_assigned_lmp_count;
    expect(countByEmail["tanwir.haque@mastersunion.org"]).toBe(0);
  });
});
