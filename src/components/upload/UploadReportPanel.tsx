import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2, AlertTriangle, XCircle, Download, ChevronDown,
  FileText, ArrowRight, RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ColumnMapping } from "@/lib/mentorUpload";
import type { DataSourceType } from "@/lib/hooks/useDbData";

type UploadResultLike = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  status: "success" | "partial_success" | "failed";
  inFileDuplicates?: number;
  parseSkipReasons?: string[];
  validation_errors?: number;
};

type Props = {
  result: UploadResultLike;
  fileName: string;
  source: DataSourceType;
  headers?: string[];
  mapping?: ColumnMapping[];
  onClose: () => void;
  onUploadAnother?: () => void;
};

const VIEW_ROUTES: Record<DataSourceType, string> = {
  mentor_union: "/mentors",
  alumni_db: "/alumni",
  student_db: "/data-sources?tab=students",
  poc_db: "/data-sources?tab=pocs",
};

const VIEW_LABEL: Record<DataSourceType, string> = {
  mentor_union: "View Mentors",
  alumni_db: "View Alumni",
  student_db: "View Students",
  poc_db: "View POCs",
};

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadSkipReport(fileName: string, reasons: string[]) {
  const csv = "row_or_index,reason\n" + reasons.map((r, i) => {
    const m = r.match(/^Row (\d+)/i);
    const row = m ? m[1] : String(i + 1);
    return `${row},${csvEscape(r)}`;
  }).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName.replace(/\.[^.]+$/, "")}_skipped_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function KpiCard({
  icon, label, value, tone,
}: { icon: string; label: string; value: number; tone: "green" | "blue" | "amber" | "gray" }) {
  const toneCls = {
    green: "bg-sage-50 text-sage-700 border-sage-200",
    blue: "bg-sky-50 text-sky-700 border-sky-200",
    amber: "bg-yellow-50 text-yellow-700 border-yellow-200",
    gray: "bg-n50 text-n700 border-n200",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-3 flex flex-col gap-1", toneCls)}>
      <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-80">
        <span aria-hidden>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="text-[20px] font-semibold leading-none">{value.toLocaleString()}</div>
    </div>
  );
}

export function UploadReportPanel({
  result, fileName, source, headers = [], mapping = [], onClose, onUploadAnother,
}: Props) {
  const navigate = useNavigate();
  const [showSkips, setShowSkips] = useState(true);

  const allSkipReasons = useMemo(() => {
    const parse = result.parseSkipReasons ?? [];
    const errs = result.errors ?? [];
    // De-dup but preserve order
    const seen = new Set<string>();
    return [...parse, ...errs].filter(r => {
      if (seen.has(r)) return false;
      seen.add(r);
      return true;
    });
  }, [result]);

  const mappedFields = useMemo(
    () => mapping.filter(m => m.dbField).map(m => ({ csv: m.csvColumn, db: m.dbField as string })),
    [mapping],
  );
  const skippedHeaders = useMemo(() => {
    if (mapping.length) {
      return mapping.filter(m => !m.dbField).map(m => m.csvColumn);
    }
    return headers;
  }, [mapping, headers]);

  const banner =
    result.status === "success"
      ? { tone: "green" as const, icon: CheckCircle2, title: "All records imported successfully", sub: `${result.inserted + result.updated} record${(result.inserted + result.updated) === 1 ? "" : "s"} saved from ${fileName}.` }
      : result.status === "partial_success"
      ? { tone: "amber" as const, icon: AlertTriangle, title: "Import complete with some issues", sub: `${result.skipped} row${result.skipped === 1 ? "" : "s"} were skipped. Review below.` }
      : { tone: "red" as const, icon: XCircle, title: "Import failed — no records saved", sub: "Fix the issues below and try again." };

  const bannerCls = {
    green: "border-sage-200 bg-sage-50 text-sage-800",
    amber: "border-yellow-200 bg-yellow-50 text-yellow-800",
    red: "border-coral-200 bg-coral-50 text-coral-800",
  }[banner.tone];

  return (
    <div className="space-y-5">
      {/* Banner */}
      <div className={cn("rounded-lg border p-3 flex items-start gap-3", bannerCls)}>
        <banner.icon className="h-4 w-4 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{banner.title}</p>
          <p className="text-[12px] opacity-80 mt-0.5 truncate">{banner.sub}</p>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KpiCard icon="✅" label="Inserted" value={result.inserted} tone="green" />
        <KpiCard icon="🔄" label="Updated" value={result.updated} tone="blue" />
        <KpiCard icon="⚠️" label="Skipped" value={result.skipped} tone="amber" />
        <KpiCard icon="🔁" label="Duplicates" value={result.inFileDuplicates ?? 0} tone="gray" />
      </div>

      {/* Skip reasons */}
      {allSkipReasons.length > 0 && (
        <div className="rounded-lg border border-n200 bg-card">
          <button
            type="button"
            onClick={() => setShowSkips(s => !s)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-left"
          >
            <span className="text-[12.5px] font-medium text-n800">
              Why were rows skipped?{" "}
              <span className="text-n500 font-normal">({allSkipReasons.length})</span>
            </span>
            <ChevronDown className={cn("h-4 w-4 text-n500 transition-transform", showSkips && "rotate-180")} />
          </button>
          {showSkips && (
            <div className="border-t border-n100 max-h-56 overflow-y-auto">
              <ul className="divide-y divide-n100">
                {allSkipReasons.slice(0, 100).map((r, i) => {
                  const m = r.match(/^Row (\d+):?\s*(.*)$/i);
                  const rowNum = m?.[1];
                  const rest = m?.[2] || r;
                  return (
                    <li key={i} className="px-3 py-1.5 text-[12px] text-n700 flex gap-2">
                      <span className="font-mono text-[11px] text-n500 shrink-0 w-12">
                        {rowNum ? `#${rowNum}` : `—`}
                      </span>
                      <span className="min-w-0 break-words">{rest}</span>
                    </li>
                  );
                })}
                {allSkipReasons.length > 100 && (
                  <li className="px-3 py-2 text-[11px] text-n500 italic">
                    …and {allSkipReasons.length - 100} more — download the full report.
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Mapped vs skipped fields */}
      {(mappedFields.length > 0 || skippedHeaders.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-lg border border-n200 bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-sage-500" />
              <span className="text-[12px] font-medium text-n800">
                Mapped fields <span className="text-n500 font-normal">({mappedFields.length})</span>
              </span>
            </div>
            {mappedFields.length === 0 ? (
              <p className="text-[11.5px] text-n500">No fields mapped.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {mappedFields.map(f => (
                  <span
                    key={f.csv}
                    className="inline-flex items-center gap-1 rounded-md border border-sage-200 bg-sage-50 text-sage-700 text-[11px] px-2 py-0.5"
                    title={`${f.csv} → ${f.db}`}
                  >
                    <span className="font-mono">{f.csv}</span>
                    <ArrowRight className="h-3 w-3 opacity-60" />
                    <span>{f.db}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-lg border border-n200 bg-card p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />
              <span className="text-[12px] font-medium text-n800">
                Unmapped CSV columns <span className="text-n500 font-normal">({skippedHeaders.length})</span>
              </span>
            </div>
            {skippedHeaders.length === 0 ? (
              <p className="text-[11.5px] text-n500">All columns mapped.</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {skippedHeaders.map(h => (
                  <span
                    key={h}
                    className="inline-flex items-center rounded-md border border-n200 bg-n50 text-n600 text-[11px] font-mono px-2 py-0.5"
                  >
                    {h}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
        {allSkipReasons.length > 0 && (
          <button
            onClick={() => downloadSkipReport(fileName, allSkipReasons)}
            className="inline-flex items-center gap-1.5 rounded-md border border-n200 bg-card hover:bg-n50 text-n800 text-[12px] font-medium px-3 py-1.5"
          >
            <Download className="h-3.5 w-3.5" />
            Download skip report
          </button>
        )}
        {onUploadAnother && (
          <button
            onClick={onUploadAnother}
            className="inline-flex items-center gap-1.5 rounded-md border border-n200 bg-card hover:bg-n50 text-n800 text-[12px] font-medium px-3 py-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Upload another
          </button>
        )}
        <button
          onClick={onClose}
          className="rounded-md border border-n200 bg-card hover:bg-n50 text-n700 text-[12px] font-medium px-3 py-1.5"
        >
          Close
        </button>
        {(result.inserted + result.updated) > 0 && (
          <button
            onClick={() => { onClose(); navigate(VIEW_ROUTES[source]); }}
            className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[12.5px] font-medium px-3.5 py-1.5 shadow-sm"
          >
            <FileText className="h-3.5 w-3.5" />
            {VIEW_LABEL[source]}
          </button>
        )}
      </div>
    </div>
  );
}
