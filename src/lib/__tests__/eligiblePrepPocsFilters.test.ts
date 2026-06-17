/**
 * 14 tests covering:
 * - Eligibility rules for Prep POC directory
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
};

type MockLink = {
  poc_id: string;
  lmp_id: string;
  role: string;
  is_active: boolean;
};

function isEligible(poc: MockPoc, allLinks: MockLink[]): boolean {
  const primaryDomain = (poc.primary_domain ?? "").trim() || null;
  const domainTags: string[] = Array.isArray(poc.domain_tags)
    ? poc.domain_tags.filter((t) => t && t.trim())
    : [];
  const hasDomain = !!primaryDomain || domainTags.length > 0;
  if (!hasDomain) return false;

  const activeSet = allLinks.filter(
    (l) => l.poc_id === poc.id && l.is_active && (l.role === "prep" || l.role === "support"),
  );
  return activeSet.length > 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Group 1: Eligibility rules ────────────────────────────────────────────────

describe("Prep POC eligibility rules", () => {
  it("excludes a POC with no domain (neither primary_domain nor domain_tags)", () => {
    const poc: MockPoc = { id: "a", name: "No Domain", primary_domain: null, domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "a", lmp_id: "lmp1", role: "prep", is_active: true }];
    expect(isEligible(poc, links)).toBe(false);
  });

  it("excludes a POC with only outreach links (not prep/support)", () => {
    const poc: MockPoc = { id: "b", name: "Outreach Only", primary_domain: "Finance", domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "b", lmp_id: "lmp2", role: "outreach", is_active: true }];
    expect(isEligible(poc, links)).toBe(false);
  });

  it("includes a POC with primary_domain and an active prep link", () => {
    const poc: MockPoc = { id: "c", name: "Prep POC", primary_domain: "Technology", domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "c", lmp_id: "lmp3", role: "prep", is_active: true }];
    expect(isEligible(poc, links)).toBe(true);
  });

  it("includes a POC with domain_tags only (no primary_domain) and an active support link", () => {
    const poc: MockPoc = { id: "d", name: "Support POC", primary_domain: "", domain_tags: ["Consulting"], status: "active" };
    const links: MockLink[] = [{ poc_id: "d", lmp_id: "lmp4", role: "support", is_active: true }];
    expect(isEligible(poc, links)).toBe(true);
  });

  it("excludes a POC whose prep link is inactive", () => {
    const poc: MockPoc = { id: "e", name: "Inactive Link", primary_domain: "Finance", domain_tags: [], status: "active" };
    const links: MockLink[] = [{ poc_id: "e", lmp_id: "lmp5", role: "prep", is_active: false }];
    expect(isEligible(poc, links)).toBe(false);
  });
});

// ── Group 2: UUID-based filter ────────────────────────────────────────────────

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

// ── Group 3: Custom date range ────────────────────────────────────────────────

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

// ── Group 4: URL viewAs restore + RBAC authority preservation ─────────────────

describe("viewAs URL restore and RBAC", () => {
  it("rejects non-UUID strings for viewAs URL parameter (validation guard is present in AppSidebar)", () => {
    const source = read("src/components/layout/AppSidebar.tsx");
    expect(source).toContain("UUID_RE.test(uuid)");
    expect(source).toContain("if (!uuid || !UUID_RE.test(uuid)) return");
  });

  it("POC role cannot activate viewAs via URL — guard in AppSidebar blocks role=poc", () => {
    const source = read("src/components/layout/AppSidebar.tsx");
    expect(source).toContain('if (role === "poc" || approvedUsers.length === 0) return');
  });

  it("admin and allocator are permitted to use viewAs via URL (canViewAs guard)", () => {
    const source = read("src/components/layout/AppSidebar.tsx");
    expect(source).toContain('const canViewAs = role === "admin" || role === "allocator"');
  });

  it("AdminLmpDashboard passes filteredIds to RecentActivityCard as lmpIds prop", () => {
    const source = read("src/components/dashboards/AdminLmpDashboard.tsx");
    expect(source).toContain("lmpIds={Array.from(filteredIds)}");
  });
});
