import { useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { clearCachePrefix } from "@/lib/hooks/useDbData";
import {
  planHistoricalLmpBackfill,
  type HistoricalLmpDryRun,
  type HistoricalLmpExisting,
} from "@/lib/historicalLmpBackfill";

type CommitReport = {
  inserted?: number;
  updated?: number;
  skipped?: number;
  ambiguous?: number;
  generated_lmp_ids?: string[];
  errors?: string[];
};

type HistoricalBackfillRpcClient = {
  rpc: (
    fn: "import_historical_lmp_backfill",
    args: { p_rows: HistoricalLmpDryRun["commitRows"] },
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function HistoricalLmpBackfillModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const { role } = useRole();
  const canImport = role === "admin" || role === "allocator";
  const [fileName, setFileName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [dryRun, setDryRun] = useState<HistoricalLmpDryRun | null>(null);
  const [commitReport, setCommitReport] = useState<CommitReport | null>(null);
  const [loading, setLoading] = useState<"dry-run" | "commit" | null>(null);

  const reset = () => {
    setFileName("");
    setCsvText("");
    setDryRun(null);
    setCommitReport(null);
    setLoading(null);
  };

  const runDryRun = async (text = csvText) => {
    if (!text) return;
    setLoading("dry-run");
    setCommitReport(null);
    try {
      const { data, error } = await supabase
        .from("lmp_processes")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      const report = planHistoricalLmpBackfill(text, (data ?? []) as HistoricalLmpExisting[]);
      setDryRun(report);
      toast.success(`Dry run complete: ${report.inserts} insert, ${report.updates} update`);
    } catch (error) {
      toast.error(`Dry run failed: ${(error as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const commit = async () => {
    if (!dryRun?.commitRows.length) return;
    setLoading("commit");
    try {
      const { data, error } = await (supabase as unknown as HistoricalBackfillRpcClient).rpc("import_historical_lmp_backfill", {
        p_rows: dryRun.commitRows,
      });
      if (error) throw error;
      setCommitReport((data ?? {}) as CommitReport);
      clearCachePrefix('["db-lmp-processes');
      clearCachePrefix('["db-lmp-process"');
      qc.invalidateQueries({ queryKey: ["db-lmp"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-process"] });
      qc.invalidateQueries({ queryKey: ["db-data-source-status"] });
      qc.invalidateQueries({ queryKey: ["analytics"] });
      toast.success("Historical LMP backfill committed. Sheet reconcile queued.");
    } catch (error) {
      toast.error(`Import failed: ${(error as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) reset(); onOpenChange(next); }}>
      <DialogContent className="sm:max-w-[900px] max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historical LMP CSV backfill</DialogTitle>
          <p className="text-[12px] text-n500">
            DB-first import. Dry run is required; Google Sheet rows and headers are never written directly.
          </p>
        </DialogHeader>

        {!canImport ? (
          <div className="rounded-md border border-coral-200 bg-coral-50 p-4 text-[13px] text-coral-700">
            Only admins and allocators can run historical LMP backfills.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border-2 border-dashed border-orange-200 bg-orange-50/50 p-6 text-center">
              <FileUp className="mx-auto h-6 w-6 text-orange-500" />
              <p className="mt-2 text-[13px] text-n700">{fileName || "Choose the historical LMP CSV"}</p>
              <button
                onClick={() => inputRef.current?.click()}
                className="mt-3 rounded-md bg-orange-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-orange-600"
              >
                Choose CSV
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  const text = await file.text();
                  setFileName(file.name);
                  setCsvText(text);
                  setDryRun(null);
                  setCommitReport(null);
                  await runDryRun(text);
                }}
              />
            </div>

            {loading === "dry-run" && <div className="text-[13px] text-n600"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Running safe dry run…</div>}

            {dryRun && (
              <>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                  {[
                    ["Parsed", dryRun.totalRows],
                    ["Insert", dryRun.inserts],
                    ["Update", dryRun.updates],
                    ["Skipped", dryRun.skipped],
                    ["Ambiguous", dryRun.ambiguous],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-md border border-n200 bg-n50 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-n500">{label}</div>
                      <div className="mt-1 text-[22px] font-semibold text-n900">{value}</div>
                    </div>
                  ))}
                </div>

                {dryRun.unmappedColumns.length > 0 && (
                  <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
                    <AlertTriangle className="mr-1 inline h-4 w-4" />
                    Unmapped columns will be skipped: {dryRun.unmappedColumns.join(", ")}
                  </div>
                )}

                <div className="max-h-[320px] overflow-auto rounded-md border border-n200">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-n50 text-left text-[10px] uppercase tracking-wide text-n500">
                      <tr><th className="px-3 py-2">CSV row</th><th className="px-3 py-2">Action</th><th className="px-3 py-2">Identity</th><th className="px-3 py-2">Fields / reason</th></tr>
                    </thead>
                    <tbody>
                      {dryRun.rows.map((row) => (
                        <tr key={row.rowNumber} className="border-t border-n100 align-top">
                          <td className="px-3 py-2">{row.rowNumber}</td>
                          <td className="px-3 py-2 font-medium">{row.action}</td>
                          <td className="px-3 py-2">{row.identity}</td>
                          <td className="px-3 py-2 text-n500">{row.reason ?? row.changedFields.join(", ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex items-center justify-between gap-3">
                  <div className="text-[12px] text-n500">
                    Commit preserves existing non-empty DB values and queues one full Sheet reconcile after success.
                  </div>
                  <button
                    onClick={commit}
                    disabled={loading !== null || dryRun.commitRows.length === 0}
                    className="rounded-md bg-orange-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading === "commit" ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Committing…</> : "Commit backfill"}
                  </button>
                </div>
              </>
            )}

            {commitReport && (
              <div className="rounded-md border border-sage-200 bg-sage-50 p-4 text-[13px] text-sage-800">
                <CheckCircle2 className="mr-1 inline h-4 w-4" />
                Committed {commitReport.inserted ?? 0} inserts and {commitReport.updated ?? 0} updates.
                {(commitReport.generated_lmp_ids?.length ?? 0) > 0 && (
                  <div className="mt-2 break-words text-[12px]">Generated LMP IDs: {commitReport.generated_lmp_ids?.join(", ")}</div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
