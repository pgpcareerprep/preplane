export type DashboardView = "primary" | "my-poc";

export type EligiblePoc = { pocId: string };

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
