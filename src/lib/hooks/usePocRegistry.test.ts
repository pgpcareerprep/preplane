import { describe, expect, it } from "vitest";
import { mergePocDomains } from "./usePocRegistry";

describe("mergePocDomains", () => {
  it("includes a primary domain that is not repeated in domain_tags", () => {
    expect(mergePocDomains("Finance", ["Product Management", "FO/COS", "Data"])).toEqual([
      "Finance",
      "Product Management",
      "FO/COS",
      "Data",
    ]);
  });

  it("deduplicates primary and tagged domains case-insensitively", () => {
    expect(mergePocDomains("Finance", ["finance", "Data", "data"])).toEqual([
      "Finance",
      "Data",
    ]);
  });
});
