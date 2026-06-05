import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, Plus, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { type Round } from "@/lib/lmpProcessMutations";

export function RoundConfigModal({
  open, onOpenChange, rounds, onSave, hasCandidates,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rounds: Round[];
  onSave: (rounds: Round[]) => void;
  hasCandidates: boolean;
}) {
  const [list, setList] = useState<Round[]>(rounds);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = list.findIndex((r) => r.id === active.id);
    const newIndex = list.findIndex((r) => r.id === over.id);
    setList(arrayMove(list, oldIndex, newIndex));
  };

  const handleSave = () => {
    // Normalize: blank name → "R{i+1}"; mirror into type for back-compat.
    const normalized = list.map((r, i) => {
      const trimmed = (r.name || "").trim();
      const fallback = `R${i + 1}`;
      const name = trimmed.length === 0
        ? fallback
        : /^R\d+/i.test(trimmed) ? trimmed : `${fallback} ${trimmed}`;
      return { ...r, name, type: trimmed || fallback };
    });
    onSave(normalized);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[560px] p-6 rounded-2xl shadow-xl border-n200 max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-semibold text-n900 tracking-[-0.3px]">Configure Interview Rounds</DialogTitle>
        </DialogHeader>

        {hasCandidates && (
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5" strokeWidth={2} />
            <p className="text-[12px] text-n800">
              Candidates currently in pipeline may be repositioned. Review after saving.
            </p>
          </div>
        )}

        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={list.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {list.map((r, i) => (
                <SortableRoundRow
                  key={r.id} round={r} index={i}
                  onNameChange={(name) => setList(list.map((x) => x.id === r.id ? { ...x, name } : x))}
                  onRemove={() => setList(list.filter((x) => x.id !== r.id))}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>

        <p className="text-[11.5px] text-n500 italic">
          Leave blank to keep just R1, R2, R3… or type a name like "HR Screen" or "Technical".
        </p>

        <button
          onClick={() => setList([...list, { id: `r-${Date.now()}`, name: "", type: "" }])}
          className="inline-flex items-center gap-1.5 text-[13px] text-orange-500 hover:text-orange-600 font-medium"
        >
          <Plus className="h-3.5 w-3.5" /> Add Another Round
        </button>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={() => onOpenChange(false)} className="text-[13px] text-n500 hover:text-n800 px-3 py-2">Cancel</button>
          <button
            onClick={handleSave}
            className="rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 transition-colors"
          >
            Save Rounds
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SortableRoundRow({
  round, index, onNameChange, onRemove,
}: { round: Round; index: number; onNameChange: (n: string) => void; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: round.id });
  // Strip leading "R{n}" or "R{n} — " prefix for editing so the user sees just their custom label.
  const displayValue = (round.name || "").replace(/^R\d+\s*(—|-)?\s*/i, "");
  return (
    <motion.li
      ref={setNodeRef}
      layout
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-n200 bg-card px-3 py-2",
        isDragging && "shadow-lg",
      )}
    >
      <button {...attributes} {...listeners} className="text-n400 hover:text-n700 cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="text-[12px] font-bold text-orange-500 w-7 tabular-nums">R{index + 1}</span>
      <input
        type="text"
        value={displayValue}
        onChange={(e) => onNameChange(e.target.value)}
        placeholder="Name this round (optional) — e.g. HR Screen, Technical"
        className="flex-1 h-8 rounded-md border border-n300 bg-card px-2 text-[13px] text-n800 focus:outline-none focus:border-orange-400 placeholder:text-n400"
      />
      <button onClick={onRemove} className="text-n400 hover:text-coral-600 transition-colors">
        <X className="h-4 w-4" />
      </button>
    </motion.li>
  );
}
