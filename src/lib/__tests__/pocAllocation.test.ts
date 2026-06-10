import { describe, expect, it } from "vitest";
import { allocatePoc } from "@/lib/pocAllocation";
import type { PocCapability } from "@/lib/pocCapability";

function poc(overrides: Partial<PocCapability> & Pick<PocCapability, "name">): PocCapability {
  return {
    id: overrides.name.toLowerCase().replace(/\s+/g, "-"),
    initials: overrides.name.slice(0, 2).toUpperCase(),
    domains: [],
    primaryDomains: [],
    secondaryDomains: [],
    label: overrides.name,
    color: "blue",
    pocType: "prep",
    currentLoad: 0,
    maxThreshold: 5,
    skillTags: [],
    lastAssignedAt: "2026-01-01T00:00:00.000Z",
    availability: "available",
    behavioralPoolMember: false,
    ...overrides,
  };
}

const input = {
  companyName: "Acme",
  roleTitle: "Analyst",
  processDomain: "Finance",
};

describe("allocatePoc safety rules", () => {
  it("prefers an eligible in-domain POC", () => {
    const result = allocatePoc(input, [
      poc({ name: "Finance POC", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 2 }),
      poc({ name: "Data POC", domains: ["Data"], primaryDomains: ["Data"], currentLoad: 0 }),
    ]);
    expect(result.prep.name).toBe("Finance POC");
    expect(result.prep.domainTier).toBe("primary");
  });

  it("uses cross-domain fallback when no in-domain POC is eligible", () => {
    const result = allocatePoc(input, [
      poc({ name: "Finance Full", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 5 }),
      poc({ name: "Data Available", domains: ["Data"], primaryDomains: ["Data"], currentLoad: 0 }),
    ]);
    expect(result.prep.name).toBe("Data Available");
    expect(result.prep.matchType).toBe("Cross-Domain");
  });

  it("uses an explicit active admin mapping as Path C", () => {
    const result = allocatePoc(input, [
      poc({ id: "mapped", name: "Mapped", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 2 }),
      poc({ id: "lighter", name: "Lighter", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 0 }),
    ], [{
      domain_slug: "finance",
      poc_id: "mapped",
      poc_name: "Mapped",
      priority: 1,
      is_active: true,
    }]);
    expect(result.path).toBe("C");
    expect(result.prep.name).toBe("Mapped");
  });

  it("keeps alias resolution local to an allocation call", () => {
    const pool = [
      poc({ name: "Finance POC", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 1 }),
      poc({ name: "Data POC", domains: ["Data"], primaryDomains: ["Data"], currentLoad: 0 }),
    ];
    const aliasResult = allocatePoc(
      { ...input, processDomain: "Fin" },
      pool,
      undefined,
      (raw) => raw.trim().toLowerCase() === "fin" ? "finance" : raw.trim().toLowerCase(),
    );
    const plainResult = allocatePoc({ ...input, processDomain: "Fin" }, pool);

    expect(aliasResult.prep.name).toBe("Finance POC");
    expect(plainResult.prep.name).toBe("Data POC");
  });

  it("does not reuse an over-capacity historical POC", () => {
    const result = allocatePoc({
      ...input,
      existingProcesses: [{ company: "Acme", role: "Analyst", prepPocId: "full", prepPoc: "Full", status: "ongoing" }],
    }, [
      poc({ id: "full", name: "Full", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 5 }),
      poc({ id: "free", name: "Free", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 0 }),
    ]);
    expect(result.prep.name).toBe("Free");
  });

  it("treats ambiguous fuzzy history names as unresolved", () => {
    const result = allocatePoc({
      ...input,
      existingProcesses: [{ company: "Acme", role: "Analyst", prepPoc: "Alex", status: "ongoing" }],
    }, [
      poc({ name: "Alex One", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 2 }),
      poc({ name: "Alex Two", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 0 }),
    ]);
    expect(result.path).not.toBe("E");
    expect(result.prep.historicalTag).toBeNull();
  });

  it("applies a historical bonus only when a legacy name resolves uniquely", () => {
    const result = allocatePoc({
      ...input,
      historicalProcesses: [{ company: "Acme", role: "Analyst", prepPoc: "Unique", status: "Converted" }],
    }, [
      poc({ name: "Unique Person", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 1 }),
      poc({ name: "Other Person", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 1 }),
    ]);
    expect(result.prep.name).toBe("Unique Person");
    expect(result.prep.historicalTag).toBe("Converted Expert");
  });

  it("fails when no POC is within capacity", () => {
    expect(() => allocatePoc(input, [
      poc({ name: "Finance Full", domains: ["Finance"], primaryDomains: ["Finance"], currentLoad: 5 }),
    ])).toThrow("NO_AVAILABLE_POCS");
  });
});
