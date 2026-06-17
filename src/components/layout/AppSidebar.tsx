import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  LayoutDashboard,
  PlusCircle,
  Target,
  BarChart2,
  Database,
  Settings,
  Users,
  Sparkles,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
  ChevronRight,
  LogOut,
  Moon,
  Sun,
  Eye,
  RotateCcw,
  User as UserIcon,
  type LucideIcon,
} from "lucide-react";
import { useRole, type Role, type ApprovedUser } from "@/lib/rolesContext";
import { useTheme } from "@/lib/themeContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLE_ORDER: Role[] = ["admin", "allocator", "poc"];
const ROLE_LABELS: Record<Role, string> = { admin: "Admins", allocator: "Allocators", poc: "POCs" };

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  roles?: Role[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
  roles?: Role[];
};

const GROUPS: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard",      to: "/dashboard",     icon: LayoutDashboard },
      { label: "Last Mile Prep", to: "/lmp",           icon: Target },
      { label: "Create Process", to: "/processes/new", icon: PlusCircle, roles: ["admin", "allocator"] },
      { label: "Mentors",        to: "/mentors",       icon: Users },
      { label: "LMP Copilot",    to: "/copilot",       icon: Sparkles },
    ],
  },
  {
    label: "Admin",
    roles: ["admin"],
    items: [
      { label: "Data Sources", to: "/data-sources", icon: Database },
    ],
  },
  {
    label: "Repository",
    roles: ["allocator", "poc"],
    items: [
      { label: "Repository", to: "/data-sources", icon: Database },
    ],
  },
  {
    label: "Account",
    roles: ["admin", "allocator", "poc"],
    items: [{ label: "Settings", to: "/settings", icon: Settings }],
  },
];

function roleBadgeClass(role: Role) {
  switch (role) {
    case "admin":     return "bg-plum-400/15 text-plum-400 border-plum-400/30";
    case "allocator": return "bg-orange-500/15 text-orange-400 border-orange-500/30";
    case "poc":       return "bg-teal-400/15 text-teal-400 border-teal-400/30";
  }
}

function roleColor(role: string) {
  switch (role) {
    case "admin":     return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300";
    case "allocator": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300";
    case "poc":       return "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300";
    default:          return "bg-n200 text-n700";
  }
}

function initialsFrom(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

export function AppSidebar() {
  const { viewAsRole, role, user, logout, approvedUsers, viewAsUser, setViewAsUser, setViewAsRole } = useRole();
  const { theme, toggle } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("lumina:sidebar-collapsed") === "1";
  });

  useEffect(() => {
    try { window.localStorage.setItem("lumina:sidebar-collapsed", collapsed ? "1" : "0"); } catch { /* storage unavailable */ }
  }, [collapsed]);

  // Restore view-as from URL param on load / when approvedUsers arrive.
  // POCs cannot use this path — only admin/allocator.
  useEffect(() => {
    if (role === "poc" || approvedUsers.length === 0) return;
    const uuid = searchParams.get("viewAs");
    if (!uuid || !UUID_RE.test(uuid)) return;
    // Only apply if not already viewing that user (avoids re-applying on every render).
    if (viewAsUser?.pocId === uuid) return;
    const matched = approvedUsers.find(u => u.pocId === uuid);
    if (matched && matched.email !== user.email) {
      setViewAsUser(matched);
    }
  }, [searchParams, approvedUsers, role]); // eslint-disable-line react-hooks/exhaustive-deps

  const canViewAs = role === "admin" || role === "allocator";
  const effectiveRole = viewAsRole;

  const selectViewAs = (au: ApprovedUser) => {
    setViewAsUser(au);
    const next = new URLSearchParams(searchParams);
    if (au.pocId) next.set("viewAs", au.pocId);
    else next.delete("viewAs");
    setSearchParams(next, { replace: true });
  };

  const clearViewAs = () => {
    setViewAsUser(null);
    setViewAsRole(role);
    const next = new URLSearchParams(searchParams);
    next.delete("viewAs");
    setSearchParams(next, { replace: true });
  };

  const grouped = ROLE_ORDER.reduce<Record<Role, ApprovedUser[]>>((acc, r) => {
    acc[r] = approvedUsers.filter(u => u.role === r);
    return acc;
  }, { admin: [], allocator: [], poc: [] });

  return (
    <aside
      className={cn(
        "hidden md:flex h-full shrink-0 flex-col sidebar-warm-dark relative transition-[width] duration-200 ease-smooth",
        collapsed ? "w-[64px]" : "w-[220px]",
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-px bg-card/[0.04]" />
      <div className="relative z-10 flex flex-col h-full">
        {/* Collapse toggle */}
        <div className="px-2 pt-3 pb-1 shrink-0">
          <button
            type="button"
            onClick={() => setCollapsed(v => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={cn(
              "w-full inline-flex items-center gap-2 h-8 rounded-lg text-[11px] text-[#A8A398] hover:text-white hover:bg-card/[0.06] transition-colors",
              collapsed ? "justify-center px-0" : "px-3",
            )}
          >
            {collapsed
              ? <ChevronsRight className="h-4 w-4" />
              : <><ChevronsLeft className="h-4 w-4" /><span>Collapse</span></>}
          </button>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-2.5 pt-2 pb-2 space-y-5">
          {GROUPS.filter(g => !g.roles || g.roles.includes(effectiveRole)).map((group) => {
            const items = group.items.filter(i => !i.roles || i.roles.includes(effectiveRole));
            if (items.length === 0) return null;
            const showLabel = group.label !== "Workspace" && !collapsed;
            return (
              <div key={group.label}>
                {showLabel && (
                  <div className="px-2.5 mb-1.5 text-[11px] uppercase tracking-[0.06em] text-[#A8A398] font-semibold">
                    {group.label}
                  </div>
                )}
                <ul className="space-y-[2px]">
                  {items.map(item => {
                    const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
                    const link = (
                      <NavLink
                        to={item.to}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-[8px] h-8 text-[13px] transition-all duration-150 ease-smooth",
                          collapsed ? "justify-center px-0" : "px-2.5",
                          active
                            ? "bg-[rgba(227,131,48,0.14)] text-white font-medium"
                            : "text-[#D4D0C4] hover:text-[#FAFAF8] hover:bg-card/[0.06]",
                        )}
                      >
                        {active && !collapsed && (
                          <span aria-hidden className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-orange-500" />
                        )}
                        <item.icon className={cn("h-[15px] w-[15px] shrink-0 transition-colors", active ? "text-orange-500" : "text-[#A8A398]")} strokeWidth={1.75} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </NavLink>
                    );
                    return (
                      <li key={item.to}>
                        {collapsed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>{link}</TooltipTrigger>
                            <TooltipContent side="right">{item.label}</TooltipContent>
                          </Tooltip>
                        ) : link}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="px-2 pb-2 pt-2 border-t border-white/[0.06] shrink-0 space-y-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={`Account menu for ${user.name}`}
                className={cn(
                  "w-full inline-flex items-center gap-2 rounded-xl bg-[#2A2822] hover:bg-[#332F27] border border-white/[0.08] transition-colors",
                  collapsed ? "p-1.5 justify-center" : "p-2",
                )}
              >
                <span className="h-8 w-8 shrink-0 rounded-full bg-card/[0.08] text-white grid place-items-center text-[11px] font-semibold ring-1 ring-white/10 overflow-hidden">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    user.initials
                  )}
                </span>
                {!collapsed && (
                  <>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="text-[12.5px] font-medium text-white truncate">{user.name}</div>
                      <span className={cn(
                        "inline-flex items-center mt-0.5 px-1.5 py-[1px] rounded-full text-[9px] uppercase tracking-[0.5px] border font-medium",
                        roleBadgeClass(role),
                      )}>
                        {role}
                      </span>
                    </div>
                    <ChevronDown className="h-3.5 w-3.5 text-[#A8A398] shrink-0" />
                  </>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="right" align="end" className="w-64">
              <div className="px-2 py-2 flex items-center gap-2">
                <span className="h-9 w-9 rounded-full bg-n900 dark:bg-d-blue text-white grid place-items-center text-[12px] font-medium shrink-0 overflow-hidden">
                  {user.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.name} className="h-full w-full object-cover" />
                  ) : (
                    user.initials
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-n800 dark:text-d-text truncate">{user.name}</div>
                  <div className="text-[11px] text-n500 dark:text-d-muted truncate">{user.email}</div>
                  <span className={cn(
                    "inline-flex items-center mt-1 px-1.5 py-0.5 rounded-full text-[9px] uppercase tracking-[0.5px] border font-medium",
                    roleBadgeClass(role),
                  )}>
                    {role}
                  </span>
                </div>
              </div>
              <DropdownMenuSeparator />

              {/* Profile */}
              <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-[13px]">
                <UserIcon className="h-3.5 w-3.5" />
                Profile
              </DropdownMenuItem>

              {/* View as (admin / allocator only) */}
              {canViewAs && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger className="gap-2 text-[13px]">
                    <Eye className="h-3.5 w-3.5" />
                    <span className="flex-1">
                      View as{viewAsUser ? <span className="ml-1.5 text-[11px] text-orange-500 font-medium">{viewAsUser.name}</span> : null}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-64 p-0">
                    <ScrollArea className="max-h-[360px]">
                      <div className="p-1">
                        {/* Reset to self */}
                        {viewAsUser && (
                          <>
                            <DropdownMenuItem onClick={clearViewAs} className="gap-2 text-[12px]">
                              <RotateCcw className="h-3 w-3" />
                              Reset to my view
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                          </>
                        )}
                        {ROLE_ORDER.map(r => {
                          const users = grouped[r];
                          if (users.length === 0) return null;
                          return (
                            <div key={r}>
                              <div className="px-2 py-1.5 text-[10px] uppercase tracking-[0.6px] text-n400 dark:text-d-muted font-semibold">
                                {ROLE_LABELS[r]} ({users.length})
                              </div>
                              {users.map(au => {
                                const isActive = viewAsUser?.email === au.email;
                                const isSelf = au.email === user.email;
                                return (
                                  <DropdownMenuItem
                                    key={au.email}
                                    onClick={() => {
                                      if (isSelf) clearViewAs();
                                      else selectViewAs(au);
                                    }}
                                    className={cn("gap-2 py-1.5", isActive && "bg-n100 dark:bg-d-surface-2")}
                                  >
                                    <span className={cn(
                                      "h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
                                      roleColor(au.role),
                                    )}>
                                      {initialsFrom(au.name)}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <div className={cn("text-[12px] truncate", isActive && "font-semibold")}>
                                        {au.name}{isSelf ? " (You)" : ""}
                                      </div>
                                      <div className="text-[10px] text-n400 dark:text-d-muted truncate">
                                        {au.role}
                                      </div>
                                    </div>
                                    {isActive && <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />}
                                  </DropdownMenuItem>
                                );
                              })}
                              <DropdownMenuSeparator />
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}

              {/* Settings (admin only) */}
              {role === "admin" && (
                <DropdownMenuItem onClick={() => navigate("/settings")} className="gap-2 text-[13px]">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </DropdownMenuItem>
              )}

              {/* Theme toggle */}
              <DropdownMenuItem onClick={toggle} className="gap-2 text-[13px]">
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {theme === "dark" ? "Light mode" : "Dark mode"}
              </DropdownMenuItem>

              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={logout}
                className="gap-2 text-[13px] text-red-600 dark:text-red-400 focus:text-red-600 focus:bg-red-50 dark:focus:bg-red-900/20"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  );
}
