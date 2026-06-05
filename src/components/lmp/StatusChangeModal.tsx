import { useEffect, useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type LmpStatus, STATUS_META } from "@/lib/lmpTypes";
import { cn } from "@/lib/utils";

/**
 * Confirmation for an LMP Kanban drag-to-status move. Wraps the shared
 * ConfirmDialog and adds a reason textarea slot. Tone "warning" — status
 * changes are logged and visible to all assigned roles.
 */
export function StatusChangeModal({
  open, onOpenChange, fromStatus, toStatus, onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fromStatus?: LmpStatus;
  toStatus?: LmpStatus;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => { if (open) setReason(""); }, [open]);

  if (!toStatus) return null;
  const toMeta = STATUS_META[toStatus];
  const fromMeta = fromStatus ? STATUS_META[fromStatus] : undefined;

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="warning"
      title="Change status?"
      description={
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-center">
          {fromMeta && (
            <>
              <span className="font-medium text-n700">{fromMeta.label}</span>
              <span className="text-n400">→</span>
            </>
          )}
          <span className={cn("inline-flex items-center gap-1.5 pill normal-case tracking-normal", toMeta.pill)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", toMeta.dot)} />
            {toMeta.label}
          </span>

          <span className="block w-full text-[13px] text-n500 mt-1">
            This will be logged in the LMP history.
          </span>
        </span>
      }
      confirmLabel="Confirm change"
      onConfirm={() => onConfirm(reason)}
    >
      <div>
        <label
          htmlFor="lmp-status-reason"
          className="text-[11px] uppercase tracking-[0.5px] text-n500 font-medium mb-1.5 block text-left"
        >
          Reason (optional)
        </label>
        <textarea
          id="lmp-status-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Hiring pause requested by client"
          className="w-full rounded-md border border-n300 bg-card px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-none"
        />
      </div>
    </ConfirmDialog>
  );
}