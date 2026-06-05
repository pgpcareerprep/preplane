import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Mentor } from "@/lib/mentor";
import { MentorCard } from "./MentorCard";

type Props = {
  mentor: Mentor;
  index: number;
  onShortlist: () => void;
  onView: () => void;
  onSelect: () => void;
  onRemove: (id: string) => void;
};

export function SortableMentorCard({ mentor, index, onShortlist, onView, onSelect, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: mentor.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative pl-9", isDragging && "opacity-80")}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-md flex items-center justify-center text-n400 hover:text-n700 hover:bg-n100 cursor-grab active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <button
        type="button"
        aria-label="Remove from review"
        onClick={() => onRemove(mentor.id)}
        className="absolute right-3 top-3 z-10 h-7 w-7 rounded-full bg-card border border-n200 text-n500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 flex items-center justify-center shadow-sm transition-colors"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      <MentorCard
        mentor={mentor}
        index={index}
        onShortlist={onShortlist}
        onView={onView}
        onSelect={onSelect}
      />
    </div>
  );
}
