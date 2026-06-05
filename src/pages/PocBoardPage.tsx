import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Loader2, Inbox } from "lucide-react";
import { useLmpRows, useLmpMutation } from "@/lib/sheets/hooks";
import { useLmpCandidateCounts, useLmpProcesses } from "@/lib/hooks/useDbData";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { LmpKpiStrip } from "@/components/lmp/LmpKpiStrip";
import { LmpCardList, type SortState } from "@/components/lmp/LmpCardList";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import type { LmpStatus } from "@/types/lmp";

export default function PocBoardPage() {
  const { pocKey = "" } = useParams();
  const pocName = decodeURIComponent(pocKey);

  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();

  const { data: rawRecords = [], isLoading } = useLmpRows();
  const { update: updateMutation } = useLmpMutation();
  const { data: candidateCounts = {} } = useLmpCandidateCounts();
  const { data: dbProcesses = [] } = useLmpProcesses();

  // Resolve a possible UUID match for the route param against poc ids on processes.
  const matchByName = (name?: string) =>
    !!name && name.trim().toLowerCase() === pocName.trim().toLowerCase();

  const records = useMemo(() => {
    const companyRoleToId: Record<string, string> = {};
    for (const p of dbProcesses as any[]) {
      const k = `${(p.company || "").trim().toLowerCase()}||${(p.role || "").trim().toLowerCase()}`;
      companyRoleToId[k] = p.id;
    }
    return rawRecords.map((r) => {
      const dbId =
        (r as any).id && candidateCounts[(r as any).id] !== undefined
          ? (r as any).id
          : companyRoleToId[`${r.company.trim().toLowerCase()}||${r.role.trim().toLowerCase()}`];
      const dbCount = dbId ? candidateCounts[dbId] || 0 : 0;
      return dbCount > 0 ? { ...r, candidates: dbCount } : r;
    });
  }, [rawRecords, dbProcesses, candidateCounts]);

  const filtered = useMemo(
    () =>
      records.filter((r) =>
        r.pocs.some((p) => matchByName(p.name)) ||
        matchByName((r as any).prepPoc?.name) ||
        matchByName((r as any).supportPoc?.name) ||
        matchByName((r as any).outreachPoc?.name),
      ),
    [records, pocName],
  );

  const [sort, setSort] = useState<SortState>({ key: "age", dir: "asc" });

  const onChangeStatus = (id: string, status: LmpStatus) => {
    updateMutation.mutate({ id, patch: { status, lastActivity: "Just now — Status updated" } });
    toast.success("Status updated");
  };

  return (
    <div className="space-y-6">
      <Link
        to="/lmp"
        className="inline-flex items-center gap-1 text-[12px] text-n500 hover:text-n800"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back to LMP Board
      </Link>

      <div>
        <p className="text-[11px] uppercase tracking-wider text-n400 font-medium">POC · LMP BOARD</p>
        <h2 className="mt-1 text-[28px] md:text-[32px] leading-[1.2] font-bold tracking-[-0.5px] text-n900">
          {pocName}
        </h2>
        <p className="mt-1 text-[14px] text-n500">
          All LMP processes where <span className="font-medium">{pocName}</span> is mapped as Prep, Support, or Outreach POC.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-n400" />
          <span className="ml-3 text-n500 text-sm">Loading LMP processes…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={`No LMPs mapped to ${pocName} yet`}
          description="Once processes are assigned to this POC, they'll appear here automatically."
        />
      ) : (
        <>
          <LmpKpiStrip records={filtered} totalRecords={records.length} target={pocName as any} />
          <LmpCardList
            records={filtered}
            onChangeStatus={(id, status) => onChangeStatus(id, status)}
            sort={sort}
            onSortChange={setSort}
          />
        </>
      )}
    </div>
  );
}
