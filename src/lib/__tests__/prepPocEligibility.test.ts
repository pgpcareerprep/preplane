import { describe, expect, it } from "vitest";
import {
  isEligiblePrepPocProfile,
  isOutreachOnlyPoc,
  isOperationalPocRole,
  pocHasAssignedDomains,
  pocRoleTypeLabel,
} from "@/lib/prepPocEligibility";

describe("prepPocEligibility", () => {
  const prepSupportLinks = new Set(["prep-id", "support-id"]);

  it("classifies outreach vs operational roles", () => {
    expect(isOutreachOnlyPoc("outreach_poc")).toBe(true);
    expect(isOperationalPocRole("outreach_poc")).toBe(false);
    expect(isOperationalPocRole("prep_poc")).toBe(true);
    expect(isOperationalPocRole("admin")).toBe(true);
    expect(pocRoleTypeLabel("outreach_poc")).toBe("Outreach POC");
    expect(pocRoleTypeLabel("admin")).toBe("Admin");
    expect(pocRoleTypeLabel("prep_poc")).toBe("Prep POC");
  });

  it("excludes outreach-only profiles", () => {
    expect(isOutreachOnlyPoc("outreach_poc")).toBe(true);
    expect(
      isEligiblePrepPocProfile(
        { id: "o1", status: "active", role_type: "outreach_poc", primary_domain: "Sales" },
        prepSupportLinks,
      ),
    ).toBe(false);
  });

  it("excludes users with no domain and no prep/support history", () => {
    expect(
      isEligiblePrepPocProfile(
        { id: "u1", status: "active", role_type: "prep_poc" },
        new Set(),
      ),
    ).toBe(false);
    expect(pocHasAssignedDomains({ primary_domain: null, domain_tags: [] })).toBe(false);
  });

  it("includes active prep POC with assigned domain even with zero LMPs", () => {
    expect(
      isEligiblePrepPocProfile(
        {
          id: "p1",
          status: "active",
          role_type: "prep_poc",
          primary_domain: "Product",
          domain_tags: [],
        },
        new Set(),
      ),
    ).toBe(true);
  });

  it("includes prep POC linked to prep/support LMP without domain", () => {
    expect(
      isEligiblePrepPocProfile(
        { id: "prep-id", status: "active", role_type: "prep_poc" },
        prepSupportLinks,
      ),
    ).toBe(true);
  });

  it("includes admin role_type with assigned domain", () => {
    expect(
      isEligiblePrepPocProfile(
        {
          id: "admin-id",
          status: "active",
          role_type: "admin",
          primary_domain: "Finance",
          domain_tags: [],
        },
        new Set(),
      ),
    ).toBe(true);
  });
});
