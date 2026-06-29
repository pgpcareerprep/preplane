import { forwardRef, useMemo, useState, type ButtonHTMLAttributes } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, ArrowDown, MoreHorizontal, Users, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Requisition, type ReqStatus } from "@/lib/lmpProcessMutations";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAvatarUrl } from "@/lib/hooks/useAvatarUrls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STATUS_PILL: Record<ReqStatus, string> = {
  ongoing: "pill-ongoing",
  dormant: "pill-dormant",
  hold: "pill-hold",
  converted: "pill-converted",
  "not-converted": "pill-not-converted",
  "not-started": "pill-not-started",
  closed: "pill-closed",
  "converted-na": "pill-na",
};

const STATUS_LABEL: Record<ReqStatus, string> = {
  ongoing: "Ongoing", dormant: "Dormant", hold: "On Hold",
  converted: "Converted", "not-converted": "Not Converted", closed: "Closed",
  "not-started": "Not Started", "converted-na": "Converted NA",
};

type Health = "Healthy" | "Slow" | "Stuck";
const HEALTH_META: Record<Health, { dot: string; text: string }> = {
  Healthy: { dot: "bg-sage-400", text: "text-sage-600" },
  Slow:    { dot: "bg-yellow-500", text: "text-yellow-600" },
  Stuck:   { dot: "bg-coral-400", text: "text-coral-600" },
};

function deriveHealth(r: Requisition): Health {
  if (r.slaDays >= 30 || r.status === "dormant") return "Stuck";
  if (r.slaDays >= 14 || r.status === "hold") return "Slow";
  return "Healthy";
}

function slaChip(days: number) {
  if (days < 14) return { cls: "bg-sage-50 text-sage-600 border-sage-200", label: `${days}d` };
  if (days <= 30) return { cls: "bg-yellow-50 text-yellow-600 border-yellow-200", label: `${days}d` };
  return { cls: "bg-coral-50 text-coral-600 border-coral-200", label: `${days}d` };
}

function lastActivityFor(r: Requisition): string {
  if (r.status === "converted") return `${r.createdAt} — Offer accepted`;
  if (r.status === "dormant") return `${r.createdAt} — No update`;
  if (r.status === "hold") return `${r.createdAt} — Paused`;
  if (r.status === "not-converted") return `${r.createdAt} — Closed lost`;
  if (r.status === "closed") return `${r.createdAt} — Archived`;
  return `${r.createdAt} — Round update`;
}

type PocRoleType = "in-domain" | "cross-domain" | "behavioral";
const ROLE_RING: Record<PocRoleType, string> = {
  "in-domain": "ring-2 ring-sage-500/70",
  "cross-domain": "ring-2 ring-orange-500/70",
  "behavioral": "ring-2 ring-plum-400/70",
};

type SortKey = "role" | "candidates" | "status" | "slaDays" | "lastActivity";

export function LmpProcessesTable({
  reqs,
  onEditPoc,
}: {
  reqs: Requisition[];
  onEditPoc: (r: Requisition) => void;
}) {
  const navigate = useNavigate();
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "slaDays", dir: "desc" });

  const sorted = useMemo(() => {
    const arr = [...reqs];
    arr.sort((a, b) => {
      const av = (a as any)[sort.key];
      const bv = (b as any)[sort.key];
      if (typeof av === "number" && typeof bv === "number") return sort.dir === "asc" ? av - bv : bv - av;
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [reqs, sort]);

  const toggle = (k: SortKey) =>
    setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }));

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "role", label: "Role" },
    { key: "candidates", label: "Candidates" },
    { key: "status", label: "Status" },
    { key: "slaDays", label: "SLA" },
    { key: "lastActivity", label: "Last Activity" },
  ];

  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-n200 shadow-sm py-12 text-center text-[13px] text-n500">
        No requisitions match the current filters.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Sort bar */}
      <div className="flex items-center justify-end gap-1.5 text-[11px] text-n500">
        <ArrowUpDown className="h-3 w-3" />
        <span className="uppercase tracking-[0.5px] mr-1">Sort</span>
        {sortOptions.map((opt) => {
          const active = sort.key === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => toggle(opt.key)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                active ? "bg-n900 text-white" : "text-n600 hover:text-n900 hover:bg-n100",
              )}
            >
              {opt.label}
              {active && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
            </button>
          );
        })}
      </div>

      {/* Strip cards */}
      <div className="space-y-2.5">
        {sorted.map((r) => {
          const sla = slaChip(r.slaDays);
          const health = deriveHealth(r);
          const hm = HEALTH_META[health];

          const handleCardClick = (e: React.MouseEvent) => {
            const t = e.target as HTMLElement;
            if (t.closest("[data-stop-card-click]")) return;
            navigate(`/processes/${r.id}`);
          };

          return (
            <div
              key={r.id}
              onClick={handleCardClick}
              className="group cursor-pointer rounded-xl bg-card border border-n200 shadow-sm hover:shadow-md hover:border-orange-300 transition-all duration-200"
            >
              <div className="grid items-center gap-4 px-5 py-4 grid-cols-[minmax(0,2.2fr)_110px_72px_56px_minmax(0,1.4fr)_110px_92px_48px_140px_28px]">
                {/* 1. Primary info */}
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-n900 truncate">
                    {r.company && <>{r.company}<span className="text-n400 font-normal"> — </span></>}{r.role || <span className="text-n400 italic font-normal">No role</span>}
                  </div>
                  <div className="text-[11.5px] text-n500 mt-0.5 truncate">
                    {r.seniority} • {r.stage.split("—")[0].trim()}
                  </div>
                </div>

                {/* 2. Domain */}
                <div className="min-w-0">
                  <span className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n700 px-2 py-0.5 text-[11px] font-medium truncate max-w-full">
                    {r.domain}
                  </span>
                </div>

                {/* 3. POCs */}
                <div className="flex justify-start">
                  <PocAvatars req={r} />
                </div>

                {/* 4. Candidates */}
                <div className="inline-flex items-center gap-1 text-[12px] text-n700 tabular-nums">
                  <Users className="h-3.5 w-3.5 text-n400" /> {r.candidates}
                </div>

                {/* 5. Stage */}
                <div className="text-[12px] text-n600 truncate" title={r.stage}>
                  {r.stage}
                </div>

                {/* 6. Status */}
                <div className="flex justify-start">
                  <span className={cn("pill", STATUS_PILL[r.status])}>{STATUS_LABEL[r.status]}</span>
                </div>

                {/* 7. Health */}
                <div className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", hm.text)}>
                  <span className={cn("h-2 w-2 rounded-full", hm.dot)} /> {health}
                </div>

                {/* 8. SLA */}
                <div className="flex justify-center">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums",
                      sla.cls,
                    )}
                  >
                    {sla.label}
                  </span>
                </div>

                {/* 9. Last activity */}
                <div className="text-[11.5px] text-n500 truncate">
                  {lastActivityFor(r)}
                </div>

                {/* 10. Kebab */}
                <div data-stop-card-click className="flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors"
                          aria-label="Card actions"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem onClick={() => navigate(`/processes/${r.id}`)}>View</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditPoc(r)}>Edit POC</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onEditPoc(r)}>Reassign</DropdownMenuItem>
                        
                      </DropdownMenuContent>
                    </DropdownMenu>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PocAvatars({ req }: { req: Requisition }) {
  const items: { name: string; initials: string; color: string; roleType: PocRoleType }[] = [];
  items.push({
    name: req.domainPrepPoc.name,
    initials: req.domainPrepPoc.initials,
    color: req.domainPrepPoc.color,
    roleType: req.domainPrepPoc.matchType === "Cross-Domain" ? "cross-domain" : "in-domain",
  });
  if (req.supportPoc && req.supportPoc.name !== req.domainPrepPoc.name) {
    items.push({
      name: req.supportPoc.name,
      initials: req.supportPoc.initials,
      color: req.supportPoc.color,
      roleType: "behavioral",
    });
  }
  const visible = items.slice(0, 2);
  const overflow = items.length - visible.length;

  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex items-center -space-x-1.5">
        {visible.map((p) => (
          <Tooltip key={p.name}>
            <TooltipTrigger asChild>
              <PocAvatarBadge p={p} />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[11px] font-medium">
              {p.name}
            </TooltipContent>
          </Tooltip>
        ))}
        {overflow > 0 && (
          <span className="h-7 w-7 rounded-full ring-2 ring-white bg-n100 text-n600 text-[10px] font-semibold flex items-center justify-center">
            +{overflow}
          </span>
        )}
      </div>
    </TooltipProvider>
  );
}

type PocAvatarItem = { name: string; initials: string; color: string; roleType: PocRoleType };

type PocAvatarBadgeProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  p: PocAvatarItem;
};

const PocAvatarBadge = forwardRef<HTMLButtonElement, PocAvatarBadgeProps>(function PocAvatarBadge(
  { p, className, onClick, ...props },
  ref,
) {
  const photoUrl = useAvatarUrl(p.name);
  return (
    <button
      ref={ref}
      type="button"
      aria-label={`${p.initials}: ${p.name}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
      className={cn(
        "h-7 w-7 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-semibold overflow-hidden shrink-0 cursor-default",
        !photoUrl && p.color,
        ROLE_RING[p.roleType],
        className,
      )}
      {...props}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        p.initials
      )}
    </button>
  );
});

