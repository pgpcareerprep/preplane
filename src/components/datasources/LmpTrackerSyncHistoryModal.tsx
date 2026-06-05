import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLmpTrackerSyncHistory } from "@/lib/hooks/useDbData";
import { cn } from "@/lib/utils";

export function LmpTrackerSyncHistoryModal({
  open,
  onOpenChange,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
}) {
  const { data, isLoading } = useLmpTrackerSyncHistory();
  const rows = data ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{title} — Sync History</DialogTitle>
        </DialogHeader>

        <div className="overflow-auto border border-n200 rounded-md mt-3">
          <table className="w-full text-[13px]">
            <thead className="bg-n50 sticky top-0">
              <tr className="text-left">
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Date / Time</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Source</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Operation</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium text-right">Records</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Status</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={6} className="py-8 text-center text-n500">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-n500">
                  No sync history yet. Run "Sync All" to populate.
                </td></tr>
              )}
              {rows.map((r: any) => (
                <tr key={r.id} className="border-t border-n100 hover:bg-n50 align-top">
                  <td className="py-2.5 px-3 text-n700 text-[12px]">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-3 text-n700">LMP Tracker</td>
                  <td className="py-2.5 px-3 text-n600 text-[12px]">{r.operation || "sync"}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{r.row_count ?? r.field_count ?? 0}</td>
                  <td className="py-2.5 px-3">
                    <span className={cn(
                      "inline-flex items-center text-[11px] rounded-full px-2 py-[2px] border",
                      r.status === "success" ? "bg-sage-50 text-sage-600 border-sage-200" : "bg-coral-50 text-coral-600 border-coral-200",
                    )}>
                      {r.status}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-coral-600 text-[12px] max-w-xs truncate">
                    {r.error_message || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
