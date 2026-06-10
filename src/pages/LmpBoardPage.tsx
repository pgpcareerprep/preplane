import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LayoutGrid, LayoutList, Loader2, DatabaseZap, UserX, FilterX, Inbox } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useIsViewingAsOther, useRole } from "@/lib/rolesContext";
import { canPerform } from "@/lib/permissions";
import { type LmpStatus } from "@/types/lmp";
import { useLmpRows, useLmpMutation } from "@/lib/sheets/hooks";
import { useLmpCandidateCounts, useLmpProcesses } from "@/lib/hooks/useDbData";
import { LmpKpiStrip } from "@/components/lmp/LmpKpiStrip";
import { LmpFilterBar, EMPTY_LMP_FILTERS, type LmpFilters } from "@/components/lmp/LmpFilterBar";
import { LmpKanban } from "@/components/lmp/LmpKanban";
import { LmpCardList, type SortState } from "@/components/lmp/LmpCardList";

import { useLmpViewing } from "@/lib/lmpViewingContext";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import type { ViewingTarget } from "@/lib/lmpViewingContext";

export default function LmpBoardPage() {
  const { role } = useRole();
  const isViewingAsOther = useIsViewingAsOther();
  const canEdit = !isViewingAsOther && canPerform(role, "edit_lmp");
  const { filterFor, target } = useLmpViewing();
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
  const { data: dbProcesses = [] } = useLmpProcesses();

  // Build company+role → uuid lookup so we can attach the live count to
  // each LmpRecord even when the sheet row hasn't been re-synced yet.
  const companyRoleToId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of dbProcesses as any[]) {
      const key = `${(p.company || "").trim().toLowerCase()}||${(p.role || "").trim().toLowerCase()}`;
      map[key] = p.id;
    }
    return map;
  }, [dbProcesses]);

  const records = useMemo(() => {
    return rawRecords.map((r) => {
      // Prefer DB count if we can resolve the row, else fall back to row id directly.
      const dbId =
        (r as any).id && candidateCounts[(r as any).id] !== undefined
          ? (r as any).id
          : companyRoleToId[`${r.company.trim().toLowerCase()}||${r.role.trim().toLowerCase()}`];
      const dbCount = dbId ? (candidateCounts[dbId] || 0) : 0;
      return dbCount > 0 ? { ...r, candidates: dbCount } : r;
    });
  }, [rawRecords, companyRoleToId, candidateCounts]);

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

  const filtered = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const today = new Date(new Date().toDateString());
    const result = records.filter((r) => {
      if (!filterFor(r)) return false;
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
    return result;
  }, [records, filters, filterFor, overdueOnly]);


  const onChangeStatus = (id: string, status: LmpStatus, reason: string) => {
    updateMutation.mutate({ id, patch: { status, reason: reason || undefined, lastActivity: `Just now — Status updated` } });
    toast.success(`Status updated`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Last Mile Prep"
        subtitle="Process-level placement tracking across all stages"
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
          <LmpKpiStrip records={filtered} totalRecords={records.length} target={target} overdueActive={overdueOnly} onOverdueClick={() => setOverdueOnly((v) => !v)} />

          <LmpFilterBar
            value={filters}
            onChange={setFilters}
            records={records}
            trailing={<ViewToggle value={view} onChange={handleViewChange} />}
          />

          {filtered.length === 0 ? (
            <BoardEmptyState recordCount={records.length} target={target} />
          ) : view === "kanban" ? (
            <LmpKanban records={filtered} canDrag={canEdit && target === "me"} onChangeStatus={onChangeStatus} />
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

function BoardEmptyState({ recordCount, target }: { recordCount: number; target: ViewingTarget }) {
  if (recordCount === 0) {
    return (
      <EmptyState
        icon={DatabaseZap}
        title="No LMP data loaded"
        description="Check Data Sources to ensure the Google Sheet is connected and synced."
      />
    );
  }
  if (target === "me") {
    return (
      <EmptyState
        icon={UserX}
        title="No LMPs assigned to you yet"
        description="Ask an admin to assign LMPs, or switch to 'All POCs' view."
      />
    );
  }
  if (target !== "all") {
    return (
      <EmptyState
        icon={FilterX}
        title={`${target} has no LMPs in current filter`}
        description="Try clearing filters or checking the sheet data."
      />
    );
  }
  return (
    <EmptyState
      icon={Inbox}
      title="No LMP records match your filters"
      description="Try adjusting filters or broadening your search."
    />
  );
}
