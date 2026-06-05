import { useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, AlertTriangle, Check, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useSheetSyncStatus } from "@/lib/sheets/useSheetSyncStatus";
import { useSyncConflicts } from "@/lib/hooks/useSyncConflicts";
import { ConflictResolutionModal } from "./ConflictResolutionModal";

interface SyncIndicatorProps {
  queryKey: string[];
  className?: string;
}

export function SyncIndicator({ queryKey, className }: SyncIndicatorProps) {
  const queryClient = useQueryClient();
  const { status, lastSyncedAt, errorMessage, retry } = useSheetSyncStatus();
  const { data: conflicts = [] } = useSyncConflicts();
  const conflictCount = conflicts.length;
  const [conflictsOpen, setConflictsOpen] = useState(false);

  const [queryLastFetched, setQueryLastFetched] = useState<Date | null>(null);
  const [agoText, setAgoText] = useState("just now");
  const [spinning, setSpinning] = useState(false);

  // Track react-query last-fetched as a fallback timestamp (idle state).
  useEffect(() => {
    const state = queryClient.getQueryState(queryKey);
    if (state?.dataUpdatedAt) setQueryLastFetched(new Date(state.dataUpdatedAt));
  }, [queryClient, queryKey]);

  const referenceTs = lastSyncedAt ?? queryLastFetched?.getTime() ?? null;

  useEffect(() => {
    if (!referenceTs) return;
    const tick = () => {
      const secs = Math.floor((Date.now() - referenceTs) / 1000);
      if (secs < 5) setAgoText("just now");
      else if (secs < 60) setAgoText(`${secs}s ago`);
      else if (secs < 3600) setAgoText(`${Math.floor(secs / 60)} min ago`);
      else setAgoText(`${Math.floor(secs / 3600)}h ago`);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [referenceTs]);

  const handleRefresh = () => {
    setSpinning(true);
    queryClient.invalidateQueries({ queryKey }).finally(() => {
      setQueryLastFetched(new Date());
      setTimeout(() => setSpinning(false), 600);
    });
  };

  const conflictPill = conflictCount > 0 ? (
    <button
      onClick={() => setConflictsOpen(true)}
      className="inline-flex items-center gap-1 rounded-full bg-orange-100 hover:bg-orange-200 text-orange-700 px-1.5 py-0.5 text-[10px] font-semibold transition-colors"
      title={`${conflictCount} sync conflict${conflictCount === 1 ? "" : "s"} need resolution`}
    >
      <AlertTriangle className="h-3 w-3" />
      {conflictCount}
    </button>
  ) : null;

  let body: JSX.Element;

  if (status === "pushing") {
    body = (
      <div className={cn("flex items-center gap-1.5 text-[11px] text-orange-600", className)}>
        <ArrowUp className="h-3 w-3 animate-pulse" />
        <span>Syncing…</span>
        {conflictPill}
      </div>
    );
  } else if (status === "pulling") {
    body = (
      <div className={cn("flex items-center gap-1.5 text-[11px] text-blue-600", className)}>
        <ArrowDown className="h-3 w-3 animate-pulse" />
        <span>Receiving…</span>
        {conflictPill}
      </div>
    );
  } else if (status === "fallback") {
    body = (
      <div
        className={cn("flex items-center gap-1.5 text-[11px] text-amber-600", className)}
        title={errorMessage ?? "Sheet temporarily unavailable — showing cached database data."}
      >
        <AlertTriangle className="h-3 w-3" />
        <span>Sheet offline — cached DB data</span>
        <button
          onClick={handleRefresh}
          className="p-0.5 rounded hover:bg-n100 transition-colors"
          title="Try again"
        >
          <RefreshCw className={cn("h-3 w-3", spinning && "animate-spin")} />
        </button>
        {conflictPill}
      </div>
    );
  } else if (status === "error") {
    body = (
      <div
        className={cn("flex items-center gap-1.5 text-[11px] text-red-600", className)}
        title={errorMessage ?? undefined}
      >
        <AlertTriangle className="h-3 w-3" />
        <span>Sync failed —</span>
        <button
          onClick={retry}
          className="underline hover:text-red-700 transition-colors"
          title="Retry last sync"
        >
          retry
        </button>
        {conflictPill}
      </div>
    );
  } else {
    body = (
      <div className={cn("flex items-center gap-1.5 text-[11px] text-n400", className)}>
        <Check className="h-3 w-3 text-green-600" />
        <span>Synced {agoText}</span>
        <button
          onClick={handleRefresh}
          className="p-0.5 rounded hover:bg-n100 transition-colors"
          title="Refresh now"
        >
          <RefreshCw className={cn("h-3 w-3", spinning && "animate-spin")} />
        </button>
        {conflictPill}
      </div>
    );
  }

  return (
    <>
      {body}
      <ConflictResolutionModal open={conflictsOpen} onOpenChange={setConflictsOpen} />
    </>
  );
}
