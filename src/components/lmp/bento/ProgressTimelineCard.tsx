import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  formatRelativeTime,
  useTimeline,
  type TimelineEntry,
  type TimelineEntryKind,
} from "@/lib/lmpExecutionEngine";

const FILTERS: { id: "all" | TimelineEntryKind; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "progress",     label: "Progress" },
  { id: "no-update",    label: "No update" },
  { id: "checklist",    label: "Checklist" },
  { id: "comment",      label: "Comments" },
];

const DOT: Record<TimelineEntryKind, string> = {
  progress:        "bg-orange-500",
  "no-update":     "bg-n300",
  checklist:       "bg-teal-400",
  comment:         "bg-plum-400",
  remark:          "bg-plum-400",
  "candidate-move":"bg-sky-400",
  mentor:          "bg-yellow-500",
  attachment:      "bg-n400",
  update:          "bg-n400",
};

export function ProgressTimelineCard({
  lmpId,
  compact = false,
}: {
  lmpId: string;
  compact?: boolean;
}) {
  const all = useTimeline(lmpId);
  const [filter, setFilter] = useState<typeof FILTERS[number]["id"]>("all");

  const items = useMemo(() => {
    const arr = filter === "all" ? all : all.filter((e) => e.kind === filter);
    return compact ? arr.slice(0, 5) : arr;
  }, [all, filter, compact]);

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-n800">Progress Timeline</h4>
        <div className="flex items-center gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "text-[11px] rounded-full px-2 py-[2px] transition-colors",
                filter === f.id
                  ? "bg-n900 text-white"
                  : "text-n500 hover:text-n800 hover:bg-n100",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-[12px] text-n400 italic py-6">
          No entries yet. Add today’s progress above.
        </div>
      ) : (
        <ul className="relative pl-5 space-y-3">
          <span className="absolute left-[7px] top-1 bottom-1 w-px bg-n200" />
          {items.map((e) => (
            <Row key={e.id} e={e} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({ e }: { e: TimelineEntry }) {
  return (
    <li className="relative">
      <span
        className={cn(
          "absolute -left-[14px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white",
          DOT[e.kind],
        )}
      />
      <div className="text-[11px] text-n400 tabular-nums">
        {formatRelativeTime(e.ts)}
        {e.author && <span className="text-n400"> · {e.author}</span>}
      </div>
      <div className="text-[12.5px] text-n700 leading-snug">{e.text}</div>
      {e.chips && e.chips.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {e.chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-full bg-n100 text-n600 px-1.5 py-[1px] text-[10px]"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </li>
  );
}