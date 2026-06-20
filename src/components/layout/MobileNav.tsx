import { NavLink, useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { useRole } from "@/lib/rolesContext";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { filterNavGroups } from "./navConfig";

type MobileNavProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** When true, render only the trigger (Topbar owns open state). */
  triggerOnly?: boolean;
};

export function MobileNav({ open, onOpenChange, triggerOnly = false }: MobileNavProps) {
  const { viewAsRole, role } = useRole();
  const effectiveRole = viewAsRole ?? role;
  const { pathname } = useLocation();
  const groups = filterNavGroups(effectiveRole);

  const nav = (
    <nav className="flex flex-col gap-5 py-2">
      {groups.map(({ group, items }) => (
        <div key={group.label}>
          {group.label !== "Workspace" && (
            <div className="px-3 mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground font-semibold">
              {group.label}
            </div>
          )}
          <ul className="space-y-1">
            {items.map((item) => {
              const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    onClick={() => onOpenChange?.(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg min-h-[44px] px-3 text-[15px] transition-colors",
                      active
                        ? "bg-orange-500/15 text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted",
                    )}
                  >
                    <item.icon
                      className={cn("h-[18px] w-[18px] shrink-0", active ? "text-orange-500" : "")}
                      strokeWidth={1.75}
                    />
                    {item.label}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  if (triggerOnly && open !== undefined && onOpenChange) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open navigation menu"
            className="md:hidden h-11 w-11 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[min(100vw-2rem,320px)] p-0 pt-12">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="px-3 overflow-y-auto max-h-[calc(100vh-4rem)]">{nav}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation menu"
          className="md:hidden h-11 w-11 rounded-full grid place-items-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Menu className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100vw-2rem,320px)] p-0 pt-12">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigation</SheetTitle>
        </SheetHeader>
        <div className="px-3 overflow-y-auto max-h-[calc(100vh-4rem)]">{nav}</div>
      </SheetContent>
    </Sheet>
  );
}
