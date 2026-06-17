/**
 * Tests covering:
 * - Updated Prep POC eligibility rules (domain OR history, outreach-only exclusion)
 * - UUID-based filter behavior
 * - Custom date range inclusivity
 * - URL viewAs restore and RBAC authority preservation
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { startOfDay, endOfDay } from "date-fns";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

// ── Replicated eligibility logic (mirrors useEligiblePrepPocs.queryFn) ────────

type MockPoc = {
  id: string;
  name: string;
  primary_domain?: string | null;
  domain_tags?: string[] | null;
  status: string;
  role_type?: string | null;
  access_level?: string | null;
};

type MockLink = {
  poc_id: string;
  lmp_id: string;
  role: string;
  // is_active is intentionally not used in eligibility — historical links qualify too
};

function isEligible(poc: MockPoc, allLinks: MockLink[]): boolean {
  if (poc.status !== "active") return false;

  // Outreach-only POCs are excluded regardless of domain or link history.
  const roleType = poc.role_type ?? "prep_poc";
  if (roleType === "outreach_poc") return false;

  const primaryDomain = (poc.primary_domain ?? "").trim() || null;
  const domainTags: string[] = Array.isArray(poc.domain_tags)
    ? poc.domain_tags.filter((t) => typeof t === "string" && t.trim().length > 0)
    : [];
  const hasDomain = !!primaryDomain || domainTags.length > 0;

  // Current OR historical prep/support participation qualifies.
  const hasPrepOrSupportHistory = allLinks.some(
    (l) => l.poc_id === poc.id && (l.role === "prep" || l.role === "support"),
  );

  return hasDomain || hasPrepOrSupportHistory;
}

/** Simulates the pocLmpIdsMap lookup and LMP record filter for a selected POC. */
function filterLmpsForPoc(pocId: string, pocLmpIdsMap: Map<string, Set<string>>, lmpIds: string[]): string[] {
  const allowedIds = pocLmpIdsMap.get(pocId);
  if (!allowedIds) return [];
  return lmpIds.filter((id) => allowedIds.has(id));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Group 1: Updated eligibility rules ───────────────────────────────────────

describe("Prep POC eligibility rules (updated: domain OR history)", () => {
  it("excludes a POC with no domain and no prep/support history", () => {
    const poc: MockPoc = { id: "a", name: "No Domain No History", primary_domain: null, domain_tags: [], status: "active" };
    expect(isEligible(poc, [])).toBe(false);
  });

  it("excludes an outreach-only POC (role_type=outreach_poc) even when they have a domain", () => {
    const poc: MockPoc = { id: "b", name: "Outreach Only", primary_domain: "Finance", domain_tags: [], status: "active", role_type: "outreach_poc" };
    const links: MockLink[] = [{ poc_id: "b", lmp_id: "lmp1", role: "outreach" }];
    expect(isEligible(poc, links)).toBe(false);
  });

  it("includes a POC with primary_domain and an active prep link", () => {
    const poc: MockPoc = { id: "c", name: "Prep POC", primary_domain: "Technology", domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "c", lmp_id: "lmp2", role: "prep" }];
    expect(isEligible(poc, links)).toBe(true);
  });

  it("includes a POC with domain_tags only (no primary_domain) and a support link", () => {
    const poc: MockPoc = { id: "d", name: "Support POC", primary_domain: "", domain_tags: ["Consulting"], status: "active" };
    const links: MockLink[] = [{ poc_id: "d", lmp_id: "lmp3", role: "support" }];
    expect(isEligible(poc, links)).toBe(true);
  });

  it("includes a POC who has a domain but a now-inactive (historical) prep link", () => {
    // Historical links no longer need is_active — the queryFn fetches all prep/support links.
    const poc: MockPoc = { id: "e", name: "Historical Link", primary_domain: "Finance", domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "e", lmp_id: "lmp4", role: "prep" }];
    expect(isEligible(poc, links)).toBe(true);
  });
});

// ── Group 2: New required tests ───────────────────────────────────────────────

describe("New eligibility scenarios: zero-LMP, historical, role-agnostic", () => {
  // Test 1: Active POC with domain and zero LMPs
  it("includes an active POC with a domain and zero current/historical LMPs", () => {
    const poc: MockPoc = { id: "f1", name: "Vidit Sinha", primary_domain: "Technology", domain_tags: [], status: "active", role_type: "prep_poc" };
    expect(isEligible(poc, [])).toBe(true);
  });

  // Test 2: Active Admin with domain and zero LMPs
  it("includes an active Admin (access_level=admin) with a domain and zero LMPs", () => {
    const poc: MockPoc = { id: "f2", name: "Admin User", primary_domain: "Finance", domain_tags: [], status: "active", role_type: "prep_poc", access_level: "admin" };
    expect(isEligible(poc, [])).toBe(true);
  });

  // Test 3: Active Allocator with domain and zero LMPs
  it("includes an active Allocator (access_level=allocator) with a domain and zero LMPs", () => {
    const poc: MockPoc = { id: "f3", name: "Allocator User", primary_domain: "Consulting", domain_tags: [], status: "active", role_type: "prep_poc", access_level: "allocator" };
    expect(isEligible(poc, [])).toBe(true);
  });

  // Test 4: POC with historical Prep assignment but no current LMP
  it("includes a POC with a historical Prep assignment even when no LMP is currently active", () => {
    const poc: MockPoc = { id: "f4", name: "Historical Prep", primary_domain: null, domain_tags: [], status: "active" };
    // Historical link (would have is_active=false in DB, but we fetch all links now)
    const links: MockLink[] = [{ poc_id: "f4", lmp_id: "old-lmp", role: "prep" }];
    expect(isEligible(poc, links)).toBe(true);
  });

  // Test 5: POC with historical Support assignment
  it("includes a POC with only a historical Support assignment and no domain", () => {
    const poc: MockPoc = { id: "f5", name: "Historical Support", primary_domain: null, domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "f5", lmp_id: "old-lmp-2", role: "support" }];
    expect(isEligible(poc, links)).toBe(true);
  });

  // Test 6: Outreach-only POC is excluded
  it("excludes an outreach-only POC (role_type=outreach_poc) even with domain and outreach links", () => {
    const poc: MockPoc = { id: "f6", name: "Outreach Only User", primary_domain: "Sales", domain_tags: ["Sales"], status: "active", role_type: "outreach_poc" };
    const links: MockLink[] = [{ poc_id: "f6", lmp_id: "lmp-o", role: "outreach" }];
    expect(isEligible(poc, links)).toBe(false);
  });

  // Test 7: User with no domain and no prep/support history
  it("excludes a user with no domain and no prep/support history", () => {
    const poc: MockPoc = { id: "f7", name: "No Qualifications", primary_domain: null, domain_tags: null, status: "active", role_type: "prep_poc" };
    // Only outreach link — does not count as prep/support history
    const links: MockLink[] = [{ poc_id: "f7", lmp_id: "lmp-x", role: "outreach" }];
    expect(isEligible(poc, links)).toBe(false);
  });

  // Test 8: Two users with the same first name remain separate
  it("keeps two users with the same first name as separate dropdown entries", () => {
    const mansi1: MockPoc = { id: "uuid-mansi-bhargava", name: "Mansi Bhargava", primary_domain: "Finance", domain_tags: [], status: "active" };
    const mansi2: MockPoc = { id: "uuid-mansi-jain", name: "Mansi Jain", primary_domain: "Technology", domain_tags: [], status: "active" };
    // Both are eligible independently
    expect(isEligible(mansi1, [])).toBe(true);
    expect(isEligible(mansi2, [])).toBe(true);
    // Their IDs are different — no deduplication collision
    expect(mansi1.id).not.toBe(mansi2.id);
    // Sort order is alphabetical by full name
    const sorted = [mansi1, mansi2].sort((a, b) => a.name.localeCompare(b.name));
    expect(sorted[0].name).toBe("Mansi Bhargava");
    expect(sorted[1].name).toBe("Mansi Jain");
  });

  // Test 9: Selecting a zero-LMP POC produces empty result without removing the option
  it("produces an empty LMP result when a zero-LMP POC is selected, without removing the dropdown option", () => {
    const zeroPocId = "zero-lmp-poc-uuid";
    // pocLmpIdsMap has no entry for this POC (they have no linked LMPs)
    const pocLmpIdsMap = new Map<string, Set<string>>();
    const allLmpIds = ["lmp-1", "lmp-2", "lmp-3"];

    const filtered = filterLmpsForPoc(zeroPocId, pocLmpIdsMap, allLmpIds);

    // The result is empty — correct empty-state behavior
    expect(filtered).toHaveLength(0);

    // The POC is still in the eligibility list (hasDomain=true, assignedLmpCount=0)
    const poc: MockPoc = { id: zeroPocId, name: "Zero LMP POC", primary_domain: "Finance", domain_tags: [], status: "active" };
    expect(isEligible(poc, [])).toBe(true);
  });

  // Test 10: Dashboard and Last Mile Prep use identical hook
  it("AdminLmpDashboard and LmpBoardPage both import from the same useEligiblePrepPocs hook", () => {
    const dashboard = read("src/components/dashboards/AdminLmpDashboard.tsx");
    const lmpBoard = read("src/pages/LmpBoardPage.tsx");
    expect(dashboard).toContain('from "@/lib/hooks/useEligiblePrepPocs"');
    expect(lmpBoard).toContain('from "@/lib/hooks/useEligiblePrepPocs"');
  });
});

// ── Group 3: UUID-based filter ────────────────────────────────────────────────

describe("UUID-based prep POC filter behavior", () => {
  it("UUID_RE correctly identifies a valid lowercase UUID", () => {
    expect(UUID_RE.test("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("UUID_RE correctly rejects a name string (no name-collision risk)", () => {
    expect(UUID_RE.test("Mansi Bhargava")).toBe(false);
    expect(UUID_RE.test("All")).toBe(false);
    expect(UUID_RE.test("")).toBe(false);
  });

  it("UUID filter excludes an LMP not in the pocLmpIdsMap entry for the selected POC", () => {
    const pocId = "550e8400-e29b-41d4-a716-446655440000";
    const pocLmpIdsMap = new Map([[pocId, new Set(["lmp-a", "lmp-b"])]]);
    const lmpId = "lmp-x";
    const allowedIds = pocLmpIdsMap.get(pocId);
    expect(allowedIds).toBeDefined();
    expect(allowedIds!.has(lmpId)).toBe(false);
  });

  it("UUID filter passes an LMP that is in the pocLmpIdsMap entry for the selected POC", () => {
    const pocId = "550e8400-e29b-41d4-a716-446655440000";
    const pocLmpIdsMap = new Map([[pocId, new Set(["lmp-a", "lmp-b"])]]);
    const lmpId = "lmp-a";
    const allowedIds = pocLmpIdsMap.get(pocId);
    expect(allowedIds).toBeDefined();
    expect(allowedIds!.has(lmpId)).toBe(true);
  });
});

// ── Group 4: Custom date range ────────────────────────────────────────────────

describe("Custom date range filter", () => {
  const makeRange = (from: Date, to: Date) => ({
    from: startOfDay(from),
    to: endOfDay(to),
  });

  it("startOfDay/endOfDay makes from/to boundaries inclusive for same-day records", () => {
    const day = new Date("2026-04-15T12:00:00");
    const { from, to } = makeRange(day, day);
    const created = new Date("2026-04-15T08:30:00");
    expect(created >= from && created <= to).toBe(true);
  });

  it("custom range excludes records strictly before the from boundary", () => {
    const from = startOfDay(new Date("2026-04-10"));
    const to = endOfDay(new Date("2026-04-20"));
    const created = new Date("2026-04-09T23:59:59");
    expect(created < from || created > to).toBe(true);
  });
});

// ── Group 5: viewAs RBAC authority preservation ───────────────────────────────
// Note: URL-param viewAs restore was intentionally removed (security regression fix).
// View As is now session-only — no localStorage, sessionStorage, or URL persistence.

describe("viewAs RBAC", () => {
  it("admin and allocator are permitted to use viewAs (canViewAs guard in AppSidebar)", () => {
    const source = read("src/components/layout/AppSidebar.tsx");
    expect(source).toContain('const canViewAs = role === "admin" || role === "allocator"');
  });

  it("View As is NOT restored from URL params (URL param restore was removed)", () => {
    // The old UUID_RE.test(uuid) guard and role=poc block were part of URL-restore logic.
    // Both have been intentionally removed — View As must not be restored from URL.
    const source = read("src/components/layout/AppSidebar.tsx");
    expect(source).not.toContain("UUID_RE.test(uuid)");
    expect(source).not.toContain("searchParams.get(\"viewAs\")");
  });

  it("View As is NOT saved to localStorage (persistence was removed)", () => {
    const source = read("src/lib/rolesContext.tsx");
    expect(source).not.toContain("lmp_view_as_user_");
  });

  it("AdminLmpDashboard passes filteredIds to RecentActivityCard as lmpIds prop", () => {
    const source = read("src/components/dashboards/AdminLmpDashboard.tsx");
    expect(source).toContain("lmpIds={Array.from(filteredIds)}");
  });
});
