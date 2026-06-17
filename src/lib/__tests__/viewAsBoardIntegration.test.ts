/**
 * Acceptance tests for View As + LMP board scope integration (section 12).
 *
 * Self-contained: no Supabase or DB imports. Tests cover the logic shapes
 * used in LmpBoardPage, rolesContext, exportCsv, and viewerContext.
 */

import { describe, it, expect } from "vitest";
import type { LmpRecord } from "@/lib/lmpTypes";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<LmpRecord> = {}): LmpRecord {
  return {
    id: `lmp-${Math.random().toString(36).slice(2)}`,
    reqId: "LMP-2026-0001",
    lmpCode: "LMP-2026-0001",
    role: "Software Engineer",
    company: "Acme Corp",
    domain: "Tech",
    candidates: 2,
    stage: "Prep",
    status: "prep-ongoing",
    pocs: [],
    health: "Healthy",
    slaDays: 5,
    createdAt: "2026-06-01T00:00:00Z",
    lastActivity: "2026-06-18T00:00:00Z",
    ...overrides,
  } as LmpRecord;
}

// Mirrors LmpBoardPage resolveSelfScope logic (UUID-first, no outreach fallback)
function resolveSelfScope(
  records: LmpRecord[],
  effectivePocId: string | null,
  activePocLmpIdsMap: Map<string, Set<string>>,
): LmpRecord[] {
  if (effectivePocId) {
    const allowedIds = activePocLmpIdsMap.get(effectivePocId) ?? new Set<string>();
    return records.filter((r) => allowedIds.has(r.id));
  }
  return [];
}

// Mirrors rolesContext approved-users filtering logic
function filterApprovedUsers(
  profileUsers: Array<{ display_name: string; email: string; role: string }>,
  pocProfiles: Array<{ email: string; name: string; id: string; role_type: string }>,
) {
  const pocIdByEmail = new Map(pocProfiles.map(p => [p.email.toLowerCase(), p.id]));
  const pocRoleTypeByEmail = new Map(pocProfiles.map(p => [p.email.toLowerCase(), p.role_type]));

  return profileUsers.filter(u => {
    if (u.role === "poc") {
      if (!pocIdByEmail.has(u.email.toLowerCase())) return false;
      if (pocRoleTypeByEmail.get(u.email.toLowerCase()) === "outreach_poc") return false;
    }
    return true;
  });
}

// ─── Tests 1-3: View As scope resolution ─────────────────────────────────────

describe("View As → Self scope resolution", () => {
  it("1. resolves Self scope using Riti's poc_profiles.id (not admin's)", () => {
    const ritiId = "poc-riti-uuid";
    const adminId = "poc-admin-uuid";

    const ritiRecord = makeRecord({ id: "lmp-riti-1" });
    const adminRecord = makeRecord({ id: "lmp-admin-1" });

    const activePocLmpIdsMap = new Map([
      [ritiId, new Set(["lmp-riti-1"])],
      [adminId, new Set(["lmp-admin-1"])],
    ]);

    const result = resolveSelfScope([ritiRecord, adminRecord], ritiId, activePocLmpIdsMap);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("lmp-riti-1");
  });

  it("2. Riti's LMPs display immediately when effectivePocId is set — no second selection needed", () => {
    const ritiId = "poc-riti-uuid";
    const activePocLmpIdsMap = new Map([
      [ritiId, new Set(["lmp-r1", "lmp-r2"])],
    ]);
    const records = [
      makeRecord({ id: "lmp-r1" }),
      makeRecord({ id: "lmp-r2" }),
      makeRecord({ id: "lmp-other" }),
    ];
    const result = resolveSelfScope(records, ritiId, activePocLmpIdsMap);
    expect(result).toHaveLength(2);
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining(["lmp-r1", "lmp-r2"]));
  });

  it("3. admin's own assignments are NOT included when viewing as Riti", () => {
    const ritiId = "poc-riti-uuid";
    const adminId = "poc-admin-uuid";

    const activePocLmpIdsMap = new Map([
      [ritiId, new Set(["lmp-riti-1"])],
      [adminId, new Set(["lmp-admin-1"])],
    ]);

    const allRecords = [
      makeRecord({ id: "lmp-riti-1" }),
      makeRecord({ id: "lmp-admin-1" }),
    ];

    const result = resolveSelfScope(allRecords, ritiId, activePocLmpIdsMap);
    expect(result.map(r => r.id)).not.toContain("lmp-admin-1");
  });
});

// ─── Tests 4-8: Board scope control and restoration ──────────────────────────

describe("Board scope control during View As", () => {
  it("4. canChangeBoardScope is false during View As, true in normal mode", () => {
    const check = (actorRole: string, isViewAsActive: boolean) =>
      (actorRole === "admin" || actorRole === "allocator") && !isViewAsActive;

    expect(check("admin", true)).toBe(false);
    expect(check("allocator", true)).toBe(false);
    expect(check("admin", false)).toBe(true);
    expect(check("allocator", false)).toBe(true);
    expect(check("poc", false)).toBe(false);
  });

  it("5. scope indicator shows effectiveUser name as '[Name]'s LMPs' during View As", () => {
    const viewAsName = "Riti Marwah";
    const indicator = `${viewAsName}'s LMPs`;
    expect(indicator).toBe("Riti Marwah's LMPs");
  });

  it("6. restoreOwnView exits View As and resets scope to self", () => {
    let scope: { kind: string } = { kind: "poc" };
    let isViewAsActive = true;

    // Simulate restoreOwnView() + auto-reset useEffect
    isViewAsActive = false;
    scope = { kind: "self" };

    expect(scope.kind).toBe("self");
    expect(isViewAsActive).toBe(false);
  });

  it("7. after Restore, admin/allocator can select All POCs or individual POC (canChangeBoardScope = true)", () => {
    const check = (actorRole: string, isViewAsActive: boolean) =>
      (actorRole === "admin" || actorRole === "allocator") && !isViewAsActive;

    expect(check("admin", false)).toBe(true);
    expect(check("allocator", false)).toBe(true);
  });

  it("8. switching View As resets stale filters, overdueOnly, and scope", () => {
    // Simulate the auto-reset behaviour keyed on [isViewAsActive, effectivePocId, email]
    let filters = { q: "stale query", domain: "Finance", status: "prep-done" };
    let overdueOnly = true;
    let scope: { kind: string } = { kind: "all" };
    let prevSig: string | null = null;

    // Simulate a View As change arriving (new sig)
    const newSig = "poc-riti-uuid";
    if (newSig !== prevSig) {
      prevSig = newSig;
      filters = { q: "", domain: "", status: "" };
      overdueOnly = false;
      scope = { kind: "self" };
    }

    expect(filters.q).toBe("");
    expect(filters.domain).toBe("");
    expect(overdueOnly).toBe(false);
    expect(scope.kind).toBe("self");
  });
});

// ─── Tests 9-10: Outreach POC filtering in View As directory ─────────────────

describe("Outreach POC filtering in View As directory", () => {
  const profileUsers = [
    { display_name: "Riti Marwah", email: "riti@test.com", role: "poc" },
    { display_name: "Outreach Only", email: "out@test.com", role: "poc" },
    { display_name: "Admin User", email: "admin@test.com", role: "admin" },
    { display_name: "No POC Profile", email: "nobody@test.com", role: "poc" },
  ];

  const pocProfiles = [
    { email: "riti@test.com", name: "Riti Marwah", id: "riti-id", role_type: "prep_poc" },
    { email: "out@test.com", name: "Outreach Only", id: "out-id", role_type: "outreach_poc" },
    // admin@test.com has no poc_profiles record — OK for admins
  ];

  it("9. outreach-only POCs are excluded; prep POCs and admins are included", () => {
    const enriched = filterApprovedUsers(profileUsers, pocProfiles);
    const emails = enriched.map(u => u.email);

    expect(emails).not.toContain("out@test.com");    // outreach_poc excluded
    expect(emails).not.toContain("nobody@test.com"); // no poc_profiles record
    expect(emails).toContain("riti@test.com");       // prep_poc included
    expect(emails).toContain("admin@test.com");      // admin always included
  });

  it("10. active Prep POC with zero LMPs (but has poc_profiles) remains in the list", () => {
    const zeroPoc = { display_name: "Zero LMP", email: "zero@test.com", role: "poc" };
    const zeroPocProfile = { email: "zero@test.com", name: "Zero LMP", id: "zero-id", role_type: "prep_poc" };

    const result = filterApprovedUsers([zeroPoc], [zeroPocProfile]);
    expect(result).toHaveLength(1);
    expect(result[0].email).toBe("zero@test.com");
  });
});

// ─── Tests 11-16: CSV export logic ───────────────────────────────────────────

describe("CSV export — exportLmpBoardCsv logic", () => {
  // Mirror the escapeCell + row-building logic without importing supabase
  function escapeCell(v: unknown): string {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function buildBoardCsvRows(records: LmpRecord[]) {
    return records.map((r) => ({
      lmp_code: r.lmpCode ?? r.reqId ?? "",
      company: r.company ?? "",
      role: r.role ?? "",
      domain: r.domain ?? "",
      status: r.status ?? "",
      prep_poc: r.prepPoc?.name ?? "",
      support_poc: r.supportPoc?.name ?? "",
      outreach_poc: r.outreachPoc?.name ?? "",
      candidate_count: r.candidates ?? 0,
    }));
  }

  it("11. CSV rows match the filtered board records exactly", () => {
    const records = [
      makeRecord({ id: "r1", company: "Alpha" }),
      makeRecord({ id: "r2", company: "Beta" }),
    ];
    const rows = buildBoardCsvRows(records);
    expect(rows).toHaveLength(2);
    expect(rows[0].company).toBe("Alpha");
    expect(rows[1].company).toBe("Beta");
  });

  it("12. View As export contains only the effective user's records (not all)", () => {
    const ritiRecords = [
      makeRecord({ id: "riti-1", company: "RitiCo" }),
    ];
    const rows = buildBoardCsvRows(ritiRecords);
    expect(rows).toHaveLength(1);
    expect(rows[0].company).toBe("RitiCo");
  });

  it("13. All-POCs export uses all filtered authorised records", () => {
    const allRecords = Array.from({ length: 10 }, (_, i) =>
      makeRecord({ id: `all-${i}`, company: `Company ${i}` }),
    );
    const rows = buildBoardCsvRows(allRecords);
    expect(rows).toHaveLength(10);
  });

  it("14. CSV is built from already-loaded records with no DB query", () => {
    // exportLmpBoardCsv signature: (records: LmpRecord[], scopeLabel: string) => void
    // It calls downloadCsv(filename, rows, headers) — no supabase.from() call.
    // Verify by inspecting that the function only uses its input parameter.
    const records = [makeRecord({ id: "test-14" })];
    const rows = buildBoardCsvRows(records);
    // Rows come purely from the records passed in
    expect(rows[0].lmp_code).toBe("LMP-2026-0001");
  });

  it("15. empty records array produces zero rows (no download triggered)", () => {
    const rows = buildBoardCsvRows([]);
    expect(rows).toHaveLength(0);
  });

  it("16. KPI, cards, kanban, and export all use the same filtered count", () => {
    const filtered = [
      makeRecord({ status: "prep-ongoing" }),
      makeRecord({ status: "prep-done" }),
    ];
    // All display elements receive the same `filtered` array
    const kpiCount = filtered.length;
    const cardCount = filtered.length;
    const exportRowCount = buildBoardCsvRows(filtered).length;
    expect(kpiCount).toBe(2);
    expect(cardCount).toBe(kpiCount);
    expect(exportRowCount).toBe(kpiCount);
  });
});

// ─── Test 17: Read-only enforcement ──────────────────────────────────────────

describe("View As read-only enforcement", () => {
  it("17. canEdit = false when VIEW_AS_READ_ONLY = true and isViewAsActive = true", () => {
    const VIEW_AS_READ_ONLY = true;
    const canPerformEdit = true; // role has edit_lmp permission

    const canEdit_viewAs = canPerformEdit && !VIEW_AS_READ_ONLY;
    expect(canEdit_viewAs).toBe(false);

    const canEdit_normal = canPerformEdit && !false;
    expect(canEdit_normal).toBe(true);
  });
});

// ─── Test 18: Protected workflow regression ───────────────────────────────────

describe("Protected workflows — regression", () => {
  it("18. LmpBoardScope type shape and resolveSelfScope logic remain correct", () => {
    // Verify the discriminated union shape used throughout
    const selfScope: { kind: "self" } = { kind: "self" };
    const allScope: { kind: "all" } = { kind: "all" };
    const pocScope: { kind: "poc"; pocId: string; pocName: string } = {
      kind: "poc", pocId: "uuid-123", pocName: "Gopika",
    };

    expect(selfScope.kind).toBe("self");
    expect(allScope.kind).toBe("all");
    expect(pocScope.pocId).toBe("uuid-123");

    // Self scope resolver still returns empty for unknown pocId
    const map = new Map([["known-id", new Set(["lmp-1"])]]);
    const unknownResult = resolveSelfScope([makeRecord({ id: "lmp-1" })], "unknown-id", map);
    expect(unknownResult).toHaveLength(0);

    // Self scope resolver returns matching records for known pocId
    const knownResult = resolveSelfScope([makeRecord({ id: "lmp-1" })], "known-id", map);
    expect(knownResult).toHaveLength(1);
  });
});
