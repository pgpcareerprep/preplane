import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useSyncConflicts } from "@/lib/hooks/useSyncConflicts";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

interface SheetErrorBannerProps {
  error: Error | null;
  onRetry?: () => void;
}

export function SheetErrorBanner({ error, onRetry }: SheetErrorBannerProps) {
  const { data: conflicts = [] } = useSyncConflicts();
  const [open, setOpen] = useState(false);
  const conflictCount = conflicts.length;

  if (!error && conflictCount === 0) return null;

  return (
    <div className="space-y-2">
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-coral-200 bg-coral-50 px-3 py-2 text-[12px] text-coral-600">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Unable to sync with Google Sheets: {error.message}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="font-medium underline hover:no-underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {conflictCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            <span className="inline-flex items-center justify-center min-w-[20px] px-1.5 h-5 rounded-full bg-amber-200 text-amber-900 font-semibold text-[11px] mr-1.5">
              {conflictCount}
            </span>
            sync {conflictCount === 1 ? "conflict needs" : "conflicts need"} resolution
          </span>
          <button
            onClick={() => setOpen(true)}
            className="font-medium underline hover:no-underline"
          >
            View conflicts
          </button>
        </div>
      )}

      <ConflictResolutionModal open={open} onOpenChange={setOpen} />
    </div>
  );
}
