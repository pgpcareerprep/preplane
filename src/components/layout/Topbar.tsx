import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Search, Moon, Sun, LogOut, ChevronDown, Eye, RotateCcw, Users, User as UserIcon, Settings } from "lucide-react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { GlobalSearch, type GlobalSearchHandle } from "@/components/search/GlobalSearch";
import { useNavigate, useLocation } from "react-router-dom";
import { useRole, type Role, type ApprovedUser } from "@/lib/rolesContext";
import { usePocDirectory } from "@/lib/usePocDirectory";
import { useLmpViewing } from "@/lib/lmpViewingContext";
import { useTheme } from "@/lib/themeContext";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";



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

const ROLE_ORDER: Role[] = ["admin", "allocator", "poc"];
const ROLE_LABELS: Record<Role, string> = { admin: "Admins", allocator: "Allocators", poc: "POCs" };

export function Topbar() {
  const { user, role, viewAsRole, setViewAsRole, viewAsUser, setViewAsUser, logout } = useRole();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { pocOptions, target, setTarget } = useLmpViewing();
  const { pocs: approvedUsers, countByEmail } = usePocDirectory();
  const searchRef = useRef<GlobalSearchHandle>(null);

  const searchScope = useMemo(() => {
    if (pathname.startsWith("/lmp")) return "lmp" as const;
    if (pathname.startsWith("/students")) return "student" as const;
    if (pathname.startsWith("/mentors")) return "mentor" as const;
    if (pathname.startsWith("/alumni")) return "alumni" as const;
    if (pathname.startsWith("/data-sources")) return "domain" as const;
    return undefined;
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isAllView = target === "all";
  const isSelfView = !viewAsUser && !isAllView;
  const isActionMode = role === "admin" || role === "allocator";
  const viewLabel = isAllView
    ? "All POCs"
    : viewAsUser
      ? viewAsUser.name
      : viewAsRole === role
        ? "Yourself"
        : `${viewAsRole} View`;

  const grouped = ROLE_ORDER.reduce<Record<Role, ApprovedUser[]>>((acc, r) => {
    acc[r] = approvedUsers.filter(u => u.role === r);
    return acc;
  }, { admin: [], allocator: [], poc: [] });

  // LMP count: prefer poc_profiles.active_load; fall back to sheet-derived pocOptions
  const countFor = (fullName: string, email: string): number => {
    const dbCount = countByEmail[email.toLowerCase()] ?? 0;
    if (dbCount > 0) return dbCount;
    const first = fullName.split(/\s+/)[0]?.toLowerCase() ?? "";
    const full = fullName.toLowerCase();
    const match = pocOptions.find(p => {
      const pn = p.name.toLowerCase();
      return pn === full || pn === first || (first.length >= 3 && pn.startsWith(first));
    });
    return match?.total ?? 0;
  };

  const canSwitchView = role === "admin" || role === "allocator";

  return (
    <header className={cn(
      "sticky top-0 z-20 h-[52px] flex items-center justify-between px-gutter backdrop-blur-xl",
      "bg-background/80 supports-[backdrop-filter]:bg-background/70 border-b border-border",
    )}>
      {/* Left: brand + global "Viewing as" switcher (single source of truth) */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center min-w-0 pr-3 mr-1 border-r border-n200/80 dark:border-d-border hover:opacity-80 transition-opacity"
          aria-label="PrepLane home"
        >
          <span className="text-orange-500 font-bold tracking-tight leading-none text-[19px]">
            PrepLane
          </span>
        </button>

        {canSwitchView && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-n200/80 dark:border-d-border bg-card/60 dark:bg-d-surface text-[11.5px] text-n600 dark:text-d-muted hover:bg-n100/70 hover:border-n300 dark:hover:bg-d-surface-2 transition-all duration-150 shadow-[0_1px_0_rgba(0,0,0,0.02)]">
                <Eye className="h-3 w-3 text-n400" />
                <span className="text-n500">Viewing as</span>
                <span className="font-semibold truncate max-w-[140px] text-n900 dark:text-d-text">{viewLabel}</span>
                <span className={cn(
                  "inline-flex items-center px-1.5 py-[1px] rounded-full text-[9.5px] font-medium",
                  isActionMode
                    ? "bg-orange-100/70 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300"
                    : "bg-n100 text-n500 dark:bg-d-surface-2 dark:text-d-muted",
                )}>
                  {isActionMode ? "Action" : "View only"}
                </span>
                <ChevronDown className="h-3 w-3 text-n400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72 p-0 max-h-[400px] overflow-y-auto">
              <ScrollArea className="h-full">
                <div className="p-1">
                  {/* Reset to self */}
                  {(viewAsUser || isAllView) && (
                    <>
                      <DropdownMenuItem
                        onClick={() => { setViewAsUser(null); setViewAsRole(role); setTarget("me"); }}
                        className="gap-2 text-xs"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset to my view
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}

                  {/* Org-wide oversight */}
                  <DropdownMenuItem
                    onClick={() => { setViewAsUser(null); setTarget("all"); }}
                    className={cn("gap-2 py-1.5", isAllView && "bg-n100 dark:bg-d-surface-2")}
                  >
                    <span className="h-6 w-6 rounded-full bg-n200 dark:bg-d-surface-2 text-n700 dark:text-d-muted grid place-items-center shrink-0">
                      <Users className="h-3 w-3" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-[12px] truncate", isAllView && "font-semibold")}>All POCs</div>
                      <div className="text-[10px] text-n400 dark:text-d-muted truncate">Org-wide oversight · Real-role actions</div>
                    </div>
                    {isAllView && <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />

                  {ROLE_ORDER.map(r => {
                    const users = grouped[r];
                    if (users.length === 0) return null;
                    return (
                      <div key={r}>
                        <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.6px] text-n400 dark:text-d-muted px-2 py-1.5">
                          {ROLE_LABELS[r]} ({users.length})
                        </DropdownMenuLabel>
                        {users.map(au => {
                          const isActive = viewAsUser?.email === au.email;
                          const isSelf = au.email === user.email;
                          return (
                            <DropdownMenuItem
                              key={au.email}
                              onClick={() => {
                                if (isSelf) {
                                  setViewAsUser(null);
                                  setViewAsRole(role);
                                  setTarget("me");
                                } else {
                                  setViewAsUser(au);
                                }
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
                                  {au.email} · {countFor(au.name, au.email)} LMP{countFor(au.name, au.email) === 1 ? "" : "s"}
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
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Right: actions */}
      <div className="flex items-center gap-1.5">
        <GlobalSearch ref={searchRef} scope={searchScope} />

        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          className="h-8 w-8 rounded-full grid place-items-center text-n500 hover:text-n900 hover:bg-n100 dark:text-d-muted dark:hover:text-d-text dark:hover:bg-d-surface-2 transition-colors duration-150"
        >
          {theme === "dark"
            ? <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            : <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
        </button>

        <NotificationsBell />

      </div>
    </header>
  );
}
