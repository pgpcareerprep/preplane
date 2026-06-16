import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Check,
  FileText,
  Minus,
  Paperclip,
  Search,
  Settings2,
  Sheet as SheetIcon,
  AlertTriangle,
  Star,
  Trash2,
  Pencil,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { useAvatarUrl } from "@/lib/hooks/useAvatarUrls";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLmpCandidatesByProcess, useLmpFullView, useDeleteLmpProcess } from "@/lib/hooks/useDbData";
import { useLmpSheetLinkStatus } from "@/lib/hooks/useLmpSheetLinkStatus";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


// ── Status pill colours ──────────────────────────────────────────
const STATUS_PILL: Record<string, string> = {
  Ongoing: "bg-sky-50 text-sky-700 border-sky-200",
  Converted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Offer Received": "bg-emerald-50 text-emerald-700 border-emerald-200",
  Dormant: "bg-n100 text-n600 border-n200",
  "On Hold": "bg-amber-50 text-amber-700 border-amber-200",
  Closed: "bg-coral-50 text-coral-700 border-coral-200",
  "Not Converted": "bg-coral-50 text-coral-700 border-coral-200",
  "Not Started": "bg-n100 text-n600 border-n200",
};

const STATUS_FILTER_OPTIONS = [
  "All",
  "Ongoing",
  "Offer Received",
  "Converted",
  "On Hold",
  "Closed",
  "Not Started",
];

// ── Column definitions ───────────────────────────────────────────
type ColKey =
  | "date" | "company" | "role" | "domain" | "status" | "type"
  | "daily_progress" | "prep_doc_shared" | "mentor_aligned"
  | "assignment_review" | "one_to_one_mock"
  | "next_progress_date" | "next_progress_type"
  | "pool_num" | "pool_names"
  | "r1_num" | "r1_names"
  | "r2_num" | "r2_names"
  | "r3_num" | "r3_names"
  | "final_convert_num" | "convert_names"
  | "prep_doc_link"
  | "prep_poc" | "support_poc" | "outreach_poc"
  | "closing_date"
  | "mentor_selected" | "mentor_rating"
  | "feedback_by_outreach"
  | "comment" | "lmp_code";

const COLUMNS: { key: ColKey; label: string; minW: string; align?: "center" }[] = [
  { key: "date",               label: "Date",                         minW: "min-w-[110px]" },
  { key: "company",            label: "Company",                      minW: "min-w-[160px]" },
  { key: "role",               label: "Role",                         minW: "min-w-[140px]" },
  { key: "domain",             label: "Domain",                       minW: "min-w-[120px]" },
  { key: "status",             label: "Status",                       minW: "min-w-[120px]" },
  { key: "type",               label: "Type",                         minW: "min-w-[100px]" },
  { key: "daily_progress",     label: "Daily Progress",               minW: "min-w-[260px]" },
  { key: "prep_doc_shared",    label: "Prep Doc Shared",              minW: "min-w-[60px]",  align: "center" },
  { key: "mentor_aligned",     label: "Mentor Aligned",               minW: "min-w-[60px]",  align: "center" },
  { key: "assignment_review",  label: "Assignment Review",            minW: "min-w-[60px]",  align: "center" },
  { key: "one_to_one_mock",    label: "1:1 mock completed",           minW: "min-w-[60px]",  align: "center" },
  { key: "next_progress_date", label: "Next Progress Date",           minW: "min-w-[140px]" },
  { key: "next_progress_type", label: "Next Progress Type",           minW: "min-w-[140px]" },
  { key: "pool_num",           label: "Shortlisted (Pool) - Number",  minW: "min-w-[60px]",  align: "center" },
  { key: "pool_names",         label: "Shortlisted (Pool) - Name(s)", minW: "min-w-[160px]" },
  { key: "r1_num",             label: "R1 - Numbers",                 minW: "min-w-[60px]",  align: "center" },
  { key: "r1_names",           label: "R1 - Names",                   minW: "min-w-[160px]" },
  { key: "r2_num",             label: "R2 - Numbers",                 minW: "min-w-[60px]",  align: "center" },
  { key: "r2_names",           label: "R2 - Names",                   minW: "min-w-[160px]" },
  { key: "r3_num",             label: "R3 - Numbers",                 minW: "min-w-[60px]",  align: "center" },
  { key: "r3_names",           label: "R3 - Names",                   minW: "min-w-[160px]" },
  { key: "final_convert_num",  label: "Final Converted Numbers",      minW: "min-w-[60px]",  align: "center" },
  { key: "convert_names",      label: "Converted Names",              minW: "min-w-[180px]" },
  { key: "prep_doc_link",      label: "Prep Doc Link",                minW: "min-w-[120px]" },
  { key: "prep_poc",           label: "Prep POC",                     minW: "min-w-[160px]" },
  { key: "support_poc",        label: "Support POC",                  minW: "min-w-[160px]" },
  { key: "outreach_poc",       label: "Outreach POC",                 minW: "min-w-[160px]" },
  { key: "closing_date",       label: "Closing Date",                 minW: "min-w-[120px]" },
  { key: "mentor_selected",    label: "Mentor Selected",              minW: "min-w-[140px]" },
  { key: "mentor_rating",      label: "Mentor Rating",                minW: "min-w-[100px]", align: "center" },
  { key: "feedback_by_outreach", label: "Feedback by outreach",       minW: "min-w-[220px]" },
  { key: "comment",            label: "Comment",                      minW: "min-w-[220px]" },
  { key: "lmp_code",           label: "LMP ID",                       minW: "min-w-[140px]" },
];

const DEFAULT_VISIBLE: Record<ColKey, boolean> = (() => {
  return COLUMNS.reduce((acc, c) => {
    acc[c.key] = true;
    return acc;
  }, {} as Record<ColKey, boolean>);
})();

const STORAGE_KEY = "lmp_table_col_vis_v4";

function loadVisibility(): Record<ColKey, boolean> {
  if (typeof window === "undefined") return DEFAULT_VISIBLE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VISIBLE, ...parsed };
  } catch {
    return DEFAULT_VISIBLE;
  }
}

// ── Formatting helpers ───────────────────────────────────────────
function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value || "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function relativeTime(value: string | null | undefined) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (!then) return "—";
  const diff = Date.now() - then;
  const day = 86_400_000;
  const days = Math.floor(diff / day);
  if (days <= 0) {
    const hours = Math.floor(diff / 3_600_000);
    if (hours <= 0) return "just now";
    return `${hours}h ago`;
  }
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

// ── Cell sub-components ──────────────────────────────────────────
function CheckCell({ value }: { value: boolean }) {
  if (value) return <Check className="h-4 w-4 text-emerald-600 mx-auto" />;
  return <Minus className="h-3.5 w-3.5 text-n300 mx-auto" />;
}

function DomainPill({ value }: { value: string | null }) {
  if (!value) return <span className="text-n400">—</span>;
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-[2px] rounded-full bg-orange-50 text-orange-700 border border-orange-200">
      {value}
    </span>
  );
}

function TypePill({ value }: { value: string | null }) {
  if (!value) return <span className="text-n400">—</span>;
  return (
    <span className="inline-flex items-center text-[11px] font-medium px-2 py-[2px] rounded-full bg-n100 text-n600 border border-n200">
      {value}
    </span>
  );
}

function StatusBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-n400">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center text-[11px] font-medium px-2 py-[2px] rounded-full border",
        STATUS_PILL[value] || "bg-n100 text-n600 border-n200",
      )}
    >
      {value}
    </span>
  );
}

function DailyProgressCell({ text, count }: { text: string | null; count: number | null }) {
  if (!text) return <span className="text-n400">—</span>;
  const truncated = text.length > 60 ? `${text.slice(0, 60)}…` : text;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="text-[12px] text-n700 inline-flex items-center gap-1.5">
          {truncated}
          {count && count > 0 ? (
            <span className="text-[10px] font-medium text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-1.5 py-[1px]">
              ({count})
            </span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-[12px]">{text}</TooltipContent>
    </Tooltip>
  );
}

function LinkIconCell({
  href,
  label,
  icon: Icon,
}: {
  href: string | null;
  label?: string | null;
  icon: typeof FileText;
}) {
  if (!href) return <span className="text-n400">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[12px] text-orange-700 hover:underline truncate max-w-[140px]"
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      <span className="truncate">{label || "Open"}</span>
    </a>
  );
}

function PocAvatarsCell({ names }: { names: string | null }) {
  if (!names) return <span className="text-n400">—</span>;
  const list = names.split(/,\s*/).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((n, i) => (
        <PocAvatarPill key={`${n}-${i}`} name={n} />
      ))}
    </div>
  );
}

function PocAvatarPill({ name }: { name: string }) {
  const photoUrl = useAvatarUrl(name);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-n700 bg-n50 border border-n200 rounded-full pr-2 py-[1px]">
      <span className="h-4 w-4 rounded-full overflow-hidden inline-flex items-center justify-center bg-orange-100 text-orange-700 text-[9px] font-semibold">
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials(name)
        )}
      </span>
      {name}
    </span>
  );
}

function MentorCell({ name, rating }: { name: string | null; rating: number | null }) {
  if (!name) return <span className="text-n400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-n700">
      {name}
      {rating && Number(rating) > 0 ? (
        <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-600">
          <Star className="h-3 w-3 fill-amber-400 stroke-amber-500" />
          {Number(rating).toFixed(1)}
        </span>
      ) : null}
    </span>
  );
}

const NAMED_STAGES = [
  'r1','r1_shortlisted','shortlisted','round1','round_1',
  'r2','r2_shortlisted','round2','round_2',
  'r3','r3_shortlisted','round3','round_3',
  'offer','converted','final','accepted',
] as const;

const STAGE_VALUES: Record<"pool" | "r1" | "r2" | "r3" | "converted", string[]> = {
  pool:      [],
  r1:        ['r1','r1_shortlisted','shortlisted','round1','round_1'],
  r2:        ['r2','r2_shortlisted','round2','round_2'],
  r3:        ['r3','r3_shortlisted','round3','round_3'],
  converted: ['offer','converted','final','accepted'],
};

function CandidatePopoverList({ lmpId, round }: { lmpId: string; round: "pool" | "r1" | "r2" | "r3" | "converted" }) {
  const { data, isLoading } = useLmpCandidatesByProcess(lmpId, true);
  const filtered = (data ?? []).filter((c: any) => {
    const stage = (c.pipeline_stage ?? '').toLowerCase().trim();
    if (round === 'pool') return !(NAMED_STAGES as readonly string[]).includes(stage);
    return STAGE_VALUES[round].includes(stage);
  });
  if (isLoading) return <div className="p-3 text-[12px] text-n500">Loading…</div>;
  if (filtered.length === 0) return <div className="p-3 text-[12px] text-n500">No candidates</div>;
  return (
    <div className="max-h-60 overflow-auto">
      <div className="grid grid-cols-[70px_1fr_90px] gap-2 px-3 py-1.5 text-[10px] font-medium text-n500 uppercase border-b border-n100 sticky top-0 bg-card">
        <span>Roll No</span>
        <span>Name</span>
        <span>Stage</span>
      </div>
      {filtered.map((c: any) => (
        <div
          key={c.id}
          className="grid grid-cols-[70px_1fr_90px] gap-2 px-3 py-1.5 text-[12px] text-n700 border-b border-n50 last:border-b-0"
        >
          <span className="text-n500 truncate">{c.roll_no || "—"}</span>
          <span className="truncate">{c.student_name || "—"}</span>
          <span className="text-n500 truncate">{c.pipeline_stage || "—"}</span>
        </div>
      ))}
    </div>
  );
}

function CountCell({ count, lmpId, round }: { count: number; lmpId: string; round: "pool" | "r1" | "r2" | "r3" | "converted" }) {
  const [open, setOpen] = useState(false);
  if (!count) return <span className="text-n400">0</span>;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen((v) => !v);
          }}
          className="inline-flex items-center justify-center h-6 min-w-[28px] px-1.5 rounded-full text-[12px] font-medium text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100"
        >
          {count}
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        onClick={(e) => e.stopPropagation()}
      >
        <CandidatePopoverList lmpId={lmpId} round={round} />
      </PopoverContent>
    </Popover>
  );
}

// ── Main modal ───────────────────────────────────────────────────
export function ViewAllLmpsModal({
  open,
  onOpenChange,
  readOnly = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  readOnly?: boolean;
}) {
  const navigate = useNavigate();
  const { data: rawRows, isLoading } = useLmpFullView();
  const { names: domainOptions, display: domainDisplay, matches: domainMatches } = useResolveDomain();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [domainFilter, setDomainFilter] = useState("All");
  const [visibility, setVisibility] = useState<Record<ColKey, boolean>>(DEFAULT_VISIBLE);

  useEffect(() => {
    setVisibility(loadVisibility());
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibility));
    }
  }, [visibility]);

  const rows = useMemo(() => {
    const list = (rawRows ?? []) as any[];
    const q = search.trim().toLowerCase();
    return list.filter((r) => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (domainFilter !== "All" && !domainMatches(r.domain_raw, domainFilter)) return false;
      if (!q) return true;
      const haystack = [
        r.company, r.role, r.domain_raw,
        r.prep_poc_names, r.support_poc_names, r.outreach_poc_names,
        r.mentor_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [rawRows, search, statusFilter, domainFilter, domainMatches]);

  const visibleCols = COLUMNS.filter((c) => visibility[c.key]);
  const totalCount = (rawRows ?? []).length;

  // ── Bulk selection ────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const deleteLmp = useDeleteLmpProcess();
  const qc = useQueryClient();

  // Reset selection on filter / open changes
  useEffect(() => { setSelectedIds(new Set()); }, [search, statusFilter, open]);

  // Drop ids that are no longer in the filtered rows
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(rows.map((r: any) => r.id));
      const next = new Set<string>();
      prev.forEach((id) => { if (visible.has(id)) next.add(id); });
      return next.size === prev.size ? prev : next;
    });
  }, [rows]);

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;
  const someSelected = selectedIds.size > 0 && !allSelected;
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(rows.map((r: any) => r.id)));
  };
  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const runBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => deleteLmp.mutateAsync(id)));
      toast.success(`Deleted ${ids.length} LMP${ids.length > 1 ? "s" : ""}`);
      setSelectedIds(new Set());
      setConfirmDelete(false);
    } catch (e: any) {
      toast.error(`Bulk delete failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkStatus = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !bulkStatus) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from("lmp_processes")
        .update({ status: bulkStatus as any })
        .in("id", ids);
      if (error) throw error;
      toast.success(`Updated status on ${ids.length} LMP${ids.length > 1 ? "s" : ""}`);
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-full-view"] });
      setEditOpen(false);
      setBulkStatus("");
    } catch (e: any) {
      toast.error(`Bulk update failed: ${e?.message ?? "Unknown error"}`);
    } finally {
      setBulkBusy(false);
    }
  };


  const { data: linkStatus } = useLmpSheetLinkStatus(
    (rawRows ?? []).map((r: any) => r.id as string),
  );

  const renderCell = (col: ColKey, r: any) => {
    const sheetStatus = linkStatus?.get(r.id) ?? (r.sync_source ? "synced" : "local");
    switch (col) {
      case "date": return <span className="text-[12px] text-n600">{formatDate(r.created_date)}</span>;
      case "company":
        return (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-n900">
            {r.company || "—"}
            {sheetStatus === "synced" && r.sync_source && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <SheetIcon className="h-3 w-3 text-emerald-600" />
                </TooltipTrigger>
                <TooltipContent>Synced with Sheet</TooltipContent>
              </Tooltip>
            )}
            {sheetStatus === "pending" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <AlertTriangle className="h-3 w-3 text-amber-600" />
                </TooltipTrigger>
                <TooltipContent>Sheet sync pending · last write hasn't landed</TooltipContent>
              </Tooltip>
            )}
          </span>
        );
      case "role": return <span className="text-[13px] text-n700">{r.role || "—"}</span>;
      case "domain": return <DomainPill value={r.domain_raw ? domainDisplay(r.domain_raw) : null} />;
      case "status": return <StatusBadge value={r.status} />;
      case "type": return <TypePill value={r.type} />;
      case "daily_progress":
        return <DailyProgressCell text={r.latest_daily_progress} count={r.daily_log_count} />;
      case "prep_doc_shared": return <CheckCell value={!!r.checklist_prep_doc_shared} />;
      case "mentor_aligned": return <CheckCell value={!!r.checklist_mentor_aligned} />;
      case "assignment_review": return <CheckCell value={!!r.checklist_assignment_review} />;
      case "one_to_one_mock": return <CheckCell value={!!r.checklist_one_to_one_mock} />;
      case "next_progress_date":
        return <span className="text-[12px] text-n600">{formatDate(r.next_progress_date)}</span>;
      case "next_progress_type":
        return <span className="text-[12px] text-n500">{r.next_progress_type || "—"}</span>;
      // Pool — candidates not yet in any interview round
      case "pool_num": return <CountCell count={Number(r.pool_count) || 0} lmpId={r.id} round="pool" />;
      case "pool_names": return <span className="text-[12px] text-n700 truncate block max-w-[160px]" title={r.pool_names || ""}>{r.pool_names || "—"}</span>;
      // R1
      case "r1_num": return <CountCell count={Number(r.r1_count) || 0} lmpId={r.id} round="r1" />;
      case "r1_names": return <span className="text-[12px] text-n700 truncate block max-w-[160px]" title={r.r1_names || ""}>{r.r1_names || "—"}</span>;
      // R2
      case "r2_num": return <CountCell count={Number(r.r2_count) || 0} lmpId={r.id} round="r2" />;
      case "r2_names": return <span className="text-[12px] text-n700 truncate block max-w-[160px]" title={r.r2_names || ""}>{r.r2_names || "—"}</span>;
      // R3
      case "r3_num": return <CountCell count={Number(r.r3_count) || 0} lmpId={r.id} round="r3" />;
      case "r3_names": return <span className="text-[12px] text-n700 truncate block max-w-[160px]" title={r.r3_names || ""}>{r.r3_names || "—"}</span>;
      // Final converted
      case "final_convert_num": return <CountCell count={Number(r.converted_count) || 0} lmpId={r.id} round="converted" />;
      case "convert_names": return <span className="text-[12px] text-n700 truncate block max-w-[180px]" title={r.converted_names || ""}>{r.converted_names || "—"}</span>;
      case "prep_doc_link": return <LinkIconCell href={r.prep_doc} label="Prep doc" icon={Paperclip} />;
      case "prep_poc": return <PocAvatarsCell names={r.prep_poc_names} />;
      case "support_poc": return <PocAvatarsCell names={r.support_poc_names} />;
      case "outreach_poc": return <PocAvatarsCell names={r.outreach_poc_names} />;
      case "closing_date":
        return r.closing_date
          ? <span className="text-[12px] text-n600">{formatDate(r.closing_date)}</span>
          : <span className="text-n400">—</span>;
      case "mentor_selected":
        return <span className="text-[12px] text-n700">{r.mentor_selected || r.mentor_name || "—"}</span>;
      case "mentor_rating":
        return r.mentor_feedback_avg && Number(r.mentor_feedback_avg) > 0
          ? <span className="inline-flex items-center gap-0.5 text-[12px] text-amber-600"><Star className="h-3 w-3 fill-amber-400 stroke-amber-500" />{Number(r.mentor_feedback_avg).toFixed(1)}</span>
          : <span className="text-n400">—</span>;
      case "feedback_by_outreach":
        return <span className="text-[12px] text-n700 truncate block max-w-[220px]" title={r.feedback_by_outreach || ""}>{r.feedback_by_outreach || "—"}</span>;
      case "comment": return <span className="text-[12px] text-n700 truncate block max-w-[220px]" title={r.comments || ""}>{r.comments || "—"}</span>;
      case "lmp_code":
        return <span className="text-[12px] font-mono text-n700 whitespace-nowrap">{r.lmp_code || "—"}</span>;
    }
  };

  return (
    <TooltipProvider delayDuration={150}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[96vw] w-[96vw] max-h-[88vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-n200">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <DialogTitle className="text-[18px] font-medium text-n900">
                  All LMP Processes{" "}
                  <span className="text-n500 text-[14px] font-normal">
                    · {rows.length} of {totalCount}
                  </span>
                </DialogTitle>
                <DialogDescription className="text-[12px] text-n500">
                  Live from lmp_processes · click any row to open the LMP detail view
                </DialogDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 mr-8 text-[12px]"
                onClick={() => {
                  onOpenChange(false);
                  navigate("/lmp");
                }}
              >
                Open Last Mile Prep board →
              </Button>
            </div>
          </DialogHeader>


          <div className="px-6 py-3 border-b border-n100 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-n400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, role, POC, domain…"
                className="pl-8 h-9 text-[13px]"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[170px] text-[13px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger className="h-9 w-[180px] text-[13px]">
                <SelectValue placeholder="Domain" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Domains</SelectItem>
                {domainOptions.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
                <SelectItem value="Unmapped">Unmapped</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-[13px]">
                  <Settings2 className="h-3.5 w-3.5" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-2 max-h-80 overflow-auto" align="end">
                <div className="text-[11px] font-medium text-n500 uppercase px-2 py-1">Show columns</div>
                {COLUMNS.map((c) => (
                  <label
                    key={c.key}
                    className="flex items-center gap-2 px-2 py-1.5 text-[13px] text-n700 hover:bg-n50 rounded cursor-pointer"
                  >
                    <Checkbox
                      checked={visibility[c.key]}
                      onCheckedChange={(v) =>
                        setVisibility((prev) => ({ ...prev, [c.key]: !!v }))
                      }
                    />
                    {c.label}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {!readOnly && selectedIds.size > 0 && (
            <div className="px-6 py-2 border-b border-n200 bg-orange-50/60 flex items-center gap-3">
              <span className="text-[13px] font-medium text-n800">
                {selectedIds.size} selected
              </span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[12px] text-n600 hover:text-n900 inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
              <div className="flex-1" />
              <Popover open={editOpen} onOpenChange={setEditOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12px]">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 p-3 space-y-3">
                  <div className="text-[12px] font-medium text-n700">Set status for {selectedIds.size} LMP{selectedIds.size > 1 ? "s" : ""}</div>
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger className="h-9 text-[13px]">
                      <SelectValue placeholder="Choose status…" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_FILTER_OPTIONS.filter((s) => s !== "All").map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-8" onClick={() => setEditOpen(false)}>Cancel</Button>
                    <Button size="sm" className="h-8" disabled={!bulkStatus || bulkBusy} onClick={runBulkStatus}>
                      {bulkBusy ? "Updating…" : "Apply"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-[12px] text-coral-700 border-coral-200 hover:bg-coral-50"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          )}

          <div className="flex-1 overflow-auto px-6 pt-3 pb-6">
            {isLoading ? (
              <div className="p-10 text-center text-n500 text-[13px]">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-n500 text-[13px]">No LMP processes found</div>
            ) : (
              <div className="rounded-lg border border-n200 w-max min-w-full">
                <table className="border-separate border-spacing-0 w-max min-w-full">

                  <thead className="bg-n50 sticky top-0 z-20">
                    <tr>
                      <th
                        className="w-[44px] px-3 py-2 border-b border-n200 bg-n50 sticky left-0 z-30"
                      >
                        <Checkbox
                          checked={allSelected ? true : someSelected ? "indeterminate" : false}
                          onCheckedChange={() => toggleAll()}
                          aria-label="Select all"
                        />
                      </th>
                      {visibleCols.map((c) => (
                        <th
                          key={c.key}
                          className={cn(
                            "px-3 py-2 text-[12px] font-medium text-n600 whitespace-nowrap border-b border-n200 bg-n50",
                            c.minW,
                            c.align === "center" ? "text-center" : "text-left",
                            c.key === "company" && "sticky left-[44px] z-30",
                          )}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const checked = selectedIds.has(r.id);
                      return (
                        <tr
                          key={r.id}
                          onClick={() => {
                            onOpenChange(false);
                            navigate(`/lmp/${r.id}`);
                          }}
                          className={cn("group cursor-pointer", checked && "bg-orange-50/40")}
                        >
                          <td
                            onClick={(e) => e.stopPropagation()}
                            className={cn(
                              "w-[44px] px-3 py-2.5 border-b border-n100 align-middle bg-card sticky left-0 z-10",
                              checked && "bg-orange-50/60",
                            )}
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleOne(r.id)}
                              aria-label={`Select ${r.company ?? "row"}`}
                            />
                          </td>
                          {visibleCols.map((c) => (
                            <td
                              key={c.key}
                              className={cn(
                                "px-3 py-2.5 border-b border-n100 align-middle bg-card group-hover:bg-orange-50/50",
                                c.minW,
                                c.align === "center" ? "text-center" : "text-left",
                                c.key === "company" && "sticky left-[44px] z-10",
                                checked && "bg-orange-50/40",
                              )}
                            >
                              {renderCell(c.key, r)}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!readOnly && confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} LMP{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected processes from the database and queue a sheet sync to delete them from the tracker. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={bulkBusy}
              onClick={(e) => { e.preventDefault(); runBulkDelete(); }}
              className="bg-coral-600 hover:bg-coral-700 text-white"
            >
              {bulkBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  );
}
