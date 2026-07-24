import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRole } from "@/lib/rolesContext";
import { useViewer } from "@/lib/viewerContext";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { AdminLmpDashboard } from "@/components/dashboards/AdminLmpDashboard";
import { AllocatorLmpDashboard } from "@/components/dashboards/AllocatorLmpDashboard";
import { PocLmpDashboard } from "@/components/dashboards/PocLmpDashboard";
import { DashboardViewSwitcher } from "@/components/dashboards/DashboardViewSwitcher";
import {
  canSwitchToMyLmpHealth,
  dashboardSwitcherOptions,
  resolveDashboardSurface,
  resolveDashboardView,
  type DashboardView,
} from "@/lib/dashboardViewRouting";

export default function DashboardPage() {
  const { role, user } = useRole();
  const { isViewAsActive, effectiveRole, effectiveUser } = useViewer();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pocs } = useEligiblePrepPocs();

  const canSwitchPocHealth = useMemo(
    () => !isViewAsActive && canSwitchToMyLmpHealth(role, user.pocProfileId, pocs),
    [isViewAsActive, role, user.pocProfileId, pocs],
  );

  const dashboardView: DashboardView = resolveDashboardView(
    searchParams.get("view"),
    canSwitchPocHealth,
  );

  const setDashboardView = (view: DashboardView) => {
    const next = new URLSearchParams(searchParams);
    if (view === "primary") next.delete("view");
    else next.set("view", view);
    setSearchParams(next, { replace: true });
  };

  const switcherOptions = useMemo(() => dashboardSwitcherOptions(role), [role]);
  const headerExtra = canSwitchPocHealth ? (
    <DashboardViewSwitcher
      value={dashboardView}
      onChange={setDashboardView}
      options={switcherOptions}
    />
  ) : null;

  const surface = resolveDashboardSurface({
    actorRole: role,
    effectiveRole,
    isViewAsActive,
    dashboardView,
    canSwitchPocHealth,
  });

  if (surface === "allocator") {
    return <AllocatorLmpDashboard headerExtra={headerExtra} />;
  }

  if (surface === "admin") {
    return <AdminLmpDashboard headerExtra={headerExtra} />;
  }

  const pocLabel = isViewAsActive
    ? `${effectiveUser.pocProfileName ?? effectiveUser.name}'s LMP Health`
    : dashboardView === "my-poc"
      ? "My LMP Health"
      : undefined;

  return (
    <PocLmpDashboard
      sourceLabel={pocLabel}
      headerExtra={headerExtra}
    />
  );
}
