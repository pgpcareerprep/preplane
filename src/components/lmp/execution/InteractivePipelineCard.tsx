import { useMemo, useState } from "react";
import { Settings2, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LmpRecord } from "@/lib/lmpTypes";
import { AddCandidatesModal } from "@/components/lmp/detail/AddCandidatesModal";
import { RoundConfigModal } from "@/components/lmp/detail/RoundConfigModal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DEFAULT_ROUNDS, type Round } from "@/lib/lmpProcessMutations";
import { useAddLmpCandidates, useLmpCandidates, useDeleteLmpCandidate, useUpdateLmpCandidateStage } from "@/lib/hooks/useDbData";
import { useDbLmpId } from "@/lib/hooks/useDbLmpId";
import { useLmpRounds, useSaveLmpRounds } from "@/lib/hooks/useLmpRounds";
import { resolveStageToRoundId, sheetIndexToRoundId } from "@/lib/pipelineStage";
import { toast } from "sonner";

/**
 * Parse a sheet cell that may contain comma/newline-separated names or a number.
 * Returns an array of name strings.
 */
function parseNames(raw?: string): string[] {
  if (!raw || !raw.trim()) return [];
  // Split on commas, newlines, semicolons
  return raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean);
}

function initialsFrom(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

const CANDIDATE_COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-purple-200 text-purple-600",
  "bg-blue-200 text-blue-600",
  "bg-pink-200 text-pink-600",
  "bg-sage-200 text-sage-600",
  "bg-yellow-200 text-yellow-600",
  "bg-cyan-200 text-cyan-600",
];

type PipelineItem = {
  name: string;
  id?: string; // DB candidate id when source === "db"
  source: "sheet" | "db";
};

type PipelineColumn = {
  id: string;
  label: string;
  items: PipelineItem[];
};

function buildPipelineFromLmp(
  lmp: LmpRecord | undefined,
  rounds: Round[],
  dbCandidates: Array<{ id?: string; student_name: string; pipeline_stage?: string | null }> = [],
): PipelineColumn[] {
  if (!lmp && dbCandidates.length === 0) return [];

  // Sheet-derived names by their sheet position (R1=0, R2=1, R3=2, Convert=3)
  const sheetByIdx: string[][] = [
    parseNames(lmp?.r1Shortlisted),
    parseNames(lmp?.r2Shortlisted),
    parseNames(lmp?.r3Shortlisted),
    parseNames(lmp?.convertNames || lmp?.finalConvert),
  ];

  // Bucket each sheet name into the configured round id at that index
  const itemsByRoundId: Record<string, PipelineItem[]> = { pool: [] };
  for (const r of rounds) itemsByRoundId[r.id] = [];
  ([0, 1, 2, 3] as const).forEach((idx) => {
    const targetId = sheetIndexToRoundId(idx, rounds);
    if (!itemsByRoundId[targetId]) itemsByRoundId[targetId] = [];
    for (const name of sheetByIdx[idx]) {
      itemsByRoundId[targetId].push({ name, source: "sheet" });
    }
  });

  // Bucket DB candidates using the configured rounds
  for (const c of dbCandidates) {
    const name = (c.student_name || "").trim();
    if (!name) continue;
    const target = resolveStageToRoundId(c.pipeline_stage, rounds);
    if (!itemsByRoundId[target]) itemsByRoundId[target] = [];
    itemsByRoundId[target].push({ name, id: c.id, source: "db" });
  }

  // Dedupe per column (case-insensitive). Prefer DB entry over sheet so it stays deletable.
  const dedupe = (arr: PipelineItem[]) => {
    const byKey = new Map<string, PipelineItem>();
    for (const item of arr) {
      const k = item.name.toLowerCase();
      const existing = byKey.get(k);
      if (!existing) {
        byKey.set(k, item);
      } else if (existing.source === "sheet" && item.source === "db") {
        byKey.set(k, item);
      }
    }
    return Array.from(byKey.values());
  };

  const cols: PipelineColumn[] = [
    { id: "pool", label: "Pool — Newly added", items: dedupe(itemsByRoundId.pool || []) },
    ...rounds.map((r) => ({
      id: r.id,
      label: r.name,
      items: dedupe(itemsByRoundId[r.id] || []),
    })),
  ];
  return cols;
}

/**
 * Pipeline card that displays real round data from the LMP sheet record.
 * Shows candidate names parsed from sheet columns (R1/R2/R3 Shortlisted, Convert Names).
 */
export function InteractivePipelineCard({ lmpId, lmp, readOnly = false }: { lmpId: string; lmp?: LmpRecord; readOnly?: boolean }) {
  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const addMutation = useAddLmpCandidates();
  const deleteMutation = useDeleteLmpCandidate();
  const stageMutation = useUpdateLmpCandidateStage();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const dbLmpId = useDbLmpId({ id: lmp?.id, company: lmp?.company, role: lmp?.role });

  const { data: rounds = DEFAULT_ROUNDS } = useLmpRounds(dbLmpId);
  const saveRoundsMutation = useSaveLmpRounds(dbLmpId);
  const { data: existingCandidates = [] } = useLmpCandidates(dbLmpId);
  const existingStudentIds = useMemo(
    () => (existingCandidates as any[]).map((c) => c.student_id).filter(Boolean) as string[],
    [existingCandidates],
  );

  const columns = useMemo(
    () => buildPipelineFromLmp(lmp, rounds, existingCandidates as any[]),
    [lmp, rounds, existingCandidates],
  );
  const hasAnyData = columns.some((c) => c.items.length > 0);

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h4 className="text-[14px] font-semibold text-n800">Pipeline</h4>
          <span className="text-[11px] text-n400 italic">Live · DB</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAddOpen(true)}
            disabled={readOnly}
            title={readOnly ? "Read-only — you are not a POC on this LMP" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12.5px] font-medium px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-500"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add Candidate
          </button>
          <button
            onClick={() => setConfigOpen(true)}
            disabled={readOnly}
            title={readOnly ? "Read-only — you are not a POC on this LMP" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-card border border-n300 hover:bg-n100 text-n800 text-[12.5px] font-medium px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
          >
            <Settings2 className="h-3.5 w-3.5" /> Configure Rounds
          </button>

        </div>
      </div>

      {!hasAnyData ? (
        <div className="rounded-xl border border-n200 bg-n50/50 py-10 grid place-items-center">
          <p className="text-[12.5px] text-n400 italic">
            No pipeline data yet. Round columns (R1/R2/R3 Shortlisted) are empty in the sheet.
          </p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
          {columns.map((col) => (
            <div
              key={col.id}
              className="shrink-0 w-[260px] rounded-xl border border-n200 bg-n50/50 flex flex-col"
            >
              <div className="flex items-center justify-between px-3 py-2 border-b border-n200">
                <span className="text-[11.5px] uppercase tracking-[0.5px] text-n600 font-semibold truncate">
                  {col.label}
                </span>
                <span className="text-[11px] text-n500 tabular-nums bg-card border border-n200 rounded-full px-1.5 min-w-[20px] text-center">
                  {col.items.length}
                </span>
              </div>
              <div className="p-2 space-y-1.5 min-h-[80px]">
                {col.items.length === 0 ? (
                  <div className="h-[60px] grid place-items-center text-[11px] italic text-n400">
                    —
                  </div>
                ) : (
                  col.items.map((item, i) => (
                    <div
                      key={`${col.id}-${i}-${item.name}`}
                      className="group w-full flex items-center gap-2 rounded-md border border-n200 bg-card px-2 py-1.5 shadow-sm"
                    >
                      <div
                        className={cn(
                          "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                          CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
                        )}
                      >
                        {initialsFrom(item.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] text-n800 font-medium truncate">{item.name}</div>
                      </div>
                      {item.source === "db" && item.id ? (
                        <>
                          <select
                            value={col.id}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === col.id || !dbLmpId) return;
                              stageMutation.mutate({ id: item.id!, pipeline_stage: next, lmp_id: dbLmpId });
                            }}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-6 text-[11px] rounded border border-n200 bg-card text-n700 px-1 shrink-0"
                            aria-label={`Move ${item.name} to another round`}
                            title="Move to round"
                          >
                            <option value="pool">Pool</option>
                            {rounds.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => setPendingDelete({ id: item.id!, name: item.name })}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity h-5 w-5 grid place-items-center rounded text-n400 hover:text-coral-600 hover:bg-coral-50 shrink-0"
                            aria-label={`Remove ${item.name}`}
                            title="Remove from this round"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <span
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] text-n400 italic shrink-0"
                          title="From sheet — edit in source"
                        >
                          sheet
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stage / progress from sheet */}
      {lmp?.stage && (
        <div className="mt-3 pt-3 border-t border-n200/70 flex items-center gap-2 text-[11.5px] text-n600">
          <span>Current Stage:</span>
          <span className="font-medium text-n800">{lmp.stage}</span>
        </div>
      )}

      <AddCandidatesModal
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={existingStudentIds}
        rounds={rounds}
        defaultRoundId="pool"
        onAdd={(newCandidates) => {
          if (newCandidates.length === 0) return;
          if (!dbLmpId) {
            toast.error("Couldn't link this LMP", {
              description: "This LMP isn't fully synced to the database yet. Try again in a moment.",
            });
            return;
          }
          addMutation.mutate(
            newCandidates.map(c => ({
              lmp_id: dbLmpId,
              student_name: c.name,
              student_id: c.studentId,
              pipeline_stage: c.roundId || "pool",
            }))
          );
        }}
      />

      <RoundConfigModal
        open={configOpen}
        onOpenChange={setConfigOpen}
        rounds={rounds}
        hasCandidates={hasAnyData}
        onSave={(rs) => saveRoundsMutation.mutate(rs)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete ? `Remove ${pendingDelete.name}?` : "Remove candidate?"}
        description="This unlinks the candidate from this LMP process. You can re-add them later."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteMutation.mutate({ id: pendingDelete.id, lmp_id: dbLmpId });
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
