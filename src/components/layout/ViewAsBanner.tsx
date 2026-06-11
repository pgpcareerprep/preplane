import { useRole } from "@/lib/rolesContext";
import { Eye, X } from "lucide-react";

/**
 * Perspective banner shown while a privileged user filters as another user.
 */
export function ViewAsBanner() {
  const { role, user, viewAsRole, viewAsUser, setViewAsRole, setViewAsUser } = useRole();
  const isViewingAsOther = (role === "admin" || role === "allocator") && (viewAsRole !== role || !!viewAsUser);
  if (!isViewingAsOther) return null;

  const label = viewAsUser ? `${viewAsUser.name} (${viewAsUser.role})` : viewAsRole.toUpperCase();
  const realName = user.pocProfileName ?? user.name;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 border-b border-amber-700 shadow-sm">
      <div className="w-full px-gutter py-2 flex items-center justify-between gap-3 text-sm font-medium">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span>Viewing <strong>{label}</strong>'s perspective. Management actions still use your real <strong>{role}</strong> authority as <strong>{realName}</strong>.</span>
        </div>
        <button
          type="button"
          onClick={() => { setViewAsUser(null); setViewAsRole(role); }}
          className="inline-flex items-center gap-1 rounded-md bg-amber-950/10 hover:bg-amber-950/20 px-2 py-1 text-xs"
        >
          <X className="h-3 w-3" /> Exit view-as
        </button>
      </div>
    </div>
  );
}
