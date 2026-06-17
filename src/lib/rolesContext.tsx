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
  /** Canonical full name from poc_profiles — used for display and sheet matching */
  pocProfileName?: string;
  /** poc_profiles.id UUID — used for ID-based ownership checks (preferred over name) */
  pocProfileId?: string | null;
  avatarUrl?: string | null;
};

export type ApprovedUser = {
  name: string;
  email: string;
  role: Role;
  /** poc_profiles.id — used for UUID-based filtering in view-as mode */
  pocId?: string | null;
  /** poc_profiles.role_type — used to exclude outreach-only POCs from View As */
  pocRoleType?: string | null;
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

      // Fetch canonical POC full name and ID by email — the single source of truth
      let pocProfileName: string | undefined;
      let pocProfileId: string | null = null;
      if (userEmail) {
        const { data: pocP } = await supabase
          .from("poc_profiles")
          .select("id, name")
          .eq("email", userEmail)
          .maybeSingle();
        if (pocP?.name) pocProfileName = pocP.name;
        if (pocP?.id) pocProfileId = pocP.id;
      }
      // Fallback: prefix-match display name's first name — only when email lookup failed.
      // Requires a unique match to avoid "Mansi Bhargava" vs "Mansi Jain" ambiguity.
      if (!pocProfileName && displayName && displayName !== "User") {
        const firstName = displayName.split(" ")[0];
        if (firstName && firstName.length >= 3) {
          const { data: pocMatches } = await supabase
            .from("poc_profiles")
            .select("id, name")
            .ilike("name", `${firstName} %`)
            .limit(2);
          if (pocMatches && pocMatches.length === 1) {
            pocProfileName = pocMatches[0].name;
            pocProfileId = pocMatches[0].id;
          }
        }
      }

      if (cancelled) return;

      setUser({
        id: uid,
        name: displayName,
        email,
        initials: initialsFrom(pocProfileName ?? displayName),
        pocProfileName,
        pocProfileId,
        avatarUrl: (profile as any)?.avatar_url ?? null,
      });
      setRole(resolvedRole);
      // View As is never restored from localStorage, sessionStorage, or URL params.
      // Each session starts with a clean slate (no persisted impersonation).
      setViewAsRole(resolvedRole);
      setIsLoading(false);

      // Privileged roles can select a POC perspective without changing authority.
      if (resolvedRole === "admin" || resolvedRole === "allocator") {
        const { data: allUsers } = await supabase
          .from("profiles")
          .select("display_name, email, role")
          .eq("access_status", "approved")
          .eq("is_active", true)
          .not("email", "is", null)
          .order("role")
          .order("display_name");
        if (!cancelled && allUsers) {
          const validUsers = (allUsers as any[]).filter((u) => u.display_name && u.email && u.role);
          // Enrich: prefer poc_profiles.name (canonical full name) over profiles.display_name
          // so the Viewing As dropdown always matches the POC Domain database.
          const emails = validUsers.map((u) => (u.email as string).toLowerCase());
          const pocNameByEmail: Map<string, string> = new Map();
          const pocIdByEmail: Map<string, string> = new Map();
          // role_type: "outreach_poc" means the person is outreach-only; exclude from View As.
          const pocRoleTypeByEmail: Map<string, string> = new Map();
          if (emails.length > 0) {
            const { data: pocRows } = await supabase
              .from("poc_profiles")
              .select("email, name, id, role_type, status")
              .not("email", "is", null)
              .in("email", emails);
            for (const p of pocRows ?? []) {
              if (!p.email) continue;
              const key = (p.email as string).toLowerCase();
              if (p.name) pocNameByEmail.set(key, p.name as string);
              if (p.id) pocIdByEmail.set(key, p.id as string);
              if (p.role_type) pocRoleTypeByEmail.set(key, p.role_type as string);
            }
          }
          const enriched: ApprovedUser[] = [];
          for (const u of validUsers) {
            const emailKey = (u.email as string).toLowerCase();
            const pocRoleType = pocRoleTypeByEmail.get(emailKey) ?? null;
            const profilesRole = u.role as Role;

            // For POC users: require a matching poc_profiles record and exclude outreach-only.
            if (profilesRole === "poc") {
              if (!pocIdByEmail.has(emailKey)) continue; // no poc_profiles record — skip
              if (pocRoleType === "outreach_poc") continue; // outreach-only — exclude
            }

            enriched.push({
              name: (pocNameByEmail.get(emailKey) ?? u.display_name) as string,
              email: u.email as string,
              role: profilesRole,
              pocId: pocIdByEmail.get(emailKey) ?? null,
              pocRoleType,
            });
          }
          setApprovedUsers(enriched);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  // Subscribe to own profile row so role/access changes from User Management
  // take effect immediately without requiring a page refresh.
  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;

    const channel = supabase
      .channel(`profile-live-${uid}`)
      .on(
        "postgres_changes" as never,
        {
          event: "UPDATE",
          schema: "public",
          table: "profiles",
          filter: `user_id=eq.${uid}`,
        },
        (payload: any) => {
          const updated = payload.new as {
            role?: string;
            access_status?: string;
            is_active?: boolean;
          };
          if (!updated) return;

          const profileRole = ((updated.role as string | null) ?? "").trim().toLowerCase();
          const hasValidRole = profileRole === "admin" || profileRole === "allocator" || profileRole === "poc";
          const isApproved =
            (updated.access_status == null || updated.access_status === "approved") &&
            updated.is_active !== false &&
            hasValidRole;

          if (!isApproved) {
            supabase.auth.signOut().then(() => {
              setSession(null);
              setUser(GUEST);
              setRole("poc");
              if (typeof window !== "undefined") {
                window.location.replace("/login?error=not_approved");
              }
            });
            return;
          }

          setRole(profileRole as Role);
          setViewAsRole(profileRole as Role);
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setUser(GUEST);
    setRole("poc");
  }, []);

  const setViewAsUser = useCallback((u: ApprovedUser | null) => {
    if (role !== "admin" && role !== "allocator") return;
    setViewAsUserState(u);
    if (u) {
      setViewAsRole(u.role as Role);
    } else {
      setViewAsRole(role);
    }
    // View As is intentionally NOT persisted to localStorage.
    // Each session / page load starts with the user's own perspective.
  }, [role]);

  const value = useMemo<RoleContextValue>(
    () => ({
      role,
      viewAsRole,
      setViewAsRole: (r: Role) => {
        if (role === "admin" || role === "allocator") {
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
 * True when a privileged user selected another data perspective.
 * This affects filtering only; real-role permissions remain authoritative.
 */
export function useIsViewingAsOther(): boolean {
  const { role, viewAsRole, viewAsUser } = useRole();
  return (role === "admin" || role === "allocator") && (viewAsRole !== role || !!viewAsUser);
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
