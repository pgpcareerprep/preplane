import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Loader2 } from "lucide-react";
import { useSyncConflicts, useResolveConflict, type ConflictResolution, type SyncConflict } from "@/lib/hooks/useSyncConflicts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function recordLabel(c: SyncConflict): string {
  const k = c.record_key || {};
  if (k.company && k.role) return `${k.company} · ${k.role}`;
  if (k.roll_no) return k.roll_no;
  return c.record_id?.slice(0, 8) ?? "—";
}

export function ConflictResolutionModal({ open, onOpenChange }: Props) {
  const { data: conflicts = [], isLoading } = useSyncConflicts();
  const resolve = useResolveConflict();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState<ConflictResolution | null>(null);

  const onResolve = async (conflict: SyncConflict, resolution: ConflictResolution) => {
    setBusyId(conflict.id);
    try {
      await resolve.mutateAsync({ conflict, resolution });
    } finally {
      setBusyId(null);
    }
  };

  const onBulk = async (resolution: ConflictResolution) => {
    if (bulkBusy) return;
    if (resolution !== "skip" && !window.confirm(
      `Apply "${resolution === "use_sheet" ? "Use Sheet" : "Keep System"}" to all ${conflicts.length} conflicts?`,
    )) return;
    setBulkBusy(resolution);
    try {
      for (const c of conflicts) {
        // sequential to avoid hammering the sheet queue / DB
         
        await resolve.mutateAsync({ conflict: c, resolution });
      }
    } finally {
      setBulkBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync conflicts</DialogTitle>
          <DialogDescription>
            Both the app and the connected Google Sheet edited these fields. Choose which value to keep.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-n400">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
          </div>
        )}

        {!isLoading && conflicts.length === 0 && (
          <div className="text-center py-8 text-n400 text-sm">No open conflicts.</div>
        )}

        {!isLoading && conflicts.length > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 mb-3">
            <div className="text-[12px] text-amber-800">
              <span className="font-semibold">{conflicts.length}</span> open conflict{conflicts.length === 1 ? "" : "s"}. Bulk resolve:
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={!!bulkBusy}
                onClick={() => onBulk("keep_system")}>
                {bulkBusy === "keep_system" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Keep all System
              </Button>
              <Button size="sm" disabled={!!bulkBusy}
                onClick={() => onBulk("use_sheet")}>
                {bulkBusy === "use_sheet" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Use all Sheet
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {conflicts.map((c) => {
            const busy = busyId === c.id;
            return (
              <div key={c.id} className="rounded-lg border border-n200 p-3 bg-card">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[12px] text-n500">
                    <Badge variant="outline" className="mr-2">{c.table_name}</Badge>
                    <span className="font-medium text-n700">{recordLabel(c)}</span>
                    <span className="mx-2">·</span>
                    <span className="text-n400">field:</span>{" "}
                    <span className="font-mono text-n700">{c.field_name}</span>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch mb-3">
                  <div className="rounded border border-blue-200 bg-blue-50 p-2 text-[12px]">
                    <div className="text-blue-700 font-medium mb-1">System value</div>
                    <div className="text-n700 break-words whitespace-pre-wrap">{c.system_value || <em className="text-n400">empty</em>}</div>
                  </div>
                  <div className="flex items-center text-n300">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                  <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-[12px]">
                    <div className="text-emerald-700 font-medium mb-1">Sheet value</div>
                    <div className="text-n700 break-words whitespace-pre-wrap">{c.sheet_value || <em className="text-n400">empty</em>}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2 justify-end">
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => onResolve(c, "skip")}>
                    Skip
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy}
                    onClick={() => onResolve(c, "keep_system")}>
                    Keep System
                  </Button>
                  <Button size="sm" disabled={busy}
                    onClick={() => onResolve(c, "use_sheet")}>
                    {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Use Sheet
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
