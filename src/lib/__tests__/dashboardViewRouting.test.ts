import { describe, it, expect } from "vitest";
import {
  canSwitchToMyLmpHealth,
  dashboardSwitcherOptions,
  primaryDashboardLabel,
  resolveDashboardSurface,
  resolveDashboardView,
} from "@/lib/dashboardViewRouting";

describe("dashboardViewRouting", () => {
  const eligible = [{ pocId: "poc-1" }, { pocId: "poc-2" }];

  it("allocator with valid POC lens can switch to My LMP Health", () => {
    expect(canSwitchToMyLmpHealth("allocator", "poc-1", eligible)).toBe(true);
  });

  it("allocator without valid POC lens cannot switch", () => {
    expect(canSwitchToMyLmpHealth("allocator", "poc-missing", eligible)).toBe(false);
    expect(canSwitchToMyLmpHealth("allocator", null, eligible)).toBe(false);
    expect(canSwitchToMyLmpHealth("allocator", undefined, eligible)).toBe(false);
  });

  it("allocator defaults to primary (Allocator Dashboard) view", () => {
    expect(resolveDashboardView(null, true)).toBe("primary");
    expect(resolveDashboardView("admin", true)).toBe("primary");
  });

  it("my-poc view only when eligible and requested", () => {
    expect(resolveDashboardView("my-poc", true)).toBe("my-poc");
    expect(resolveDashboardView("my-poc", false)).toBe("primary");
  });

  it("admin switcher labels remain Admin Dashboard and My LMP Health", () => {
    expect(dashboardSwitcherOptions("admin")).toEqual([
      { id: "primary", label: "Admin Dashboard" },
      { id: "my-poc", label: "My LMP Health" },
    ]);
    expect(primaryDashboardLabel("admin")).toBe("Admin Dashboard");
  });

  it("allocator switcher labels are Allocator Dashboard and My LMP Health", () => {
    expect(dashboardSwitcherOptions("allocator")).toEqual([
      { id: "primary", label: "Allocator Dashboard" },
      { id: "my-poc", label: "My LMP Health" },
    ]);
    expect(primaryDashboardLabel("allocator")).toBe("Allocator Dashboard");
  });

  it("admin with valid POC lens can switch", () => {
    expect(canSwitchToMyLmpHealth("admin", "poc-2", eligible)).toBe(true);
  });

  it("POC role cannot switch via routing helper", () => {
    expect(canSwitchToMyLmpHealth("poc", "poc-1", eligible)).toBe(false);
  });

  it("View As POC shows POC dashboard even when actor is admin", () => {
    expect(resolveDashboardSurface({
      actorRole: "admin",
      effectiveRole: "poc",
      isViewAsActive: true,
      dashboardView: "primary",
      canSwitchPocHealth: true,
    })).toBe("poc");
  });

  it("View As allocator shows allocator dashboard", () => {
    expect(resolveDashboardSurface({
      actorRole: "admin",
      effectiveRole: "allocator",
      isViewAsActive: true,
      dashboardView: "primary",
      canSwitchPocHealth: false,
    })).toBe("allocator");
  });

  it("admin without View As stays on admin dashboard", () => {
    expect(resolveDashboardSurface({
      actorRole: "admin",
      effectiveRole: "admin",
      isViewAsActive: false,
      dashboardView: "primary",
      canSwitchPocHealth: true,
    })).toBe("admin");
  });

  it("admin My LMP Health without View As shows POC dashboard", () => {
    expect(resolveDashboardSurface({
      actorRole: "admin",
      effectiveRole: "admin",
      isViewAsActive: false,
      dashboardView: "my-poc",
      canSwitchPocHealth: true,
    })).toBe("poc");
  });
});
