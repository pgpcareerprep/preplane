import { describe, it, expect } from "vitest";
import { resolveLmpStatusSlug } from "@/components/lmp/LmpStatusPill";

describe("resolveLmpStatusSlug", () => {
  it("resolves display labels", () => {
    expect(resolveLmpStatusSlug("Prep Ongoing")).toBe("prep-ongoing");
    expect(resolveLmpStatusSlug("On Hold")).toBe("hold");
    expect(resolveLmpStatusSlug("On hold")).toBe("hold");
    expect(resolveLmpStatusSlug("Other reasons")).toBe("other-reasons");
  });

  it("resolves slugs and legacy aliases", () => {
    expect(resolveLmpStatusSlug("prep-ongoing")).toBe("prep-ongoing");
    expect(resolveLmpStatusSlug("ongoing")).toBe("prep-ongoing");
    expect(resolveLmpStatusSlug("offer-received")).toBe("converted");
  });

  it("returns null for empty", () => {
    expect(resolveLmpStatusSlug("")).toBeNull();
    expect(resolveLmpStatusSlug(null)).toBeNull();
  });
});
