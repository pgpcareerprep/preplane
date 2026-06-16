import { useMemo, useState } from "react";
import { Settings2, UserPlus, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LmpRecord } from "@/lib/lmpTypes";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  MouseSensor,
  TouchSensor,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
 * Parse a sheet cell that may contain comma/newline-separated names.
 * Filters out purely numeric tokens (e.g. count "1" written by the DB trigger).
 */
function parseNames(raw?: string): string[] {
  if (!raw || !raw.trim()) return [];
  return raw.split(/[,;\n]+/)
    .map(s => s.trim())
    .filter(s => s && !/^\d+$/.test(s));
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
  id?: string;
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

  const sheetByIdx: string[][] = [
    parseNames(lmp?.r1Names),
    parseNames(lmp?.r2Names),
    parseNames(lmp?.r3Names),
    parseNames(lmp?.finalConvertedNames || lmp?.finalConvertedNumbers),
  ];

  const itemsByRoundId: Record<string, PipelineItem[]> = { pool: [] };
  for (const r of rounds) itemsByRoundId[r.id] = [];
  ([0, 1, 2, 3] as const).forEach((idx) => {
    const targetId = sheetIndexToRoundId(idx, rounds);
    if (!itemsByRoundId[targetId]) itemsByRoundId[targetId] = [];
    for (const name of sheetByIdx[idx]) {
      itemsByRoundId[targetId].push({ name, source: "sheet" });
    }
  });

  for (const c of dbCandidates) {
    const name = (c.student_name || "").trim();
    if (!name) continue;
    const target = resolveStageToRoundId(c.pipeline_stage, rounds);
    if (!itemsByRoundId[target]) itemsByRoundId[target] = [];
    itemsByRoundId[target].push({ name, id: c.id, source: "db" });
  }

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

  return [
    { id: "pool", label: "Pool — Newly added", items: dedupe(itemsByRoundId.pool || []) },
    ...rounds.map((r) => ({
      id: r.id,
      label: r.name,
      items: dedupe(itemsByRoundId[r.id] || []),
    })),
  ];
}

// ── DnD sub-components ──────────────────────────────────────────────────────

function DroppableColumn({ id, isOver, children }: { id: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "p-2 space-y-1.5 min-h-[80px] rounded-b-xl transition-colors",
        isOver && "bg-orange-50",
      )}
    >
      {children}
    </div>
  );
}

function DraggableCard({ id, children }: { id: string; children: (dragHandleProps: Record<string, unknown>) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && "opacity-40")}
    >
      {children({ ...attributes, ...listeners })}
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────

export function InteractivePipelineCard({ lmpId, lmp, readOnly = false, canManage = false }: { lmpId: string; lmp?: LmpRecord; readOnly?: boolean; canManage?: boolean }) {
  const [addOpen, setAddOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const addMutation = useAddLmpCandidates();
  const deleteMutation = useDeleteLmpCandidate();
  const stageMutation = useUpdateLmpCandidateStage();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<(PipelineItem & { colorIdx: number }) | null>(null);
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

  const mouseSensor = useSensor(MouseSensor, { activationConstraint: { distance: 6 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(mouseSensor, touchSensor);

  function handleDragStart(event: DragStartEvent) {
    if (readOnly) return;
    const activeId = event.active.id as string;
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci];
      const itemIdx = col.items.findIndex(i => i.id === activeId);
      if (itemIdx !== -1) {
        setActiveItem({ ...col.items[itemIdx], colorIdx: itemIdx % CANDIDATE_COLORS.length });
        break;
      }
    }
  }

  function handleDragOver(event: { over: { id: string } | null }) {
    setOverId(event.over?.id ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (readOnly) return;
    setOverId(null);
    setActiveItem(null);
    const { active, over } = event;
    if (!over || !dbLmpId) return;
    const candidateId = active.id as string;
    const newColId = over.id as string;
    // Find current column of this candidate
    const currentCol = columns.find(col => col.items.some(i => i.id === candidateId));
    if (!currentCol || currentCol.id === newColId) return;
    stageMutation.mutate({ id: candidateId, pipeline_stage: newColId, lmp_id: dbLmpId });
  }

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
            disabled={!canManage}
            title={!canManage ? "Only admin or allocator can configure rounds" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md bg-card border border-n300 hover:bg-n100 text-n800 text-[12.5px] font-medium px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
          >
            <Settings2 className="h-3.5 w-3.5" /> Configure Rounds
          </button>
        </div>
      </div>

      {!hasAnyData ? (
        <div className="rounded-xl border border-n200 bg-n50/50 py-10 grid place-items-center">
          <p className="text-[12.5px] text-n400 italic">
            No pipeline data yet. Add candidates or move them through rounds.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver as any}
          onDragEnd={handleDragEnd}
        >
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

                <DroppableColumn id={col.id} isOver={overId === col.id}>
                  {col.items.length === 0 ? (
                    <div className="h-[60px] grid place-items-center text-[11px] italic text-n400">
                      —
                    </div>
                  ) : (
                    col.items.map((item, i) => {
                      const isDb = item.source === "db" && !!item.id;
                      const card = (
                        <div className="group relative w-full flex items-center gap-2 rounded-md border border-n200 bg-card px-2 py-1.5 pr-8 shadow-sm">
                          {isDb && !readOnly ? (
                            <span
                              className="cursor-grab active:cursor-grabbing text-n300 hover:text-n600 shrink-0 h-4 w-4 flex items-center justify-center"
                              title="Drag to move"
                            >
                              <GripVertical className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="h-4 w-4 shrink-0" />
                          )}
                          <div
                            className={cn(
                              "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                              CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
                            )}
                          >
                            {initialsFrom(item.name)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate whitespace-nowrap text-[12.5px] font-medium text-n800" title={item.name}>{item.name}</div>
                          </div>
                          {isDb && !readOnly ? (
                            <>
                              <select
                                value={col.id}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (next === col.id || !dbLmpId) return;
                                  stageMutation.mutate({ id: item.id!, pipeline_stage: next, lmp_id: dbLmpId });
                                }}
                                className="absolute right-8 top-1/2 h-6 max-w-[112px] -translate-y-1/2 rounded border border-n200 bg-card px-1 text-[11px] text-n700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
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
                                className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-n400 opacity-0 transition-opacity hover:bg-coral-50 hover:text-coral-600 group-hover:opacity-100 focus:opacity-100"
                                aria-label={`Remove ${item.name}`}
                                title="Remove from this round"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </>
                          ) : (
                            <span
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] italic text-n400 opacity-0 transition-opacity group-hover:opacity-100"
                              title="From sheet — edit in source"
                            >
                              sheet
                            </span>
                          )}
                        </div>
                      );

                      if (!isDb || readOnly) {
                        return <div key={`${col.id}-${i}-${item.name}`}>{card}</div>;
                      }
                      return (
                        <DraggableCard key={`${col.id}-${i}-${item.id}`} id={item.id!}>
                          {(dragHandleProps) => (
                            <div className="group relative w-full flex items-center gap-2 rounded-md border border-n200 bg-card px-2 py-1.5 pr-8 shadow-sm">
                              <span
                                className="cursor-grab active:cursor-grabbing text-n300 hover:text-n600 shrink-0 h-4 w-4 flex items-center justify-center"
                                title="Drag to move"
                                {...dragHandleProps}
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                              <div
                                className={cn(
                                  "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                                  CANDIDATE_COLORS[i % CANDIDATE_COLORS.length],
                                )}
                              >
                                {initialsFrom(item.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="truncate whitespace-nowrap text-[12.5px] font-medium text-n800" title={item.name}>{item.name}</div>
                              </div>
                              <select
                                value={col.id}
                                onChange={(e) => {
                                  const next = e.target.value;
                                  if (next === col.id || !dbLmpId) return;
                                  stageMutation.mutate({ id: item.id!, pipeline_stage: next, lmp_id: dbLmpId });
                                }}
                                className="absolute right-8 top-1/2 h-6 max-w-[112px] -translate-y-1/2 rounded border border-n200 bg-card px-1 text-[11px] text-n700 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus:opacity-100"
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
                                className="absolute right-2 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded text-n400 opacity-0 transition-opacity hover:bg-coral-50 hover:text-coral-600 group-hover:opacity-100 focus:opacity-100"
                                aria-label={`Remove ${item.name}`}
                                title="Remove"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </DraggableCard>
                      );
                    })
                  )}
                </DroppableColumn>
              </div>
            ))}
          </div>

          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <div className="flex items-center gap-2 rounded-md border border-orange-300 bg-card px-2 py-1.5 shadow-lg w-[220px]">
                <GripVertical className="h-3.5 w-3.5 text-n300 shrink-0" />
                <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0", CANDIDATE_COLORS[activeItem.colorIdx])}>
                  {initialsFrom(activeItem.name)}
                </div>
                <span className="truncate whitespace-nowrap text-[12.5px] font-medium text-n800" title={activeItem.name}>{activeItem.name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}

      {lmp?.stage && (
        <div className="mt-3 pt-3 border-t border-n200/70 flex items-center gap-2 text-[11.5px] text-n600">
          <span>Current Stage:</span>
          <span className="font-medium text-n800">{lmp.stage}</span>
        </div>
      )}

      <AddCandidatesModal
        open={addOpen && !readOnly}
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
        open={configOpen && canManage}
        onOpenChange={setConfigOpen}
        rounds={rounds}
        hasCandidates={hasAnyData}
        onSave={(rs) => { if (canManage) saveRoundsMutation.mutate(rs); }}
      />

      <ConfirmDialog
        open={!!pendingDelete && !readOnly}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        title={pendingDelete ? `Remove ${pendingDelete.name}?` : "Remove candidate?"}
        description="This unlinks the candidate from this LMP process. You can re-add them later."
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => {
          if (!pendingDelete || readOnly) return;
          deleteMutation.mutate({ id: pendingDelete.id, lmp_id: dbLmpId });
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
