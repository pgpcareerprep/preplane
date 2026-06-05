import { useState } from "react";
import { useGlobalSyncStatus } from "@/lib/hooks/useSyncConflicts";
import { ConflictResolutionModal } from "./ConflictResolutionModal";
import { cn } from "@/lib/utils";

/**
 * Compact green/amber/red dot for the page header. Shows the aggregated
 * sync state across all data sources. Click opens the conflict resolution
 * modal when there are open conflicts.
 */
export function GlobalSyncStatusDot({ className }: { className?: string }) {
  const { status, conflictCount, pendingSources } = useGlobalSyncStatus();
  const [open, setOpen] = useState(false);

  const config: Record<typeof status, { dot: string; label: string; tooltip: string }> = {
    synced:   { dot: "bg-emerald-500",  label: "Synced",   tooltip: "All data sources are in sync." },
    pending:  { dot: "bg-amber-500",    label: "Pending",  tooltip: `Waiting on: ${pendingSources.join(", ") || "—"}` },
    conflict: { dot: "bg-red-500",      label: "Conflict", tooltip: `${conflictCount} unresolved conflict${conflictCount === 1 ? "" : "s"} — click to resolve` },
    loading:  { dot: "bg-n300 animate-pulse", label: "…",  tooltip: "Checking sync status…" },
  };
  const c = config[status];
  const clickable = status === "conflict";

  return (
    <>
      <button
        type="button"
        onClick={() => clickable && setOpen(true)}
        title={c.tooltip}
        disabled={!clickable}
        className={cn(
          "inline-flex items-center gap-1.5 h-7 px-2 rounded-full border border-n200 dark:border-d-border bg-card/70 dark:bg-d-surface/70 text-[11px] font-medium text-n700 dark:text-d-muted",
          clickable && "hover:bg-n50 dark:hover:bg-d-surface-2 cursor-pointer",
          className,
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
        <span>{c.label}</span>
        {status === "conflict" && conflictCount > 0 && (
          <span className="rounded-full bg-red-100 text-red-700 px-1.5 text-[10px] font-semibold">
            {conflictCount}
          </span>
        )}
      </button>
      <ConflictResolutionModal open={open} onOpenChange={setOpen} />
    </>
  );
}
