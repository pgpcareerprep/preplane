import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isEligiblePoc, mapPocProfile } from "@/lib/hooks/usePocRegistry";
import { allocatePoc } from "@/lib/pocAllocation";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("allocator create-process access", () => {
  it("requires an authenticated owner and never inserts created_by undefined", () => {
    const source = read("src/lib/lmpDrafts.ts");
    expect(source).toContain("AUTH_REQUIRED: Sign in again before saving a draft.");
    expect(source).toContain("created_by: userId");
    expect(source).not.toContain("created_by: uid");
  });

  it("grants allocator role-scoped reads and owned draft mutations without disabling RLS", () => {
    const migration = read("supabase/migrations/20260611190000_fix_allocator_create_process_access.sql");
    expect(migration).toContain("Admins and allocators insert drafts");
    expect(migration).toContain("created_by = auth.uid()");
    expect(migration).toContain("Create-process roles can view students");
    expect(migration).toContain("Create-process roles can view poc_profiles");
    expect(migration).toContain("'allocator'::public.app_role");
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
  });

  it("keeps an active prep POC eligible and allocatable", () => {
    const entry = mapPocProfile({
      id: "finance-poc",
      name: "Finance POC",
      role_type: "prep_poc",
      status: "active",
      primary_domain: "Finance",
      domain_tags: ["Finance"],
      max_threshold: 8,
    });

    expect(isEligiblePoc(entry)).toBe(true);
    const result = allocatePoc({
      companyName: "Acme",
      roleTitle: "Analyst",
      processDomain: "Finance",
    }, [{
      id: entry.id,
      name: entry.name,
      initials: entry.initials,
      domains: entry.domains,
      primaryDomains: [entry.primary_domain!],
      secondaryDomains: [],
      label: entry.label,
      color: entry.color,
      pocType: entry.poc_type,
      currentLoad: 0,
      maxThreshold: entry.max_threshold,
      skillTags: entry.skill_tags,
      lastAssignedAt: entry.last_assigned_at,
      availability: entry.availability,
      behavioralPoolMember: entry.behavioral_pool_member,
    }]);
    expect(result.prep.name).toBe("Finance POC");
  });

  it("rejects inactive or zero-threshold POCs from allocation eligibility", () => {
    expect(isEligiblePoc(mapPocProfile({
      id: "inactive",
      name: "Inactive",
      role_type: "prep_poc",
      status: "inactive",
      max_threshold: 8,
    }))).toBe(false);
    expect(isEligiblePoc(mapPocProfile({
      id: "zero-threshold",
      name: "Zero Threshold",
      role_type: "prep_poc",
      status: "active",
      max_threshold: 0,
    }))).toBe(false);
  });
});
