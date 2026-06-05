import { useRole } from "@/lib/rolesContext";
import { AdminLmpDashboard } from "@/components/dashboards/AdminLmpDashboard";
import { AllocatorLmpDashboard } from "@/components/dashboards/AllocatorLmpDashboard";
import { PocLmpDashboard } from "@/components/dashboards/PocLmpDashboard";

export default function DashboardPage() {
  const { viewAsRole } = useRole();
  if (viewAsRole === "admin") return <AdminLmpDashboard />;
  if (viewAsRole === "allocator") return <AllocatorLmpDashboard />;
  return <PocLmpDashboard />;
}
