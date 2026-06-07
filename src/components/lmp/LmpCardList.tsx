import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  MessageSquare,
  MoreHorizontal,
  Trash2,
  UserPlus,
  UserCog,
  Users,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import { AddOutreachPocDialog } from "./AddOutreachPocDialog";
import { ReassignPocModal } from "./ReassignPocModal";
import { cn } from "@/lib/utils";
import {
  ageDays,
  ageLabel,
  type LmpRecord,
  type LmpStatus,
} from "@/lib/lmpTypes";

import { useLmpChatDrawer } from "@/lib/lmpChatContext";
import { useLmpComments } from "@/lib/hooks/useLmpComments";
import { useLmpProcessComment } from "@/lib/hooks/useLmpProcessComment";
import { useLmpMode } from "@/lib/lmpViewingContext";
import { useDeleteLmpProcess } from "@/lib/hooks/useDbData";
import { useAvatarUrl } from "@/lib/hooks/useAvatarUrls";
import { useRole } from "@/lib/rolesContext";
import { canPerform } from "@/lib/permissions";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusDropdown } from "./StatusDropdown";
import { ExpandedLmpView } from "./ExpandedLmpView";

export type SortKey = "role" | "domain" | "candidates" | "status" | "age" | "lastActivity";
export type SortState = { key: SortKey; dir: "asc" | "desc" };

type PocRole = "primary" | "support" | "behavioral";
type PocDomain = "in-domain" | "cross-domain";
const ROLE_LABEL: Record<PocRole, string> = {
  primary: "Primary Prep POC",
  support: "Support POC",
  behavioral: "Behavioral POC",
};
const DOMAIN_LABEL: Record<PocDomain, string> = {
  "in-domain": "In-domain",
  "cross-domain": "Cross-domain",
};
function ringClass(role: PocRole, domain?: PocDomain): string {
  if (role === "behavioral") return "ring-2 ring-plum-400/70";
  if (role === "support") return "ring-2 ring-plum-400/70";
  // primary
  return domain === "cross-domain"
    ? "ring-2 ring-orange-500/70"
    : "ring-2 ring-sage-500/70";
}


export function LmpCardList({
  records,
  onChangeStatus,
  sort: sortProp,
  onSortChange,
}: {
  records: LmpRecord[];
  onChangeStatus?: (id: string, status: LmpStatus) => void;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
}) {
  const [internalSort, setInternalSort] = useState<SortState>({ key: "age", dir: "asc" });
  const sort = sortProp ?? internalSort;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const sorted = useMemo(() => {
    const arr = [...records];
    arr.sort((a, b) => {
      let av: any;
      let bv: any;
      if (sort.key === "age") {
        av = ageDays(a.createdAt);
        bv = ageDays(b.createdAt);
      } else {
        av = (a as any)[sort.key];
        bv = (b as any)[sort.key];
      }
      if (typeof av === "number" && typeof bv === "number") {
        return sort.dir === "asc" ? av - bv : bv - av;
      }
      return sort.dir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return arr;
  }, [records, sort]);

  const handleSort = (key: SortKey) => {
    const next: SortState =
      sort.key === key
        ? { key, dir: sort.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" };
    onSortChange?.(next);
    setInternalSort(next);
  };





  if (sorted.length === 0) {
    return (
      <div className="rounded-2xl bg-card border border-n200 shadow-sm py-12 text-center text-[13px] text-n500">
        No LMP records match your filters.
      </div>
    );
  }

  // Single grid template shared by header and every card row.
  // Columns: Role&Co · Domain · POCs · Candidates · Status · Age · Actions
  const GRID =
    "grid items-center gap-4 px-5 py-2.5 grid-cols-[minmax(0,2.5fr)_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(210px,1fr)]";

  return (
    <div className="space-y-3">
      {/* Sticky column header */}
      <div className="sticky top-0 z-10 -mx-1 px-1">
        <div className={cn(GRID, "rounded-lg bg-n50/90 backdrop-blur border border-n200 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-n500")}>
          <SortHeader label="Role & Company" sortKey="role" sort={sort} onSort={handleSort} />
          <SortHeader label="Domain" sortKey="domain" sort={sort} onSort={handleSort} />
          <div>POCs</div>
          <SortHeader label="Candidates" sortKey="candidates" sort={sort} onSort={handleSort} />
          <SortHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
          <SortHeader label="Age" sortKey="age" sort={sort} onSort={handleSort} />
          <div className="text-right pr-1">Actions</div>
        </div>
      </div>

      <div className="space-y-2.5">
        {sorted.map((rec) => (
          <LmpStripCard
            key={rec.id}
            rec={rec}
            grid={GRID}
            expanded={expandedId === rec.id}
            onToggleExpand={() =>
              setExpandedId((id) => (id === rec.id ? null : rec.id))
            }
            onChangeStatus={(s) => onChangeStatus?.(rec.id, s)}
          />
        ))}
      </div>
    </div>
  );
}

function LmpStripCard({
  rec,
  grid,
  expanded,
  onToggleExpand,
  onChangeStatus,
}: {
  rec: LmpRecord;
  grid: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onChangeStatus: (s: LmpStatus) => void;
}) {
  const navigate = useNavigate();
  
  const { data: dbComments = [] } = useLmpComments(rec.id);
  const { data: sheetComment = "" } = useLmpProcessComment(rec.id);
  const { open: openChat } = useLmpChatDrawer();
  const mode = useLmpMode(rec);
  const commentCount = dbComments.length + (sheetComment.trim() ? 1 : 0);
  const { viewAsRole } = useRole();
  // Delete is role-gated (poc only) AND requires ownership (mode === "action" means
  // the current user is the assigned prep/support POC for this specific record).
  const canDelete = canPerform(viewAsRole, "delete_lmp") && mode === "action";
  const deleteLmp = useDeleteLmpProcess();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const canReassignAll = canPerform(viewAsRole, "reassign_poc");
  const canReassignAny = canReassignAll;

  const handleCardClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest("[data-stop-card-click]")) return;
    onToggleExpand();
  };

  return (
    <div
      className={cn(
        "group rounded-xl bg-card border shadow-sm transition-all duration-200",
        expanded ? "border-n300 shadow-md" : "border-n200 hover:shadow-md hover:border-orange-300",
      )}
    >
      <div
        onClick={handleCardClick}
        className={cn("cursor-pointer", grid, "py-4")}
      >
        {/* 1. Primary info */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
            <div className="text-[14px] font-semibold text-n900 leading-tight break-words">
              {rec.company && <>{rec.company}<span className="text-n400 font-normal"> — </span></>}
              {rec.role ? rec.role : <span className="text-n400 italic font-normal">No role</span>}
            </div>
            {rec.type && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium border",
                  /intern/i.test(rec.type)
                    ? "bg-plum-400/10 text-plum-400 border-plum-400/30"
                    : "bg-teal-400/10 text-teal-700 border-teal-400/30",
                )}
              >
                {rec.type}
              </span>
            )}
          </div>
        </div>

        {/* 2. Domain */}
        <div className="min-w-0">
          <span className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n700 px-2 py-0.5 text-[11px] font-medium truncate max-w-full">
            {rec.domain}
          </span>
        </div>

        {/* 3. POCs */}
        <div className="flex justify-start">
          <PocAvatars rec={rec} />
        </div>

        {/* 4. Candidates */}
        <div className="inline-flex items-center gap-1 text-[12px] text-n700 tabular-nums">
          <Users className="h-3.5 w-3.5 text-n400" /> {rec.candidates > 0 ? rec.candidates : <span className="text-n300">—</span>}
        </div>

        {/* 5. Status (clickable) */}
        <div data-stop-card-click className="flex justify-start">
          <StatusDropdown value={rec.status} onChange={onChangeStatus} readOnly={mode === "summary"} />
        </div>

        {/* 6. Age pill */}
        <div>
          <span
            className="inline-flex items-center justify-center rounded-full bg-n100 border border-n200 text-n600 px-2 py-0.5 text-[11px] font-medium tabular-nums"
            title={`Created ${rec.createdAt}`}
          >
            {ageLabel(rec.createdAt)}
          </span>
        </div>

        {/* 7. Action cluster */}
        <div data-stop-card-click className="flex items-center justify-end gap-0.5">
          <IconAction
            label="Comments"
            badge={commentCount || undefined}
            onClick={() => openChat(rec.id)}
          >
            <MessageSquare className="h-4 w-4" />
          </IconAction>
          <IconAction
            label="View details"
            onClick={() => navigate(`/lmp/${encodeURIComponent(rec.id)}?from=cards`)}
          >
            <Eye className="h-4 w-4" />
          </IconAction>
          <IconAction label={expanded ? "Collapse" : "Expand"} onClick={onToggleExpand}>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </IconAction>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors"
                aria-label="Card actions"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate(`/lmp/${encodeURIComponent(rec.id)}?from=cards`)}>
                Open Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleExpand}>
                {expanded ? "Collapse" : "Expand inline"}
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setOutreachOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {rec.outreachPoc?.name ? "Change Outreach POC" : "Add Outreach POC"}
              </DropdownMenuItem>
              {canReassignAny && (
                <DropdownMenuItem onClick={() => setReassignOpen(true)}>
                  <UserCog className="h-4 w-4 mr-2" />
                  Reassign POCs
                </DropdownMenuItem>
              )}
              {canDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete LMP
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this LMP process?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <span className="font-semibold">{rec.role} @ {rec.company}</span> and its candidates and POC assignments. This cannot be undone. The next sheet sync will re-create it if the row still exists in the source sheet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              onClick={() => deleteLmp.mutate(rec.id)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AddOutreachPocDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        lmpId={rec.id}
        lmpLabel={`${rec.role} @ ${rec.company}`}
        currentOutreachPocName={rec.outreachPoc?.name ?? null}
      />

      <ReassignPocModal
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        lmpId={rec.id}
        lmpLabel={`${rec.role} @ ${rec.company}`}
        scope={canReassignAll ? "all" : "support_outreach"}
      />

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="expand"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <ExpandedLmpView
              rec={rec}
              onCollapse={onToggleExpand}
              onChangeStatus={onChangeStatus}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (k: SortKey) => void;
}) {
  const active = sort.key === sortKey;
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={cn(
        "inline-flex items-center gap-1 uppercase tracking-[0.6px] font-semibold text-left transition-colors",
        active ? "text-orange-600" : "text-n500 hover:text-n800",
      )}
    >
      <span className="truncate">{label}</span>
      {active ? (
        sort.dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : (
          <ArrowDown className="h-3 w-3" />
        )
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-40" />
      )}
    </button>
  );
}

function IconAction({
  label,
  onClick,
  badge,
  children,
}: {
  label: string;
  onClick: () => void;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors"
          aria-label={label}
        >
          {children}
          {badge !== undefined && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-1 rounded-full bg-orange-500 text-white text-[9px] font-semibold inline-flex items-center justify-center tabular-nums">
              {badge}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-[11px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function PocAvatars({ rec }: { rec: LmpRecord }) {
  type Item = { name: string; initials: string; color: string; role: PocRole; domain?: PocDomain };
  const items: Item[] = [];
  const seen = new Set<string>();
  const add = (it: Item) => {
    const key = it.name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    items.push(it);
  };
  const domainOf = (mt?: string): PocDomain =>
    mt === "Cross-Domain" ? "cross-domain" : "in-domain";

  if (rec.domainPrepPoc) {
    add({
      name: rec.domainPrepPoc.name,
      initials: rec.domainPrepPoc.initials,
      color: rec.domainPrepPoc.color,
      role: "primary",
      domain: domainOf(rec.domainPrepPoc.matchType),
    });
  } else {
    rec.pocs.slice(0, 2).forEach((p) =>
      add({ name: p.name, initials: p.initials, color: p.color, role: "primary", domain: "in-domain" }),
    );
  }
  if (rec.supportPoc) {
    add({
      name: rec.supportPoc.name,
      initials: rec.supportPoc.initials,
      color: rec.supportPoc.color,
      role: "support",
      domain: domainOf(rec.supportPoc.matchType),
    });
  }
  if (rec.behavioralPrepPoc) {
    add({
      name: rec.behavioralPrepPoc.name,
      initials: rec.behavioralPrepPoc.initials,
      color: rec.behavioralPrepPoc.color,
      role: "behavioral",
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
            <TooltipContent side="top" className="text-[11px]">
              <div className="font-semibold">{p.name}</div>
              <div className="text-n500">
                {ROLE_LABEL[p.role]}
                {p.domain ? ` · ${DOMAIN_LABEL[p.domain]}` : ""}
              </div>
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

function PocAvatarBadge({ p }: { p: { name: string; initials: string; color: string; role: PocRole; domain?: PocDomain } }) {
  const photoUrl = useAvatarUrl(p.name);
  return (
    <span
      className={cn(
        "h-7 w-7 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-semibold overflow-hidden",
        !photoUrl && p.color,
        ringClass(p.role, p.domain),
      )}
    >
      {photoUrl ? (
        <img src={photoUrl} alt={p.name} className="h-full w-full object-cover" />
      ) : (
        p.initials
      )}
    </span>
  );
}
