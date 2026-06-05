import { AlertTriangle, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLastSyncConflict } from "@/lib/hooks/useSyncConflicts";
import { ConflictResolutionModal } from "@/components/sheets/ConflictResolutionModal";
import { cn } from "@/lib/utils";

/**
 * Admin-only banner showing the most recent open sync conflict so the team
 * notices when a Google Sheet edit diverges from the database value before
 * it causes silent data loss.
 */
export function LastSyncConflictBanner({ className }: { className?: string }) {
  const { data: conflict, isLoading } = useLastSyncConflict();
  const [open, setOpen] = useState(false);

  if (isLoading || !conflict || conflict.status !== "open") return null;

  const detected = conflict.detected_at ? new Date(conflict.detected_at) : null;
  const ago = detected ? formatAgo(detected) : "";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "w-full flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-left hover:bg-amber-50 transition-colors",
          className,
        )}
      >
        <span className="h-8 w-8 rounded-full bg-amber-100 grid place-items-center shrink-0">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-amber-900">
            Last sync conflict — {conflict.table_name} · {conflict.field_name}
          </div>
          <div className="text-[11px] text-amber-700 truncate mt-0.5">
            Sheet says <span className="font-mono">"{conflict.sheet_value ?? "—"}"</span>{" "}
            · DB says <span className="font-mono">"{conflict.system_value ?? "—"}"</span>
            {ago && <span className="ml-2 text-amber-600">· detected {ago}</span>}
          </div>
        </div>
        <span className="text-[11px] font-medium text-amber-800 inline-flex items-center gap-0.5 shrink-0">
          Resolve <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </button>
      <ConflictResolutionModal open={open} onOpenChange={setOpen} />
    </>
  );
}

function formatAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
