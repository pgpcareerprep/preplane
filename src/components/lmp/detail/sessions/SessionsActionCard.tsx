import { useMemo } from "react";
import { Plus, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useSessionsLive } from "@/lib/hooks/useSessionsLive";
import { cn } from "@/lib/utils";

const STATUS_PILL: Record<string, string> = {
  scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  completed: "bg-sage-50 text-sage-600 border-sage-200",
  "no-show": "bg-coral-50 text-coral-600 border-coral-200",
  rescheduled: "bg-yellow-50 text-yellow-600 border-yellow-200",
  "feedback-pending": "bg-orange-50 text-orange-600 border-orange-200",
  closed: "bg-n100 text-n500 border-n200",
};

function formatScheduled(iso: string | null): string {
  if (!iso) return "Unscheduled";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Unscheduled";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

/**
 * Compact, action-oriented Sessions card for the LMP Overview surface.
 * Pulls live sessions from `sessions` (DB) for this LMP, with realtime sync.
 */
export function SessionsActionCard({
  reqId,
  onOpenSessionsTab,
  readOnly = false,
}: {
  reqId: string;
  onOpenSessionsTab?: () => void;
  readOnly?: boolean;
}) {
  const { data: rows = [] } = useSessionsLive({ lmpId: reqId });
  const list = useMemo(() => rows ?? [], [rows]);

  const handleSchedule = () => {
    if (onOpenSessionsTab) {
      onOpenSessionsTab();
    } else {
      toast.info("Open the Sessions tab to schedule one");
    }
  };

  const roTitle = readOnly ? "Read-only — you are not a POC on this LMP" : undefined;

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-[13px] font-semibold text-n800">Sessions</h4>
          <span className="rounded-full bg-n100 text-n700 text-[10.5px] font-medium px-1.5 py-[1px] tabular-nums">
            {list.length} total
          </span>
        </div>
        <button
          type="button"
          onClick={handleSchedule}
          disabled={readOnly}
          title={roTitle}
          className="inline-flex items-center gap-1 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[11.5px] font-medium px-2.5 h-7 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-500"
        >
          <Plus className="h-3.5 w-3.5" /> Schedule
        </button>
      </div>

      {list.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-6 text-[12.5px] text-n500">
          <p className="italic mb-2">No sessions scheduled.</p>
          <button
            type="button"
            onClick={handleSchedule}
            disabled={readOnly}
            title={roTitle}
            className="text-[11.5px] text-orange-600 hover:text-orange-700 font-medium inline-flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:text-orange-600"
          >
            Add Session <ArrowRight className="h-3 w-3" />
          </button>
        </div>

      ) : (
        <ul className="space-y-2 flex-1">
          {list.slice(0, 4).map((s) => (
            <li
              key={s.id}
              className="flex items-start justify-between gap-2 rounded-lg border border-n100 bg-n50/50 px-2.5 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[12.5px] text-n800 truncate font-medium">
                  {s.mentor_name ?? "Mentor TBD"}
                </div>
                <div className="text-[10.5px] text-n500 truncate">
                  {formatScheduled(s.scheduled_at)} · {s.session_type ?? "session"}
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize",
                  STATUS_PILL[s.status] ?? STATUS_PILL.closed,
                )}
              >
                {s.status.replace("-", " ")}
              </span>
            </li>
          ))}
          {list.length > 4 && onOpenSessionsTab && (
            <li>
              <button
                type="button"
                onClick={onOpenSessionsTab}
                className="w-full text-center text-[11px] text-orange-600 hover:text-orange-700 font-medium py-1"
              >
                View all {list.length} sessions
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
