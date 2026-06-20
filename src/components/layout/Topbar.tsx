import { useEffect, useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Moon, Search, Sun, Eye, Lock, RotateCcw } from "lucide-react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { GlobalSearch, type GlobalSearchHandle } from "@/components/search/GlobalSearch";
import { PrepLaneLogo } from "@/components/brand/PrepLaneLogo";
import { MobileNav } from "@/components/layout/MobileNav";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/lib/themeContext";
import { useRole } from "@/lib/rolesContext";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PREPLANE_MASTER_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1zWNwRCudhOemZS5zCht46i34wuTQNCqho7pkqWGmsIo/edit?usp=sharing";

function ViewAsBadge() {
  const { role, viewAsUser, viewAsRole, setViewAsUser, setViewAsRole } = useRole();
  const isViewingAsOther =
    (role === "admin" || role === "allocator") && (viewAsRole !== role || !!viewAsUser);

  if (!isViewingAsOther) return null;

  const displayName = viewAsUser
    ? viewAsUser.name
    : viewAsRole.charAt(0).toUpperCase() + viewAsRole.slice(1);
  const displayRole = viewAsUser ? viewAsUser.role : viewAsRole;

  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600 text-amber-900 dark:text-amber-200">
      <Eye className="h-3 w-3 shrink-0" aria-hidden />
      <span className="text-[11.5px] font-medium whitespace-nowrap">
        {displayName}
        <span className="mx-1 opacity-60">·</span>
        <span className="capitalize opacity-80">{displayRole}</span>
        <span className="mx-1 opacity-60">·</span>
        <Lock className="inline h-2.5 w-2.5 mb-px opacity-70" aria-label="Read-only" />
        <span className="ml-0.5 opacity-70">Read-only</span>
      </span>
      <button
        type="button"
        onClick={() => { setViewAsUser(null); setViewAsRole(role); }}
        title="Restore my view"
        className="ml-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-amber-200 dark:bg-amber-800 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors"
      >
        <RotateCcw className="h-2.5 w-2.5" />
        Restore
      </button>
    </div>
  );
}

export function Topbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const searchRef = useRef<GlobalSearchHandle>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
        if (window.matchMedia("(min-width: 768px)").matches) {
          searchRef.current?.focus();
        } else {
          setSearchOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (searchOpen) {
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [searchOpen]);

  return (
    <>
      <header className={cn(
        "sticky top-0 z-20 h-[52px] flex items-center justify-between px-4 md:px-gutter backdrop-blur-xl",
        "bg-background/80 supports-[backdrop-filter]:bg-background/70 border-b border-border",
      )}>
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center min-w-0 md:pr-3 md:mr-1 md:border-r md:border-border hover:opacity-80 transition-opacity shrink-0"
            aria-label="PrepLane home"
          >
            <PrepLaneLogo size="md" variant="image" />
          </button>
          <div className="hidden md:block">
            <ViewAsBadge />
          </div>
        </div>

        {/* Desktop search + actions */}
        <div className="hidden md:flex items-center gap-1.5">
          <GlobalSearch ref={searchRef} scope={searchScope} />
          <a
            href={PREPLANE_MASTER_SHEET_URL}
            target="_blank"
            rel="noopener noreferrer"
            title="Open PrepLane Sheet"
            aria-label="Open PrepLane Google Sheet"
            className="h-8 w-8 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          </a>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            className="h-8 w-8 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
          >
            {theme === "dark"
              ? <Sun className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              : <Moon className="h-4 w-4" strokeWidth={1.75} aria-hidden />}
          </button>
          <NotificationsBell />
        </div>

        {/* Mobile actions */}
        <div className="flex md:hidden items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-label="Open search"
            className="h-11 w-11 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <NotificationsBell />
          <MobileNav open={navOpen} onOpenChange={setNavOpen} triggerOnly />
        </div>
      </header>

      {/* Mobile search sheet */}
      <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
        <SheetContent side="top" className="h-auto max-h-[85vh] p-4 pt-12">
          <SheetHeader className="sr-only">
            <SheetTitle>Search</SheetTitle>
          </SheetHeader>
          <GlobalSearch
            ref={searchRef}
            scope={searchScope}
            mobile
            className="w-full"
            onNavigate={() => setSearchOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
