import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRole } from "@/lib/rolesContext";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { AdminLmpDashboard } from "@/components/dashboards/AdminLmpDashboard";
import { AllocatorLmpDashboard } from "@/components/dashboards/AllocatorLmpDashboard";
import { PocLmpDashboard } from "@/components/dashboards/PocLmpDashboard";
import { DashboardViewSwitcher } from "@/components/dashboards/DashboardViewSwitcher";
import {
  canSwitchToMyLmpHealth,
  dashboardSwitcherOptions,
  resolveDashboardView,
  type DashboardView,
} from "@/lib/dashboardViewRouting";

export default function DashboardPage() {
  const { role, user, viewAsRole } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pocs } = useEligiblePrepPocs();

  const canSwitchPocHealth = useMemo(
    () => canSwitchToMyLmpHealth(role, user.pocProfileId, pocs),
    [role, user.pocProfileId, pocs],
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

  if (role === "allocator") {
    if (dashboardView === "my-poc" && canSwitchPocHealth) {
      return (
        <PocLmpDashboard
          sourceLabel="My LMP Health"
          headerExtra={headerExtra}
        />
      );
    }
    return <AllocatorLmpDashboard headerExtra={headerExtra} />;
  }

  if (viewAsRole === "allocator") return <AllocatorLmpDashboard />;

  if (viewAsRole === "admin" || role === "admin") {
    if (dashboardView === "my-poc" && canSwitchPocHealth) {
      return (
        <PocLmpDashboard
          sourceLabel="My LMP Health"
          headerExtra={headerExtra}
        />
      );
    }
    return <AdminLmpDashboard headerExtra={headerExtra} />;
  }

  return <PocLmpDashboard />;
}
