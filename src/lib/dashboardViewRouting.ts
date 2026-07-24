export type DashboardView = "primary" | "my-poc";

export type EligiblePoc = { pocId: string };

/** Which dashboard shell to render. */
export type DashboardSurface = "admin" | "allocator" | "poc";

/** Real logged-in role + profile — not viewAsRole. */
export function canSwitchToMyLmpHealth(
  role: string,
  pocProfileId: string | null | undefined,
  eligiblePocs: EligiblePoc[],
): boolean {
  if (role !== "admin" && role !== "allocator") return false;
  if (!pocProfileId) return false;
  return eligiblePocs.some((p) => p.pocId === pocProfileId);
}

export function resolveDashboardView(
  viewParam: string | null,
  canSwitch: boolean,
): DashboardView {
  if (canSwitch && viewParam === "my-poc") return "my-poc";
  return "primary";
}

/**
 * Pick the dashboard surface.
 * View As always wins: show the selected profile's role dashboard
 * (POC → PocLmpDashboard scoped via effectivePocId).
 */
export function resolveDashboardSurface(opts: {
  actorRole: string;
  effectiveRole: string;
  isViewAsActive: boolean;
  dashboardView: DashboardView;
  canSwitchPocHealth: boolean;
}): DashboardSurface {
  if (opts.isViewAsActive) {
    if (opts.effectiveRole === "allocator") return "allocator";
    if (opts.effectiveRole === "admin") return "admin";
    return "poc";
  }
  if (opts.actorRole === "allocator") {
    if (opts.dashboardView === "my-poc" && opts.canSwitchPocHealth) return "poc";
    return "allocator";
  }
  if (opts.actorRole === "admin") {
    if (opts.dashboardView === "my-poc" && opts.canSwitchPocHealth) return "poc";
    return "admin";
  }
  return "poc";
}

export function primaryDashboardLabel(role: string): string {
  if (role === "allocator") return "Allocator Dashboard";
  return "Admin Dashboard";
}

export function dashboardSwitcherOptions(role: string): Array<{ id: DashboardView; label: string }> {
  return [
    { id: "primary", label: primaryDashboardLabel(role) },
    { id: "my-poc", label: "My LMP Health" },
  ];
}
