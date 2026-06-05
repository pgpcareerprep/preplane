import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, FileText, Loader2, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUploadHistory } from "@/lib/hooks/useDbData";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

type SourceFilter = "all" | "mentor_union" | "alumni_db" | "student_db";

const SOURCE_LABEL: Record<Exclude<SourceFilter, "all">, string> = {
  mentor_union: "Mentor Union",
  alumni_db: "Alumni DB",
  student_db: "Student DB",
};

const FILTERS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "mentor_union", label: "Mentor Union" },
  { key: "alumni_db", label: "Alumni DB" },
  { key: "student_db", label: "Student DB" },
];

const PAGE_SIZE = 20;

interface HistoryRow {
  id: string;
  source_type: string;
  file_name: string | null;
  total_rows: number;
  inserted_rows: number;
  updated_rows: number;
  skipped_rows: number;
  error_rows: number;
  status: string;
  validation_summary: Record<string, unknown> | null;
  uploaded_by_admin_email: string | null;
  created_at: string;
}

function effectiveStatus(r: HistoryRow): "success" | "partial_success" | "failed" {
  if (r.status === "failed") return "failed";
  if (r.error_rows > 0) return "partial_success";
  return "success";
}

const STATUS_PILL: Record<"success" | "partial_success" | "failed", string> = {
  success: "bg-sage-50 border-sage-200 text-sage-700",
  partial_success: "bg-yellow-50 border-yellow-200 text-yellow-700",
  failed: "bg-coral-50 border-coral-200 text-coral-700",
};
const STATUS_LABEL: Record<"success" | "partial_success" | "failed", string> = {
  success: "Success",
  partial_success: "Partial",
  failed: "Failed",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function sourceLabel(s: string): string {
  return SOURCE_LABEL[s as keyof typeof SOURCE_LABEL] ?? s;
}

export default function HistoryPage() {
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [page, setPage] = useState(1);
  const [active, setActive] = useState<HistoryRow | null>(null);

  const { data, isLoading } = useUploadHistory(filter);
  const rows = (data ?? []) as HistoryRow[];

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [rows, safePage],
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/data-sources"
          className="inline-flex items-center gap-1 text-[12px] text-n500 hover:text-n800 mb-2"
        >
          <ArrowLeft className="h-3 w-3" /> Back to Data Sources
        </Link>
        <PageHeader
          eyebrow="Workspace"
          title="Import history"
          subtitle="Every CSV/XLSX upload across data sources, with row-level error reports."
        />
      </div>


      <div className="rounded-xl bg-card border border-n200 shadow-sm p-3">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={cn(
                "px-3 py-1 rounded-full text-[12px] font-medium border transition-colors",
                filter === f.key
                  ? "bg-orange-50 border-orange-200 text-orange-700"
                  : "bg-card border-n300 text-n600 hover:bg-n100",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-xl bg-card border border-n200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-n500 text-[11px] uppercase tracking-[0.5px] bg-n50">
                <th className="font-medium px-4 py-2.5">Date</th>
                <th className="font-medium px-3 py-2.5">Source</th>
                <th className="font-medium px-3 py-2.5">File name</th>
                <th className="font-medium px-3 py-2.5 text-right">Total</th>
                <th className="font-medium px-3 py-2.5 text-right">Inserted</th>
                <th className="font-medium px-3 py-2.5 text-right">Updated</th>
                <th className="font-medium px-3 py-2.5 text-right">Skipped</th>
                <th className="font-medium px-3 py-2.5 text-right">Errors</th>
                <th className="font-medium px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-n400">
                    <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                    Loading history…
                  </td>
                </tr>
              )}
              {!isLoading &&
                pageRows.map((r, idx) => {
                  const st = effectiveStatus(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setActive(r)}
                      className={cn(
                        "border-t border-n100 cursor-pointer transition-colors hover:bg-orange-50/40",
                        idx % 2 === 1 && "bg-n50/40",
                      )}
                    >
                      <td className="px-4 py-2.5 text-n600 whitespace-nowrap">{formatDate(r.created_at)}</td>
                      <td className="px-3 py-2.5">
                        <span className="rounded-full bg-n100 border border-n200 text-n700 px-2 py-0.5 text-[11px] font-medium">
                          {sourceLabel(r.source_type)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-n800 max-w-[280px] truncate" title={r.file_name ?? ""}>
                        {r.file_name || <span className="text-n400">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.total_rows}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-sage-700">{r.inserted_rows}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-blue-700">{r.updated_rows}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-n600">{r.skipped_rows}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {r.error_rows > 0 ? (
                          <span className="text-coral-700 font-medium">{r.error_rows}</span>
                        ) : (
                          <span className="text-n400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_PILL[st])}>
                          {STATUS_LABEL[st]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!isLoading && rows.length === 0 && (
          <div className="text-center py-16">
            <FileText className="mx-auto h-10 w-10 text-n300" strokeWidth={1.25} />
            <p className="mt-2 text-[14px] text-n500">No imports yet.</p>
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-n100 text-[12px] text-n500">
            <div>
              Showing {(safePage - 1) * PAGE_SIZE + 1}–
              {Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={safePage === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-n200 hover:bg-n50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3 w-3" /> Prev
              </button>
              <span className="tabular-nums">Page {safePage} of {totalPages}</span>
              <button
                disabled={safePage === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-n200 hover:bg-n50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </section>

      <ImportRunDrawer run={active} onClose={() => setActive(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Detail drawer
// ─────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ErrorEntry {
  row: number | string;
  reason: string;
}

function normalizeErrors(raw: unknown): ErrorEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e, i) => {
    if (typeof e === "string") return { row: i + 1, reason: e };
    if (e && typeof e === "object") {
      const obj = e as Record<string, unknown>;
      return {
        row: (obj.row as number | string) ?? i + 1,
        reason: (obj.reason as string) ?? JSON.stringify(obj),
      };
    }
    return { row: i + 1, reason: String(e) };
  });
}

function ImportRunDrawer({ run, onClose }: { run: HistoryRow | null; onClose: () => void }) {
  const open = !!run;
  const summary = (run?.validation_summary ?? {}) as Record<string, unknown>;
  const errors = normalizeErrors(summary.errors);
  const completedAt = typeof summary.completed_at === "string" ? summary.completed_at : null;
  const durationMs = run && completedAt
    ? new Date(completedAt).getTime() - new Date(run.created_at).getTime()
    : null;
  const durationLabel = durationMs !== null && durationMs >= 0
    ? durationMs < 1000
      ? `${durationMs} ms`
      : durationMs < 60_000
        ? `${(durationMs / 1000).toFixed(1)}s`
        : `${Math.floor(durationMs / 60_000)}m ${Math.floor((durationMs % 60_000) / 1000)}s`
    : "—";

  const handleDownload = () => {
    if (!run) return;
    const header = "row,reason\n";
    const body = errors.map((e) => `${csvEscape(e.row)},${csvEscape(e.reason)}`).join("\n");
    const ts = run.created_at.replace(/[:.]/g, "-");
    downloadCsv(`${run.source_type}-import-errors-${ts}.csv`, header + body);
  };

  const otherSummary = Object.entries(summary).filter(([k]) => k !== "errors" && k !== "completed_at");

  const st = run ? effectiveStatus(run) : "success";

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto">
        {run && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-2 mb-1">
                <span className="rounded-full bg-n100 border border-n200 text-n700 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.4px]">
                  {sourceLabel(run.source_type)}
                </span>
                <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", STATUS_PILL[st])}>
                  {STATUS_LABEL[st]}
                </span>
              </div>
              <SheetTitle className="text-[16px] break-words">{run.file_name || "Untitled import"}</SheetTitle>
              <SheetDescription className="text-[12px]">
                {formatDate(run.created_at)}
                {run.uploaded_by_admin_email ? ` · ${run.uploaded_by_admin_email}` : ""}
              </SheetDescription>
            </SheetHeader>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <Stat label="Total" value={run.total_rows} />
              <Stat label="Inserted" value={run.inserted_rows} tone="good" />
              <Stat label="Updated" value={run.updated_rows} tone="info" />
              <Stat label="Skipped" value={run.skipped_rows} />
              <Stat label="Errors" value={run.error_rows} tone={run.error_rows > 0 ? "bad" : "neutral"} />
              <Stat label="Duration" value={durationLabel} />
            </div>

            {otherSummary.length > 0 && (
              <div className="mt-6">
                <div className="text-[11px] uppercase tracking-[0.5px] text-n500 font-medium mb-2">Validation summary</div>
                <div className="rounded-md border border-n200 divide-y divide-n100">
                  {otherSummary.map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 px-3 py-2 text-[12px]">
                      <span className="text-n500">{k}</span>
                      <span className="text-n800 text-right break-words font-mono text-[11px] max-w-[60%]">
                        {typeof v === "object" ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] uppercase tracking-[0.5px] text-n500 font-medium">
                  Errors ({errors.length})
                </div>
                {errors.length > 0 && (
                  <Button size="sm" variant="outline" onClick={handleDownload}>
                    <Download className="h-3.5 w-3.5 mr-1.5" />
                    Download error report
                  </Button>
                )}
              </div>
              {errors.length === 0 ? (
                <div className="text-[12px] text-n400 italic px-1">No errors recorded.</div>
              ) : (
                <div className="rounded-md border border-n200 max-h-[40vh] overflow-y-auto">
                  <ul className="divide-y divide-n100 text-[12px]">
                    {errors.slice(0, 200).map((e, i) => (
                      <li key={i} className="px-3 py-2">
                        <span className="text-n500 mr-2 tabular-nums">Row {e.row}</span>
                        <span className="text-n800">— {e.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {errors.length > 200 && (
                    <div className="px-3 py-2 text-[11px] text-n500 border-t border-n100 bg-n50/50">
                      Showing first 200 of {errors.length}. Download the full report for all errors.
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Stat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "good" | "info" | "bad" | "neutral";
}) {
  const cls = {
    good: "text-sage-700 bg-sage-50 border-sage-200",
    info: "text-blue-700 bg-blue-50 border-blue-200",
    bad: "text-coral-700 bg-coral-50 border-coral-200",
    neutral: "text-n800 bg-n50 border-n200",
  }[tone];
  return (
    <div className={cn("rounded-md border px-3 py-2", cls)}>
      <div className="text-[10px] uppercase tracking-[0.5px] opacity-70 font-medium">{label}</div>
      <div className="text-[16px] font-semibold mt-0.5 tabular-nums">{value}</div>
    </div>
  );
}
