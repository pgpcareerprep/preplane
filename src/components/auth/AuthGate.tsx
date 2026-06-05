import { Navigate, useLocation } from "react-router-dom";
import { useRole } from "@/lib/rolesContext";
import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

/**
 * Protects all app routes behind authentication.
 * Shows a loading spinner while auth state is resolving.
 * Redirects to /login if not authenticated, preserving the requested path
 * so deep links from emails (e.g. progress reminders) land correctly after login.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useRole();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="h-screen w-full grid place-items-center bg-n50 dark:bg-d-bg">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <p className="text-sm text-n500 dark:text-d-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const target = location.pathname + location.search + location.hash;
    const skip = location.pathname === "/" || location.pathname === "/login";
    const redirect = skip ? "" : `?redirect=${encodeURIComponent(target)}`;
    return <Navigate to={`/login${redirect}`} replace />;
  }

  return <>{children}</>;
}

/**
 * Route-level role gate. Redirects unauthorized roles to /dashboard.
 */
export function RouteRoleGate({
  allowed,
  children,
}: {
  allowed: string[];
  children: ReactNode;
}) {
  const { role } = useRole();
  if (!allowed.includes(role)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
