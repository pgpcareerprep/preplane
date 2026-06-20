import { describe, expect, it } from "vitest";
import { filterNavGroups, NAV_GROUPS } from "@/components/layout/navConfig";

describe("navConfig RBAC", () => {
  it("admin sees Admin Data Sources and Create Process", () => {
    const labels = filterNavGroups("admin").flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Data Sources");
    expect(labels).toContain("Create Process");
    expect(labels).not.toContain("Repository");
  });

  it("allocator sees Repository not Admin group", () => {
    const groups = filterNavGroups("allocator");
    expect(groups.some((g) => g.group.label === "Admin")).toBe(false);
    expect(groups.some((g) => g.group.label === "Repository")).toBe(true);
    expect(groups.flatMap((g) => g.items.map((i) => i.label))).toContain("Create Process");
  });

  it("poc sees Repository not Create Process", () => {
    const labels = filterNavGroups("poc").flatMap((g) => g.items.map((i) => i.label));
    expect(labels).toContain("Repository");
    expect(labels).not.toContain("Create Process");
    expect(labels).not.toContain("Data Sources");
  });

  it("NAV_GROUPS matches legacy workspace item count", () => {
    expect(NAV_GROUPS[0]?.items.length).toBe(5);
  });
});
