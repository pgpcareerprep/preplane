import { useMemo } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LmpRecord } from "@/lib/lmpTypes";

type CheckItem = {
  id: string;
  label: string;
  done: boolean;
  owner: "POC" | "Mentor";
};

function deriveChecklist(lmp?: LmpRecord): CheckItem[] {
  if (!lmp) return [];
  return [
    { id: "mentor-aligned", label: "Mentor aligned", done: lmp.mentorAligned ?? false, owner: "POC" },
    { id: "prep-doc-shared", label: "Prep doc shared", done: lmp.prepDocShared ?? false, owner: "POC" },
    { id: "assignment-review", label: "Assignment review", done: lmp.assignmentReview ?? false, owner: "Mentor" },
    { id: "mock-done", label: "Mock (done by POC)", done: lmp.mockDoneByPoc ?? false, owner: "POC" },
  ];
}

const OWNER_STYLE = {
  POC: "bg-orange-50 text-orange-600 border-orange-200",
  Mentor: "bg-teal-50 text-teal-600 border-teal-200",
};

/**
 * Execution Checklist — 4 boolean checklist items from the sheet.
 */
export function ChecklistSummaryCard({
  lmpId,
  lmp,
  onViewAll,
}: {
  lmpId: string;
  lmp?: LmpRecord;
  onViewAll?: () => void;
}) {
  const items = useMemo(() => deriveChecklist(lmp), [lmp]);
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="rounded-2xl bg-n50/40 border border-n200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-n800">Execution Checklist</h4>
        <span className="text-[11px] text-n500 tabular-nums">
          {done} / {total} completed
        </span>
      </div>

      <div className="h-1.5 rounded-full bg-n200/70 overflow-hidden">
        <div
          className={cn(
            "h-full transition-all rounded-full",
            pct === 100 ? "bg-emerald-500" : "bg-orange-500",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>

      {total === 0 ? (
        <p className="mt-3 text-[12.5px] text-n500 italic">No checklist data available.</p>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 py-0.5">
              {it.done ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-n300 shrink-0" />
              )}
              <span
                className={cn(
                  "text-[12.5px] flex-1",
                  it.done ? "text-n400 line-through" : "text-n800",
                )}
              >
                {it.label}
              </span>
              <span
                className={cn(
                  "text-[10px] font-medium rounded-full border px-1.5 py-[1px]",
                  OWNER_STYLE[it.owner],
                )}
              >
                {it.owner}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
