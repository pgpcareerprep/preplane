import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUploadHistory, type DataSourceType } from "@/lib/hooks/useDbData";
import { History as HistoryIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const TITLES: Record<DataSourceType, string> = {
  mentor_union: "Mentor Union",
  alumni_db: "Alumni DB",
  student_db: "Student Database",
  poc_db: "POC Database",
};

const STATUS_STYLES: Record<string, string> = {
  success: "bg-sage-50 text-sage-700 border-sage-200",
  partial_success: "bg-yellow-50 text-yellow-700 border-yellow-200",
  failed: "bg-coral-50 text-coral-700 border-coral-200",
};

export function UploadHistoryModal({
  source, open, onOpenChange,
}: {
  source: DataSourceType;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { data: rows = [], isLoading } = useUploadHistory(source);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[960px] max-h-[80vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200 shrink-0">
          <DialogTitle className="text-[16px] font-semibold text-n900">
            Upload history — {TITLES[source]}
          </DialogTitle>
          <p className="text-[12px] text-n500 mt-0.5">
            Last {rows.length} upload{rows.length === 1 ? "" : "s"}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-auto px-6 py-3">
          {isLoading ? (
            <div className="text-center text-n500 py-12 text-[13px]">Loading…</div>
          ) : rows.length === 0 ? (
            <EmptyState icon={HistoryIcon} title="No uploads yet" description="Upload a CSV to get started." />
          ) : (
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-left text-n500 text-[10px] uppercase tracking-[0.5px] border-b border-n200">
                  <th className="font-medium px-2 py-2">Date / time</th>
                  <th className="font-medium px-2 py-2">Uploaded by</th>
                  <th className="font-medium px-2 py-2">File</th>
                  <th className="font-medium px-2 py-2 text-right">Total</th>
                  <th className="font-medium px-2 py-2 text-right">Inserted</th>
                  <th className="font-medium px-2 py-2 text-right">Updated</th>
                  <th className="font-medium px-2 py-2 text-right">Skipped</th>
                  <th className="font-medium px-2 py-2 text-right">Errors</th>
                  <th className="font-medium px-2 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className="border-b border-n100">
                    <td className="px-2 py-2 text-n700 whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-n700">{r.uploaded_by_admin_email || "—"}</td>
                    <td className="px-2 py-2 text-n700 truncate max-w-[200px]">{r.file_name || "—"}</td>
                    <td className="px-2 py-2 text-right text-n700 tabular-nums">{r.total_rows}</td>
                    <td className="px-2 py-2 text-right text-sage-700 tabular-nums">{r.inserted_rows}</td>
                    <td className="px-2 py-2 text-right text-sky-700 tabular-nums">{r.updated_rows}</td>
                    <td className="px-2 py-2 text-right text-n500 tabular-nums">{r.skipped_rows}</td>
                    <td className="px-2 py-2 text-right text-coral-700 tabular-nums">{r.error_rows}</td>
                    <td className="px-2 py-2">
                      <span className={cn("inline-flex items-center text-[10px] uppercase tracking-[0.5px] font-medium border rounded-full px-2 py-[2px]", STATUS_STYLES[r.status] || "bg-n50 text-n600 border-n200")}>
                        {r.status.replace("_", " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
