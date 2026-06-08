import { createContext, useContext, useEffect, useMemo, useState, useCallback, useRef, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

export type Role = "allocator" | "poc" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  initials: string;
  domain?: string;
  /** Canonical POC name from poc_profiles — used for sheet matching */
  pocProfileName?: string;
  avatarUrl?: string | null;
};

export type ApprovedUser = {
  name: string;
  email: string;
  role: Role;
};

type RoleContextValue = {
  role: Role;
  viewAsRole: Role;
  setViewAsRole: (r: Role) => void;
  /** When admin is viewing as a specific user */
  viewAsUser: ApprovedUser | null;
  setViewAsUser: (u: ApprovedUser | null) => void;
  /** All approved users (fetched for admins) */
  approvedUsers: ApprovedUser[];
  user: User;
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
};

const RoleContext = createContext<RoleContextValue | null>(null);

function initialsFrom(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const GUEST: User = { id: "", name: "", email: "", initials: "" };

export function RoleProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<Role>("poc");
  const [viewAsRole, setViewAsRole] = useState<Role>("poc");
  const [viewAsUser, setViewAsUserState] = useState<ApprovedUser | null>(null);
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [user, setUser] = useState<User>(GUEST);
  const currentUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const applySession = (s: Session | null) => {
      const nextUserId = s?.user?.id ?? null;
      const userChanged = currentUserIdRef.current !== nextUserId;
      currentUserIdRef.current = nextUserId;

      setSession(s);
      if (nextUserId) {
        if (userChanged) {
          setIsLoading(true);
          setUser(GUEST);
          setRole("poc");
          setViewAsRole("poc");
          setViewAsUserState(null);
          setApprovedUsers([]);
        }
        return;
      }

      setIsLoading(false);
      setUser(GUEST);
      setRole("poc");
      setViewAsRole("poc");
      setViewAsUserState(null);
      setApprovedUsers([]);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      applySession(s);
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      applySession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) return;
    const uid = session.user.id;
    let cancelled = false;

    (async () => {
      const userEmail = session.user.email?.toLowerCase() || "";

      if (import.meta.env.DEV) {
        console.log("[auth] Session found — uid:", uid, "email:", userEmail);
      }

      // Look up profile by user_id first, then by email (first-time OAuth users
      // may not have user_id bound yet if the trigger hasn't run on this row).
      const { data: byUid, error: uidErr } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, role, access_status, is_active, avatar_url")
        .eq("user_id", uid)
        .maybeSingle();

      // If the DB query itself failed (network/RLS error), do NOT sign the user out.
      // A transient failure must not revoke a legitimate session.
      if (uidErr) {
        if (import.meta.env.DEV) {
          console.error("[auth] Profile lookup by user_id failed:", uidErr.message);
        }
        if (!cancelled) setIsLoading(false);
        return;
      }

      let profile = byUid ?? null;

      if (!profile && userEmail) {
        const { data: byEmail, error: emailErr } = await supabase
          .from("profiles")
          .select("id, user_id, display_name, email, role, access_status, is_active, avatar_url")
          .ilike("email", userEmail.trim())
          .maybeSingle();

        if (emailErr) {
          if (import.meta.env.DEV) {
            console.error("[auth] Profile lookup by email failed:", emailErr.message);
          }
          if (!cancelled) setIsLoading(false);
          return;
        }
        profile = byEmail ?? null;
      }

      if (import.meta.env.DEV) {
        if (profile) {
          console.log("[auth] Profile found:", {
            role: profile.role,
            access_status: profile.access_status,
            is_active: profile.is_active,
          });
        } else {
          console.warn("[auth] No profile row found for uid:", uid, "/ email:", userEmail);
        }
      }

      // Gate access: profile must exist, access_status approved (or null = legacy),
      // is_active must not be explicitly false, role must be admin/allocator/poc.
      const profileRole = ((profile?.role as string | null) ?? "").trim().toLowerCase();
      const hasValidRole = profileRole === "admin" || profileRole === "allocator" || profileRole === "poc";
      const isApproved = !!profile
        && (profile.access_status == null || profile.access_status === "approved")
        && profile.is_active !== false
        && hasValidRole;

      if (!isApproved) {
        if (import.meta.env.DEV) {
          console.warn("[auth] Approval failed —", {
            profileExists: !!profile,
            access_status: profile?.access_status,
            is_active: profile?.is_active,
            role: profile?.role,
            hasValidRole,
          });
        }
        if (cancelled) return;
        await supabase.auth.signOut();
        setSession(null);
        setUser(GUEST);
        setRole("poc");
        setIsLoading(false);
        // Always redirect to /login?error=not_approved, even if already on /login,
        // so the user sees a clear error message regardless of current path.
        if (typeof window !== "undefined") {
          window.location.replace("/login?error=not_approved");
        }
        return;
      }

      // Defensive backfill: bind auth user_id to the matched profile row.
      if (profile && profile.user_id !== uid) {
        await supabase.from("profiles").update({ user_id: uid }).eq("id", profile.id);
      }

      const resolvedRole: Role = (profile?.role as Role) || "poc";
      const displayName = profile?.display_name || session.user.email || "User";
      const email = profile?.email || userEmail;

      // Fetch canonical POC profile name by email for sheet matching
      let pocProfileName: string | undefined;
      if (userEmail) {
        const { data: pocP } = await supabase
          .from("poc_profiles")
          .select("name")
          .eq("email", userEmail)
          .maybeSingle();
        if (pocP?.name) pocProfileName = pocP.name;
      }
      // Fallback: try matching display name's first name to poc_profiles
      if (!pocProfileName && displayName && displayName !== "User") {
        const firstName = displayName.split(" ")[0];
        if (firstName) {
          const { data: pocP2 } = await supabase
            .from("poc_profiles")
            .select("name")
            .ilike("name", firstName)
            .maybeSingle();
          if (pocP2?.name) pocProfileName = pocP2.name;
        }
      }

      if (cancelled) return;

      setUser({
        id: uid,
        name: displayName,
        email,
        initials: initialsFrom(displayName),
        pocProfileName,
        avatarUrl: (profile as any)?.avatar_url ?? null,
      });
      setRole(resolvedRole);
      // Hydrate persisted impersonation (admins) so session refreshes /
      // tab navigation don't wipe the "Viewing as" selection.
      let restoredViewAs: ApprovedUser | null = null;
      if (resolvedRole === "admin") {
        try {
          const stored = typeof window !== "undefined"
            ? window.localStorage.getItem(`lmp_view_as_user_${uid}`)
            : null;
          if (stored) {
            const parsed = JSON.parse(stored) as ApprovedUser;
            if (parsed?.email && parsed?.name && parsed?.role) {
              restoredViewAs = parsed;
            }
          }
        } catch { /* ignore */ }
      }
      if (restoredViewAs) {
        setViewAsUserState(restoredViewAs);
        setViewAsRole(restoredViewAs.role);
      } else {
        setViewAsRole(resolvedRole);
      }
      setIsLoading(false);

      // If admin, fetch all approved-status profiles for the switcher
      if (resolvedRole === "admin") {
        const { data: allUsers } = await supabase
          .from("profiles")
          .select("display_name, email, role")
          .eq("access_status", "approved")
          .eq("is_active", true)
          .not("email", "is", null)
          .order("role")
          .order("display_name");
        if (!cancelled && allUsers) {
          setApprovedUsers(
            (allUsers as any[])
              .filter((u) => u.display_name && u.email && u.role)
              .map((u) => ({ name: u.display_name as string, email: u.email as string, role: u.role as Role })),
          );
        }
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(GUEST);
    setRole("poc");
  }, []);

  const setViewAsUser = useCallback((u: ApprovedUser | null) => {
    if (role !== "admin") return;
    setViewAsUserState(u);
    if (u) {
      setViewAsRole(u.role as Role);
    } else {
      setViewAsRole(role);
    }
    // Persist so navigation / session refresh doesn't reset impersonation.
    try {
      const uid = currentUserIdRef.current;
      if (uid && typeof window !== "undefined") {
        const key = `lmp_view_as_user_${uid}`;
        if (u) window.localStorage.setItem(key, JSON.stringify(u));
        else window.localStorage.removeItem(key);
      }
    } catch { /* ignore */ }
  }, [role]);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      viewAsRole,
      setViewAsRole: (r: Role) => {
        if (role === "admin") {
          setViewAsRole(r);
          setViewAsUserState(null);
        }
      },
      viewAsUser,
      setViewAsUser,
      approvedUsers,
      user,
      isAuthenticated: !!session?.user,
      isLoading,
      logout,
    }),
    [role, viewAsRole, viewAsUser, approvedUsers, user, session, isLoading, logout, setViewAsUser],
  );

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>;
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used within RoleProvider");
  return ctx;
}

/**
 * True when an admin is impersonating another role/user via the "view as"
 * switcher. Mutations should be blocked while this is true.
 */
export function useIsViewingAsOther(): boolean {
  const { role, viewAsRole, viewAsUser } = useRole();
  return role === "admin" && (viewAsRole !== role || !!viewAsUser);
}

export class ViewAsReadOnlyError extends Error {
  constructor() {
    super("READ-ONLY: switch out of view-as mode to edit.");
    this.name = "ViewAsReadOnlyError";
  }
}

export function usePermission() {
  const { role, viewAsRole, user } = useRole();
  return {
    realRole: role,
    viewRole: viewAsRole,
    user,
    isAdmin: role === "admin",
    isAllocator: role === "allocator",
    isPoc: role === "poc",
    canManageUsers: role === "admin",
    canCreateLmp: role === "admin" || role === "allocator",
    canAccessAdmin: role === "admin",
    canAccessDataSources: role === "admin",
    canAccessStudents: role === "admin",
    canAccessSettings: role === "admin",
    canAllocatePoc: role === "admin" || role === "allocator",
    canViewAllPocs: role === "admin" || role === "allocator",
    canViewAuditLogs: role === "admin",
    canViewSyncLogs: role === "admin",
    canViewFieldMapping: role === "admin",
    canRollbackAny: role === "admin",
    canViewDomains: true,
    canEditDomains: role === "admin" || role === "allocator",
  };
}

export function RoleGate({
  role,
  children,
  fallback = null,
}: {
  role: Role | Role[];
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { viewAsRole } = useRole();
  const allowed = Array.isArray(role) ? role.includes(viewAsRole) : role === viewAsRole;
  return <>{allowed ? children : fallback}</>;
}
