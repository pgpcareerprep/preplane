import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, LayoutList, Loader2, DatabaseZap, UserX, FilterX, Inbox, Download } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useViewer } from "@/lib/viewerContext";
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
import { type LmpBoardScope, isUserOperationalPoc, parseScopeFromParams, applyBoardScopeToParams } from "@/lib/lmpViewingContext";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { LmpRecord } from "@/lib/lmpTypes";
import { isProgressOverdue } from "@/lib/lmpOverdue";
import { exportLmpBoardCsv } from "@/lib/exportCsv";
import { useCohortProgramLmpScope } from "@/lib/hooks/useCohortProgramLmpScope";

/**
 * Resolve which records fall inside the selected board scope.
 *
 * Self scope — UUID-first: look up effectivePocId in activePocLmpIdsMap.
 *              Legacy fallback only when no UUID available: check prepPoc/supportPoc names.
 *              Outreach-only, allocator and adminOwner fields must NOT grant Self scope.
 * All scope  — all records (admin/allocator in normal mode only).
 * POC scope  — records where the given poc_profiles.id appears in activePocLmpIdsMap.
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

  // POC scope — active links first, then operational ownership on the record.
  const allowedIds = activePocLmpIdsMap.get(scope.pocId);
  if (allowedIds && allowedIds.size > 0) {
    return records.filter((r) => allowedIds.has(r.id));
  }
  return records.filter((r) => isUserOperationalPoc(r, scope.pocName, scope.pocId));
}

/**
 * Apply domain / status / text / overdue filters on top of a pre-scoped list.
 * Clearing filters never changes board scope.
 */
function applyBoardFilters(
  records: LmpRecord[],
  filters: LmpFilters,
  overdueOnly: boolean,
): LmpRecord[] {
  const q = filters.q.trim().toLowerCase();
  return records.filter((r) => {
    if (filters.domain && r.domain !== filters.domain) return false;
    if (filters.status && r.status !== filters.status) return false;
    if (overdueOnly && !isProgressOverdue(r.nextExpectedProgress, r.lastProgressUpdatedAt)) {
      return false;
    }
    if (q) {
      const hay = `${r.role} ${r.company} ${r.pocs.map((p) => p.name).join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export default function LmpBoardPage() {
  const {
    actorRole,
    effectiveUser,
    effectiveRole: _effectiveRole,
    effectivePocId,
    isViewAsActive,
    isReadOnly,
  } = useViewer();

  // canEdit: only when user has edit permission AND View As is not active
  const canEdit = canPerform(actorRole, "edit_lmp") && !isReadOnly;

  // Only admin/allocator in normal (non-View As) mode may change the board scope.
  const canChangeBoardScope =
    (actorRole === "admin" || actorRole === "allocator") && !isViewAsActive;

  const { selectOptions: prepPocOptions, activePocLmpIdsMap } = useEligiblePrepPocs();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialView = searchParams.get("view") === "kanban" ? "kanban" : "cards";
  const [view, setView] = useState<"kanban" | "cards">(initialView);

  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();

  const { data: rawRecords = [], isLoading, isError, error } = useLmpRows();
  const { update: updateMutation } = useLmpMutation();
  const { data: candidateCounts = {} } = useLmpCandidateCounts();

  const cohortProgramLmpScope = useCohortProgramLmpScope();

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

  const [scope, setScope] = useState<LmpBoardScope>(() =>
    parseScopeFromParams(searchParams),
  );

  useEffect(() => {
    setScope(parseScopeFromParams(searchParams));
  }, [searchParams]);

  // Auto-sync: when View As changes (or View As user changes), immediately
  // reset to Self scope and clear page-local filters so the new perspective
  // is not obscured by stale state from a different user.
  const prevViewAsSig = useRef<string | null>(null);
  useEffect(() => {
    const sig = isViewAsActive ? (effectivePocId ?? effectiveUser.email) : null;
    if (sig !== prevViewAsSig.current) {
      prevViewAsSig.current = sig;
      setFilters(EMPTY_LMP_FILTERS);
      setOverdueOnly(false);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        applyBoardScopeToParams(next, { kind: "self" });
        return next;
      }, { replace: true });
    }
  }, [isViewAsActive, effectivePocId, effectiveUser.email, setSearchParams]);

  // Effective identity for self-scope resolution.
  const effectivePocName = effectiveUser.pocProfileName ?? effectiveUser.name ?? "";

  // 1. Apply board scope.
  const scopedRecords = useMemo(
    () => {
      let rows = resolveLmpBoardScope(
        records,
        scope,
        effectivePocId,
        effectivePocName,
        activePocLmpIdsMap,
      );
      if (cohortProgramLmpScope) {
        rows = rows.filter((r) => cohortProgramLmpScope.has(r.id));
      }
      return rows;
    },
    [records, scope, effectivePocId, effectivePocName, activePocLmpIdsMap, cohortProgramLmpScope],
  );

  // 2. Apply domain / status / text filters on top.
  const filtered = useMemo(
    () => applyBoardFilters(scopedRecords, filters, overdueOnly),
    [scopedRecords, filters, overdueOnly],
  );

  const [feedbackLmpId, setFeedbackLmpId] = useState<string | null>(null);

  const onChangeStatus = (id: string, status: LmpStatus, reason: string) => {
    if (isReadOnly) return;
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

  // Derive names for empty states and labels.
  const selectedPocName = scope.kind === "poc" ? scope.pocName : undefined;
  const viewAsDisplayName = isViewAsActive ? (effectiveUser.pocProfileName ?? effectiveUser.name) : null;

  // Scope selector value: "__self__" | "__all__" | <uuid>
  const scopeSelectorValue =
    scope.kind === "self" ? "__self__" :
    scope.kind === "all" ? "__all__" :
    scope.pocId;

  const handleScopeChange = (value: string) => {
    const next = new URLSearchParams(searchParams);

    if (value === "__self__") {
      setScope({ kind: "self" });
      applyBoardScopeToParams(next, { kind: "self" });
    } else if (value === "__all__") {
      setScope({ kind: "all" });
      applyBoardScopeToParams(next, { kind: "all" });
    } else {
      const opt = prepPocOptions.find((o) => o.value === value);
      const pocName = opt?.label ?? value;
      setScope({ kind: "poc", pocId: value, pocName });
      applyBoardScopeToParams(next, { kind: "poc", pocId: value, pocName });
    }

    setSearchParams(next, { replace: true });
  };

  const restoreToMyView = () => {
    const next = new URLSearchParams(searchParams);
    applyBoardScopeToParams(next, { kind: "self" });
    setScope({ kind: "self" });
    setSearchParams(next, { replace: true });
  };

  // KPI strip target string for legacy compatibility.
  const kpiTarget =
    scope.kind === "self" ? (viewAsDisplayName ?? "me") :
    scope.kind === "all" ? "all" :
    scope.pocName;

  // CSV export filename.
  const csvScope = isViewAsActive
    ? (viewAsDisplayName ?? "view-as")
    : scope.kind === "self" ? "my-lmps"
    : scope.kind === "all" ? "all-pocs"
    : scope.pocName;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Last Mile Prep"
        subtitle="Process-level placement tracking across all stages"
        right={
          <div className="flex items-center gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-n500 dark:text-d-muted font-medium shrink-0">
                Viewing:
              </span>

              {isViewAsActive ? (
                <span className="inline-flex items-center h-8 px-3 rounded-md border border-n200 dark:border-d-border bg-amber-50 dark:bg-amber-900/20 text-[12.5px] text-amber-800 dark:text-amber-200 font-medium">
                  {viewAsDisplayName}'s LMPs
                </span>
              ) : canChangeBoardScope ? (
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
              ) : (
                <span className="inline-flex items-center h-8 px-3 rounded-md border border-n200 dark:border-d-border bg-n50 dark:bg-d-surface text-[12.5px] text-n700 dark:text-d-text">
                  My LMPs
                </span>
              )}

              {canChangeBoardScope && scope.kind !== "self" && (
                <button
                  type="button"
                  onClick={restoreToMyView}
                  className="h-8 px-3 rounded-md border border-n200 dark:border-d-border bg-white dark:bg-d-surface text-[12px] font-medium text-n700 dark:text-d-text hover:bg-n50 dark:hover:bg-d-surface-2"
                >
                  Restore to my view
                </button>
              )}
            </div>

            <button
              type="button"
              disabled={filtered.length === 0}
              onClick={() => exportLmpBoardCsv(filtered, csvScope)}
              title={filtered.length === 0 ? "No records to export" : `Export ${filtered.length} records as CSV`}
              className={cn(
                "inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[12px] font-medium transition-colors",
                filtered.length === 0
                  ? "border-n200 bg-n50 text-n400 cursor-not-allowed dark:border-d-border dark:bg-d-surface dark:text-d-muted"
                  : "border-n200 bg-white text-n700 hover:bg-n50 hover:border-n300 dark:border-d-border dark:bg-d-surface dark:text-d-text dark:hover:bg-d-surface-2",
              )}
            >
              <Download className="h-3.5 w-3.5" />
              Export as CSV
            </button>
          </div>
        }
      />

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
            role={actorRole}
            prepPocOptions={[]}
            trailing={<ViewToggle value={view} onChange={handleViewChange} />}
          />

          {filtered.length === 0 ? (
            <BoardEmptyState
              scope={scope}
              selectedPocName={selectedPocName}
              scopedRecordCount={scopedRecords.length}
              filteredRecordCount={filtered.length}
              viewAsName={viewAsDisplayName ?? undefined}
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
    <div className="inline-flex h-9 rounded-control border border-n200 bg-n50/60 p-1 shadow-sm">
      {([
        { v: "cards" as const,  icon: LayoutList, label: "Cards"  },
        { v: "kanban" as const, icon: LayoutGrid, label: "Kanban" },
      ]).map((opt) => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className={cn(
            "h-full px-3 rounded-sm inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors",
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
  viewAsName,
}: {
  scope: LmpBoardScope;
  selectedPocName?: string;
  scopedRecordCount: number;
  filteredRecordCount: number;
  viewAsName?: string;
}) {
  // Derive the display name: during View As use effectiveUser name.
  const selfLabel = viewAsName ?? "you";

  if (scope.kind === "self") {
    if (scopedRecordCount === 0) {
      return (
        <EmptyState
          icon={UserX}
          title={
            viewAsName
              ? `${viewAsName} currently has no active LMP assignments.`
              : "No LMPs assigned to you yet."
          }
          description={
            viewAsName
              ? "They have no active Prep or Support assignments."
              : "Ask an admin to assign LMPs, or switch to a different scope."
          }
        />
      );
    }
    return (
      <EmptyState
        icon={FilterX}
        title={
          viewAsName
            ? `No LMPs for ${viewAsName} match the current filters.`
            : "No LMP records match the current filters."
        }
        description={`Try clearing filters or broadening your search. (${selfLabel} has ${scopedRecordCount} LMP${scopedRecordCount !== 1 ? "s" : ""} total)`}
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
