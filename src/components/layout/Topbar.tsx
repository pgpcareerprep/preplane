import { useEffect, useMemo, useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { NotificationsBell } from "@/components/notifications/NotificationsBell";
import { GlobalSearch, type GlobalSearchHandle } from "@/components/search/GlobalSearch";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "@/lib/themeContext";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
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

  return (
    <header className={cn(
      "sticky top-0 z-20 h-[52px] flex items-center justify-between px-gutter backdrop-blur-xl",
      "bg-background/80 supports-[backdrop-filter]:bg-background/70 border-b border-border",
    )}>
      {/* Left: brand */}
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
      </div>

      {/* Right: search, theme, notifications */}
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
