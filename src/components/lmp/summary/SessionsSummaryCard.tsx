import { cn } from "@/lib/utils";
import type { Session } from "@/lib/session";

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  completed: "bg-sage-50 text-sage-600 border-sage-200",
  "no-show": "bg-coral-50 text-coral-600 border-coral-200",
  rescheduled: "bg-yellow-50 text-yellow-600 border-yellow-200",
  "feedback-pending": "bg-orange-50 text-orange-600 border-orange-200",
  closed: "bg-n100 text-n500 border-n200",
};

/**
 * Compact, read-only Sessions summary for the Unified Overview surface.
 */
export function SessionsSummaryCard({ reqId, sessions = [] }: { reqId: string; sessions?: Session[] }) {
  const list = sessions.filter((s) => s.reqId === reqId);

  return (
    <div className="rounded-2xl bg-n50/40 border border-n200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-n800">Sessions</h4>
        <span className="text-[11px] text-n500 tabular-nums">{list.length} total</span>
      </div>
      {list.length === 0 ? (
        <p className="text-[12.5px] text-n500 italic">No sessions scheduled.</p>
      ) : (
        <ul className="space-y-2">
          {list.slice(0, 4).map((s) => (
            <li key={s.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-n800 truncate">
                  {s.mentor.name}
                </div>
                <div className="text-[11px] text-n500 truncate">
                  with {s.candidate.name} · {s.round}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium capitalize",
                  STATUS_PILL[s.status] ?? STATUS_PILL.closed,
                )}
              >
                {s.status.replace("-", " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}