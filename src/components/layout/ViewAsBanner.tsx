import { useRole } from "@/lib/rolesContext";
import { Eye, X } from "lucide-react";

/**
 * Read-only banner shown when admin is impersonating another role/user.
 * Pairs with assertWritable() in roles.tsx to block mutations during view-as mode.
 */
export function ViewAsBanner() {
  const { role, user, viewAsRole, viewAsUser, setViewAsRole, setViewAsUser } = useRole();
  const isViewingAsOther = role === "admin" && (viewAsRole !== role || !!viewAsUser);
  if (!isViewingAsOther) return null;

  const label = viewAsUser ? `${viewAsUser.name} (${viewAsUser.role})` : viewAsRole.toUpperCase();
  const realName = user.pocProfileName ?? user.name;

  return (
    <div className="sticky top-0 z-50 w-full bg-amber-500 text-amber-950 border-b border-amber-700 shadow-sm">
      <div className="w-full px-gutter py-2 flex items-center justify-between gap-3 text-sm font-medium">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4" />
          <span>READ-ONLY MODE — viewing as <strong>{label}</strong>. You can only edit LMPs where you (<strong>{realName}</strong>) are a POC.</span>
        </div>
        <button
          type="button"
          onClick={() => { setViewAsUser(null); setViewAsRole("admin"); }}
          className="inline-flex items-center gap-1 rounded-md bg-amber-950/10 hover:bg-amber-950/20 px-2 py-1 text-xs"
        >
          <X className="h-3 w-3" /> Exit view-as
        </button>
      </div>
    </div>
  );
}
