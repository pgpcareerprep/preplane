import { useState } from "react";
import {
  DndContext, DragOverlay, PointerSensor, useDroppable, useDraggable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ageDays, type LmpRecord, type LmpStatus, STATUSES, STATUS_META } from "@/lib/lmpTypes";
import { LmpCard } from "./LmpCard";
import { StatusChangeModal } from "./StatusChangeModal";
import { useMotionPreset } from "@/lib/useMotionPreset";

export function LmpKanban({
  records, canDrag, onChangeStatus,
}: {
  records: LmpRecord[];
  canDrag: boolean;
  onChangeStatus: (id: string, status: LmpStatus, reason: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; from: LmpStatus; to: LmpStatus } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const rec = records.find((r) => r.id === active.id);
    const newStatus = String(over.id) as LmpStatus;
    if (!rec || rec.status === newStatus) return;
    setPending({ id: rec.id, from: rec.status, to: newStatus });
  };

  const activeRec = activeId ? records.find((r) => r.id === activeId) ?? null : null;

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scroll-px-3 [-webkit-overflow-scrolling:touch]">
          {STATUSES.map((s) => {
            const items = records
              .filter((r) => r.status === s)
              .sort((a, b) => ageDays(a.createdAt) - ageDays(b.createdAt));
            return (
              <Column key={s} status={s} count={items.length}>
                {items.map((r) => (
                  <DraggableCard key={r.id} rec={r} canDrag={canDrag} />
                ))}
                {items.length === 0 && (
                  <div className="text-center text-[12px] text-n400 py-8 italic">No items</div>
                )}
              </Column>
            );
          })}
        </div>
        <DragOverlay>
          {activeRec && (
            <div className="w-[min(85vw,220px)] sm:w-[240px] lg:w-[260px]">
              <LmpCard rec={activeRec} dragging />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <StatusChangeModal
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        fromStatus={pending?.from}
        toStatus={pending?.to}
        onConfirm={(reason) => {
          if (pending) onChangeStatus(pending.id, pending.to, reason);
          setPending(null);
        }}
      />
    </>
  );
}

function Column({ status, count, children }: { status: LmpStatus; count: number; children: React.ReactNode }) {
  const meta = STATUS_META[status];
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <div className="shrink-0 w-[min(85vw,220px)] sm:w-[240px] lg:w-[260px] flex flex-col snap-start">
      <div className="px-2 mb-2 flex items-center gap-2">
        <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
        <span className="text-[12px] uppercase tracking-[0.5px] text-n600 font-medium">{meta.label}</span>
        <span className="ml-auto inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full bg-n100 text-n600 text-[11px] font-medium tabular-nums">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 min-h-[300px] rounded-xl bg-n100 p-2 transition-colors duration-150",
          isOver && "bg-orange-50 ring-2 ring-orange-300 ring-inset",
        )}
      >
        <div className="space-y-2">{children}</div>
      </div>
    </div>
  );
}

function DraggableCard({ rec, canDrag }: { rec: LmpRecord; canDrag: boolean }) {
  const m = useMotionPreset();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: rec.id, disabled: !canDrag,
  });
  return (
    <motion.div
      ref={setNodeRef}
      initial={m.dragFade.initial}
      animate={m.dragFade.animate(isDragging)}
      transition={m.dragFade.transition(isDragging)}
      {...attributes}
      {...(canDrag ? listeners : {})}
    >
      <LmpCard rec={rec} />
    </motion.div>
  );
}