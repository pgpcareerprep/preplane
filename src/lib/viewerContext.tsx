/**
 * ViewerContext — single source of truth for "who is the real actor" vs "who are we
 * viewing as". Wraps RoleContext; all other parts of the app should consume this
 * rather than reaching into RoleContext for view-as state.
 *
 * Rules:
 *  - actor*  : always the real authenticated user — never mutated during View As
 *  - effective* : the viewed user (= actor when not in View As mode)
 *  - isViewAsActive : true only when viewing as someone else
 *  - isReadOnly : always true when View As is active (VIEW_AS_READ_ONLY from contract)
 *  - View As MUST NOT be restored from localStorage, sessionStorage, URL params, or
 *    React Query cache. Session ends mean a clean slate.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useRole, type Role, type User, type ApprovedUser } from "@/lib/rolesContext";
import { VIEW_AS_READ_ONLY } from "../../supabase/functions/_shared/permissionContract";

export type { Role, User, ApprovedUser };

export type ViewerContextValue = {
  /** Always the real authenticated user. */
  actorUser: User;
  actorRole: Role;
  /** poc_profiles.id of the real user, or null. */
  actorPocId: string | null;

  /** The user whose perspective is being rendered (= actor when not in View As). */
  effectiveUser: User;
  effectiveRole: Role;
  /** poc_profiles.id of the effective user, or null. */
  effectivePocId: string | null;

  isViewAsActive: boolean;
  /** Always true when isViewAsActive; always false otherwise. */
  isReadOnly: boolean;

  /** Start viewing as another user. No-op unless actorRole is admin or allocator. */
  startViewAs: (u: ApprovedUser) => void;
  /** Clear View As, return to own perspective. */
  restoreOwnView: () => void;
};

const ViewerContext = createContext<ViewerContextValue | null>(null);

export function ViewerProvider({ children }: { children: ReactNode }) {
  const { role, viewAsRole, viewAsUser, setViewAsUser, user } = useRole();

  const value = useMemo<ViewerContextValue>(() => {
    const actorPocId = user.pocProfileId ?? null;
    const isViewAsActive = !!(viewAsUser && (viewAsUser.email !== user.email));

    // Build an effective User from the viewAsUser ApprovedUser when active.
    const effectiveUser: User = isViewAsActive && viewAsUser
      ? {
          id: "",          // ApprovedUser has no Supabase UID; leave blank
          name: viewAsUser.name,
          email: viewAsUser.email,
          initials: viewAsUser.name
            .split(/\s+/)
            .map((w) => w[0])
            .join("")
            .toUpperCase()
            .slice(0, 2),
          pocProfileId: (viewAsUser as any).pocId ?? null,
          pocProfileName: viewAsUser.name,
        }
      : user;

    const effectiveRole: Role = isViewAsActive ? viewAsRole : role;
    const effectivePocId: string | null = isViewAsActive
      ? ((viewAsUser as any)?.pocId ?? null)
      : actorPocId;

    return {
      actorUser: user,
      actorRole: role,
      actorPocId,
      effectiveUser,
      effectiveRole,
      effectivePocId,
      isViewAsActive,
      isReadOnly: isViewAsActive ? VIEW_AS_READ_ONLY : false,
      startViewAs: (u: ApprovedUser) => {
        if (role !== "admin" && role !== "allocator") return;
        setViewAsUser(u);
      },
      restoreOwnView: () => {
        setViewAsUser(null);
      },
    };
  }, [user, role, viewAsRole, viewAsUser, setViewAsUser]);

  return <ViewerContext.Provider value={value}>{children}</ViewerContext.Provider>;
}

export function useViewer(): ViewerContextValue {
  const ctx = useContext(ViewerContext);
  if (!ctx) throw new Error("useViewer must be used within ViewerProvider");
  return ctx;
}
