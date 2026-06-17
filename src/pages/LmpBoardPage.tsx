import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, LayoutList, Loader2, DatabaseZap, UserX, FilterX, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";
import { canPerform } from "@/lib/permissions";
import { type LmpStatus } from "@/types/lmp";
import { useLmpRows, useLmpMutation } from "@/lib/sheets/hooks";
import { useLmpCandidateCounts } from "@/lib/hooks/useDbData";
import { OutreachFeedbackModal } from "@/components/lmp/OutreachFeedbackModal";
import { LmpKpiStrip } from "@/components/lmp/LmpKpiStrip";
import { LmpFilterBar, EMPTY_LMP_FILTERS, type LmpFilters } from "@/components/lmp/LmpFilterBar";
import { LmpKanban } from "@/components/lmp/LmpKanban";
import { LmpCardList, type SortState } from "@/components/lmp/LmpCardList";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { type LmpBoardScope } from "@/lib/lmpViewingContext";
import { isUserOperationalPoc } from "@/lib/lmpViewingContext";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { LmpRecord } from "@/lib/lmpTypes";

/**
 * Resolve which records fall inside the selected board scope.
 *
 * Self scope  — records where the effective user is a Prep or Support POC
 *               (uses pocProfileId UUID when available, name-based fallback for legacy).
 * All scope   — all records (admin/allocator only).
 * POC scope   — records where the given poc_profiles.id appears in activePocLmpIdsMap.
 */
function resolveLmpBoardScope(
  records: LmpRecord[],
  scope: LmpBoardScope,
  effectivePocId: string | null,
  effectivePocName: string,
  activePocLmpIdsMap: Map<string, Set<string>>,
): LmpRecord[] {
  if (scope.kind === "all") return records;
  if (scope.kind === "self") {
    return records.filter((r) => isUserOperationalPoc(r, effectivePocName, effectivePocId));
  }
  // poc scope — use activePocLmpIdsMap (active links only)
  const allowedIds = activePocLmpIdsMap.get(scope.pocId);
  if (!allowedIds) return [];
  return records.filter((r) => allowedIds.has(r.id));
}

/**
 * Apply domain / status / text / overdue filters on top of a pre-scoped list.
 * Does NOT touch board scope — clearing filters never changes scope.
 */
function applyBoardFilters(
  records: LmpRecord[],
  filters: LmpFilters,
  overdueOnly: boolean,
): LmpRecord[] {
  const q = filters.q.trim().toLowerCase();
  const today = new Date(new Date().toDateString());
  return records.filter((r) => {
    if (filters.domain && r.domain !== filters.domain) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (overdueOnly) {
      if (!r.nextExpectedProgress) return false;
      const d = new Date(r.nextExpectedProgress);
      if (isNaN(d.getTime()) || d >= today) return false;
    }
    if (q) {
      const hay = `${r.role} ${r.company} ${r.pocs.map((p) => p.name).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export default function LmpBoardPage() {
  const { role, user } = useRole();
  const canEdit = canPerform(role, "edit_lmp");

  const { selectOptions: prepPocOptions, activePocLmpIdsMap } = useEligiblePrepPocs();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = searchParams.get("view") === "kanban" ? "kanban" : "cards";
  const [view, setView] = useState<"kanban" | "cards">(initialView);

  // DB-first: keep all `lmp_processes` and `lmp_candidates` queries fresh
  // via Supabase Realtime instead of polling Google Sheets.
  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();

  // Live data from DB (parsed into LmpRecord shape via useLmpRows).
  const { data: rawRecords = [], isLoading, isError, error } = useLmpRows();
  const { update: updateMutation } = useLmpMutation();

  // DB candidate counts (single source of truth — sheet column ignored).
  const { data: candidateCounts = {} } = useLmpCandidateCounts();

  const records = useMemo(() => {
    return rawRecords.map((r) => {
      const dbCount = r.id ? (candidateCounts[r.id] || 0) : 0;
      return dbCount > 0 ? { ...r, candidates: dbCount } : r;
    });
  }, [rawRecords, candidateCounts]);

  useEffect(() => {
    const v = searchParams.get("view");
    if (v === "cards" || v === "kanban") setView(v);
  }, [searchParams]);

  const handleViewChange = (v: "kanban" | "cards") => {
    setView(v);
    const next = new URLSearchParams(searchParams);
    if (v === "cards") next.delete("view");
    else next.set("view", v);
    setSearchParams(next, { replace: true });
  };

  const [filters, setFilters] = useState<LmpFilters>(EMPTY_LMP_FILTERS);
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "age", dir: "asc" });

  // Board scope — default to "self" for all roles including admin/allocator.
  // Clearing filters must NOT change scope (they are separate states).
  const [scope, setScope] = useState<LmpBoardScope>({ kind: "self" });

  const canSeeAll = role === "admin" || role === "allocator";

  // Effective identity for self-scope filtering
  const effectivePocId = user.pocProfileId ?? null;
  const effectivePocName = user.pocProfileName ?? user.name ?? "";

  // 1. Apply board scope to get the scoped records
  const scopedRecords = useMemo(
    () =>
      resolveLmpBoardScope(
        records,
        scope,
        effectivePocId,
        effectivePocName,
        activePocLmpIdsMap,
      ),
    [records, scope, effectivePocId, effectivePocName, activePocLmpIdsMap],
  );

  // 2. Apply domain / status / text filters on top
  const filtered = useMemo(
    () => applyBoardFilters(scopedRecords, filters, overdueOnly),
    [scopedRecords, filters, overdueOnly],
  );

  const [feedbackLmpId, setFeedbackLmpId] = useState<string | null>(null);

  const onChangeStatus = (id: string, status: LmpStatus, reason: string) => {
    updateMutation.mutate(
      { id, patch: { status, reason: reason || undefined, lastActivity: `Just now — Status updated` } },
      {
        onSuccess: () => {
          toast.success("Status updated");
          if (status === "not-converted") setFeedbackLmpId(id);
        },
        onError: () => toast.error("Failed to update status"),
      },
    );
  };

  // Derive the selected POC name for scoped empty states
  const selectedPocName = scope.kind === "poc" ? scope.pocName : undefined;

  // Scope selector value: "__self__" | "__all__" | <uuid>
  const scopeSelectorValue =
    scope.kind === "self" ? "__self__" :
    scope.kind === "all" ? "__all__" :
    scope.pocId;

  const handleScopeChange = (value: string) => {
    if (value === "__self__") {
      setScope({ kind: "self" });
    } else if (value === "__all__") {
      setScope({ kind: "all" });
    } else {
      // UUID — find the name from prepPocOptions
      const opt = prepPocOptions.find((o) => o.value === value);
      setScope({ kind: "poc", pocId: value, pocName: opt?.label ?? value });
    }
  };

  // LmpKpiStrip needs a "target" string for legacy compatibility
  const kpiTarget =
    scope.kind === "self" ? "me" :
    scope.kind === "all" ? "all" :
    scope.pocName;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Last Mile Prep"
        subtitle="Process-level placement tracking across all stages"
      />

      {/* Board scope selector — admin / allocator only */}
      {canSeeAll && (
        <div className="flex items-center gap-2">
          <label htmlFor="board-scope" className="text-[12px] text-n500 dark:text-d-muted font-medium shrink-0">
            Viewing:
          </label>
          <select
            id="board-scope"
            value={scopeSelectorValue}
            onChange={(e) => handleScopeChange(e.target.value)}
            className="h-8 rounded-md border border-n200 dark:border-d-border bg-white dark:bg-d-surface px-2 text-[12.5px] text-n800 dark:text-d-text focus:outline-none focus:ring-1 focus:ring-orange-500"
          >
            <option value="__self__">My LMPs</option>
            <option value="__all__">All POCs</option>
            {prepPocOptions
              .filter((o) => o.value !== "All")
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
          </select>
        </div>
      )}

      {isError && (
        <div className="rounded-lg border border-coral-200 bg-coral-50 px-4 py-3 text-[13px] text-coral-700">
          Failed to load LMP data: {error instanceof Error ? error.message : "Unknown error"}
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-n400" />
          <span className="ml-3 text-n500 text-sm">Loading LMP processes…</span>
        </div>
      ) : (
        <>
          <LmpKpiStrip
            records={filtered}
            totalRecords={records.length}
            target={kpiTarget}
            overdueActive={overdueOnly}
            onOverdueClick={() => setOverdueOnly((v) => !v)}
          />

          <LmpFilterBar
            value={filters}
            onChange={setFilters}
            records={records}
            role={role}
            prepPocOptions={[]}
            trailing={<ViewToggle value={view} onChange={handleViewChange} />}
          />

          {filtered.length === 0 ? (
            <BoardEmptyState
              scope={scope}
              selectedPocName={selectedPocName}
              scopedRecordCount={scopedRecords.length}
              filteredRecordCount={filtered.length}
            />
          ) : view === "kanban" ? (
            <LmpKanban records={filtered} canDrag={canEdit} onChangeStatus={onChangeStatus} />
          ) : (
            <LmpCardList
              records={filtered}
              onChangeStatus={(id, status) => onChangeStatus(id, status, "")}
              sort={sort}
              onSortChange={setSort}
            />
          )}
        </>
      )}

      {feedbackLmpId && (
        <OutreachFeedbackModal
          open={!!feedbackLmpId}
          lmpId={feedbackLmpId}
          onClose={() => setFeedbackLmpId(null)}
        />
      )}
    </div>
  );
}



/* ─── View / Empty helpers ─── */


function ViewToggle({ value, onChange }: { value: "kanban" | "cards"; onChange: (v: "kanban" | "cards") => void }) {
  return (
    <div className="inline-flex h-9 rounded-lg border border-n200 bg-n50/60 p-1 shadow-sm">
      {([
        { v: "cards" as const,  icon: LayoutList, label: "Cards"  },
        { v: "kanban" as const, icon: LayoutGrid, label: "Kanban" },
      ]).map((opt) => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className={cn(
            "h-full px-3 rounded-md inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors",
            value === opt.v
              ? "bg-orange-500 text-white shadow-sm"
              : "text-n600 hover:text-n900 hover:bg-n100",
          )}
        >
          <opt.icon className="h-3.5 w-3.5" /> {opt.label}
        </button>
      ))}
    </div>
  );
}

function BoardEmptyState({
  scope,
  selectedPocName,
  scopedRecordCount,
  filteredRecordCount,
}: {
  scope: LmpBoardScope;
  selectedPocName?: string;
  scopedRecordCount: number;
  filteredRecordCount: number;
}) {
  // No data loaded at all
  if (scopedRecordCount === 0 && filteredRecordCount === 0 && scope.kind !== "poc" && scope.kind !== "all") {
    // For self scope with no scoped records, check if it's because of no assignments
    // vs no data loaded — we use records.length === 0 to detect "no data loaded" upstream,
    // but here we just check scopedRecordCount.
  }

  if (scope.kind === "self") {
    if (scopedRecordCount === 0) {
      return (
        <EmptyState
          icon={UserX}
          title="No LMPs assigned to you yet."
          description="Ask an admin to assign LMPs, or switch to a different scope."
        />
      );
    }
    return (
      <EmptyState
        icon={FilterX}
        title="No LMP records match the current filters."
        description="Try clearing filters or broadening your search."
      />
    );
  }

  if (scope.kind === "poc") {
    const name = selectedPocName ?? scope.pocName;
    if (scopedRecordCount === 0) {
      return (
        <EmptyState
          icon={UserX}
          title={`${name} currently has no active LMP assignments.`}
          description="They may have no prep/support links, or all links are historical."
        />
      );
    }
    return (
      <EmptyState
        icon={FilterX}
        title={`No LMPs for ${name} match the current filters.`}
        description="Try clearing filters or selecting a different scope."
      />
    );
  }

  // all scope
  if (scopedRecordCount === 0) {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="No LMP data loaded"
        description="Check Data Sources to ensure the Google Sheet is connected and synced."
      />
    );
  }
  return (
    <EmptyState
      icon={Inbox}
      title="No LMP records match the current filters."
      description="Try adjusting filters or broadening your search."
    />
  );
}
