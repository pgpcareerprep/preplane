import { describe, expect, it } from "vitest";
import {
  isEligiblePrepPocProfile,
  isOutreachOnlyPoc,
  pocHasAssignedDomains,
} from "@/lib/prepPocEligibility";

describe("prepPocEligibility", () => {
  const prepSupportLinks = new Set(["prep-id", "support-id"]);

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
});
