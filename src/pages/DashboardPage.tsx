import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useRole } from "@/lib/rolesContext";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { AdminLmpDashboard } from "@/components/dashboards/AdminLmpDashboard";
import { AllocatorLmpDashboard } from "@/components/dashboards/AllocatorLmpDashboard";
import { PocLmpDashboard } from "@/components/dashboards/PocLmpDashboard";
import {
  DashboardViewSwitcher,
  type DashboardView,
} from "@/components/dashboards/DashboardViewSwitcher";

export default function DashboardPage() {
  const { role, user, viewAsRole } = useRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const { pocs } = useEligiblePrepPocs();

  const canSwitchAdminPocView = useMemo(() => {
    if (role !== "admin") return false;
    if (!user.pocProfileId) return false;
    return pocs.some((p) => p.pocId === user.pocProfileId);
  }, [role, user.pocProfileId, pocs]);

  const requestedView: DashboardView =
    searchParams.get("view") === "my-poc" ? "my-poc" : "admin";
  const dashboardView: DashboardView =
    canSwitchAdminPocView && requestedView === "my-poc" ? "my-poc" : "admin";

  const setDashboardView = (view: DashboardView) => {
    const next = new URLSearchParams(searchParams);
    if (view === "admin") next.delete("view");
    else next.set("view", view);
    setSearchParams(next, { replace: true });
  };

  const headerExtra = canSwitchAdminPocView ? (
    <DashboardViewSwitcher value={dashboardView} onChange={setDashboardView} />
  ) : null;

  if (viewAsRole === "allocator") return <AllocatorLmpDashboard />;

  if (viewAsRole === "admin") {
    if (dashboardView === "my-poc") {
      return (
        <PocLmpDashboard
          sourceLabel="My POC Dashboard"
          headerExtra={headerExtra}
        />
      );
    }
    return <AdminLmpDashboard headerExtra={headerExtra} />;
  }

  return <PocLmpDashboard />;
}
