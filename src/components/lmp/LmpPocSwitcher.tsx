import { useMemo } from "react";
import { ChevronDown, Eye, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLmpViewing, type ViewingTarget } from "@/lib/lmpViewingContext";
import { useLmpRows } from "@/lib/sheets/hooks";
import { useRole } from "@/lib/rolesContext";
import { usePocSwitcherList } from "@/lib/hooks/useDbData";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type UnifiedPoc = {
  name: string;        // value used for filtering (sheet first-name or full name)
  displayName: string; // shown in UI (full name when available)
  initials: string;
  color: string;
  total: number;
  primary: number;
  secondary: number;
  outreach: number;
};

const POC_COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-purple-200 text-purple-600",
  "bg-blue-200 text-blue-600",
  "bg-pink-200 text-pink-600",
  "bg-green-200 text-green-600",
  "bg-amber-200 text-amber-600",
  "bg-cyan-200 text-cyan-600",
];

/**
 * Top-level "Viewing as" switcher for the LMP board.
 * Merges sheet-based POC names (first names) with approved_users (full names).
 */
export function LmpPocSwitcher() {
  const { user, setViewAsUser, approvedUsers } = useRole();
  const { target, setTarget, pocOptions, currentUserName } = useLmpViewing();
  const { isLoading } = useLmpRows();
  const { data: dbPocList } = usePocSwitcherList();

  // Build unified POC list: sheet-based counts enriched with full names from approved_users
  const unified = useMemo<UnifiedPoc[]>(() => {
    const result = new Map<string, UnifiedPoc>();

    // Add sheet-based POCs with their LMP counts
    for (const p of dbPocList || []) {
      result.set(p.name.toLowerCase(), {
        name: p.name,
        displayName: p.name,
        initials: p.initials,
        color: POC_COLORS[result.size % POC_COLORS.length],
        total: p.total,
        primary: p.primary,
        secondary: p.secondary,
        outreach: p.outreach,
      });
    }

    // Also include pocOptions from the viewing context (parsed from live sheet data)
    for (const p of pocOptions || []) {
      const key = p.name.toLowerCase();
      if (!result.has(key)) {
        result.set(key, {
          name: p.name,
          displayName: p.name,
          initials: p.initials,
          color: p.color || POC_COLORS[result.size % POC_COLORS.length],
          total: p.total,
          primary: p.primary,
          secondary: p.secondary,
          outreach: p.outreach,
        });
      }
    }

    // Enrich with full names from approved_users where first name matches
    for (const au of approvedUsers || []) {
      const auFirst = au.name.split(/\s+/)[0].toLowerCase();
      const auFull = au.name.toLowerCase();

      // Try matching by first name against sheet entries
      if (result.has(auFirst) && !result.has(auFull)) {
        const entry = result.get(auFirst)!;
        entry.displayName = au.name; // show full name in UI
      } else if (result.has(auFull)) {
        const entry = result.get(auFull)!;
        entry.displayName = au.name;
      }

      // Add approved user even if no sheet data yet
      if (!result.has(auFull) && !result.has(auFirst)) {
        result.set(auFull, {
          name: au.name,
          displayName: au.name,
          initials: au.name.split(/\s+/).map((w: string) => w[0]).join("").toUpperCase().slice(0, 2),
          color: "bg-n200 text-n600",
          total: 0,
          primary: 0,
          secondary: 0,
          outreach: 0,
        });
      }
    }

    return [...result.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [dbPocList, pocOptions, approvedUsers]);

  // When a specific POC is picked from the switcher, also sync to RoleContext
  const handleSelectPoc = (poc: UnifiedPoc) => {
    setTarget(poc.name);
    // Try matching approved user by display name or first name
    const match = approvedUsers.find(
      (u) => u.name === poc.displayName || u.name === poc.name ||
        u.name.split(/\s+/)[0].toLowerCase() === poc.name.toLowerCase()
    );
    if (match) setViewAsUser(match);
  };

  const isMine = target === "me";
  const isAll = target === "all";
  const activeOther = !isMine && !isAll
    ? unified.find((p) => p.name === target || p.name.toLowerCase() === target.toLowerCase())
    : undefined;

  const { viewAsRole: role } = useRole();
  const label = isMine
    ? (role === "admin" || role === "allocator") ? "My LMPs (All)" : "My LMPs"
    : isAll
      ? "All POCs"
      : activeOther?.displayName ?? "All POCs";

  const trailing = isMine
    ? { text: "Action Mode", cls: "bg-orange-50 text-orange-600 border-orange-200" }
    : { text: "Summary", cls: "bg-n100 text-n600 border-n200" };

  const others = unified.filter((p) => {
    const pLower = p.name.toLowerCase();
    const userLower = user.name.toLowerCase();
    const userFirst = userLower.split(/\s+/)[0];
    return pLower !== userLower && pLower !== userFirst;
  });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg border border-n300 bg-card shadow-sm",
            "text-[12.5px] text-n800 hover:border-n400 transition-colors",
          )}
        >
          <span className="text-n400 text-[11px] uppercase tracking-[0.5px]">Viewing</span>
          <span className="font-semibold text-n900 truncate max-w-[160px]">{label}</span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-[1px] text-[10px] font-medium border",
              trailing.cls,
            )}
          >
            {isMine ? null : <Eye className="h-2.5 w-2.5" />}
            {trailing.text}
          </span>
          {isLoading ? <Loader2 className="h-3.5 w-3.5 text-n400 animate-spin" /> : <ChevronDown className="h-3.5 w-3.5 text-n400" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-0 max-h-[min(400px,70vh)] overflow-hidden">
        <ScrollArea className="h-full max-h-[min(400px,70vh)]">
          <div className="p-1">
            <DropdownMenuLabel className="text-[10.5px] uppercase tracking-[0.5px] text-n400">
              Personal
            </DropdownMenuLabel>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuItem onClick={() => setTarget("me")}>
                  <SwitcherRow
                    initials={user.initials}
                    color="bg-orange-200 text-orange-600"
                    name={`My LMPs (${user.name.split(" ")[0]})`}
                    sub={`Matching as: ${currentUserName} · Action Mode`}
                    active={isMine}
                  />
                </DropdownMenuItem>
              </TooltipTrigger>
              <TooltipContent side="right">Matching as: {currentUserName}</TooltipContent>
            </Tooltip>
            <DropdownMenuSeparator />

            <DropdownMenuLabel className="text-[10.5px] uppercase tracking-[0.5px] text-n400">
              Individual POCs · read-only
            </DropdownMenuLabel>
            {others.length === 0 && (
              <div className="px-2 py-1.5 text-[12px] text-n400 italic">No other POCs found</div>
            )}
            {others.map((p) => (
              <DropdownMenuItem key={p.name} onClick={() => handleSelectPoc(p)}>
                <SwitcherRow
                  initials={p.initials}
                  color={p.color}
                  name={p.displayName}
                  sub={`${p.total} LMP${p.total === 1 ? "" : "s"} · ${p.primary} Primary · ${p.secondary} Support · Summary view`}
                  active={target === p.name}
                />
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setTarget("all")}>
              <SwitcherRow
                initials="·"
                color="bg-n200 text-n700"
                icon={<Users className="h-3.5 w-3.5" />}
                name="All POCs"
                sub="Org-wide oversight · Summary"
                active={isAll}
              />
            </DropdownMenuItem>
          </div>
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SwitcherRow({
  initials, color, name, sub, active, icon,
}: {
  initials: string;
  color: string;
  name: string;
  sub: string;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 w-full">
      <span className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0", color)}>
        {icon ?? initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[12.5px] truncate", active ? "font-semibold text-n900" : "text-n800")}>
          {name}
        </div>
        <div className="text-[10.5px] text-n500 truncate">{sub}</div>
      </div>
      {active && <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />}
    </div>
  );
}
