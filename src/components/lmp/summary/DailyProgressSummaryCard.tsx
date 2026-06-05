import { CalendarClock } from "lucide-react";
import { useProgress, formatRelativeTime } from "@/lib/lmpExecutionEngine";
import type { LmpRecord } from "@/lib/lmpTypes";

/**
 * Read-only summary of Daily Progress for the Overview surface.
 * Prioritizes real sheet data (lmp.dailyProgress / lmp.prepProgress),
 * falls back to in-memory entries for session-only additions.
 */
export function DailyProgressSummaryCard({
  lmpId,
  lmp,
  onViewAll,
}: {
  lmpId: string;
  lmp?: LmpRecord;
  onViewAll?: () => void;
}) {
  const inMemoryEntries = useProgress(lmpId);
  const latest = inMemoryEntries[0];

  const sheetProgress = lmp?.dailyProgress?.trim();
  const sheetPrepProgress = lmp?.prepProgress?.trim();

  const hasSheetData = !!sheetProgress || !!sheetPrepProgress;
  const hasInMemory = !!latest;

  return (
    <div className="rounded-2xl bg-n50/40 border border-n200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-[13px] font-semibold text-n800">Daily Progress</h4>
        {hasInMemory && (
          <span className="text-[10.5px] text-n500">
            {formatRelativeTime(latest.ts)}
          </span>
        )}
      </div>

      {hasSheetData ? (
        <div className="space-y-2.5">
          {sheetProgress && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1">
                Daily Update
              </div>
              <p className="text-[12.5px] text-n800 leading-snug whitespace-pre-line line-clamp-4">
                {sheetProgress}
              </p>
            </div>
          )}
          {sheetPrepProgress && (
            <div>
              <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1">
                Prep Progress
              </div>
              <p className="text-[12.5px] text-n800 leading-snug whitespace-pre-line line-clamp-4">
                {sheetPrepProgress}
              </p>
            </div>
          )}
        </div>
      ) : hasInMemory ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-n500">
            <span className="tabular-nums">
              {new Date(latest.ts).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
              {" · "}
              {new Date(latest.ts).toLocaleTimeString(undefined, {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
            <span className="text-n300">·</span>
            <span className="font-medium text-n700">{latest.author}</span>
          </div>

          {latest.chips && latest.chips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {latest.chips.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-card border border-n200 text-n600 px-2 py-[1px] text-[10.5px]"
                >
                  {c}
                </span>
              ))}
            </div>
          )}

          <p className="text-[12.5px] text-n800 leading-snug line-clamp-3">
            "{latest.text}"
          </p>
        </div>
      ) : (
        <p className="text-[12.5px] text-n500 italic">No progress logged yet.</p>
      )}

      <div className="mt-3 pt-3 border-t border-n200/70 flex items-center gap-2 text-[11.5px] text-n600">
        <CalendarClock className="h-3.5 w-3.5 text-n400" />
        {hasInMemory && latest.nextExpectedAt ? (
          <span>
            Next expected:{" "}
            <span className="text-n800 font-medium">
              {new Date(latest.nextExpectedAt).toLocaleDateString(undefined, {
                day: "numeric",
                month: "short",
              })}
            </span>
          </span>
        ) : (
          <span className="text-n500">No next update scheduled</span>
        )}
      </div>
    </div>
  );
}
