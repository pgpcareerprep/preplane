import { useRef, useState, useMemo } from "react";
import Papa from "papaparse";
import { Upload, X, ArrowRight, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useRole } from "@/lib/rolesContext";
import {
  MU_EXPECTED_COLS, ALU_EXPECTED_COLS, STU_EXPECTED_COLS, POC_EXPECTED_COLS,
  MU_TEMPLATE_HEADERS, ALU_TEMPLATE_HEADERS, STU_TEMPLATE_HEADERS, POC_TEMPLATE_HEADERS,
  downloadCsvTemplate,
} from "@/lib/csvTemplates";
import {
  autoMapColumns, uploadMentors, DB_FIELDS,
  type ColumnMapping, type MentorCsvRow,
} from "@/lib/mentorUpload";
import {
  parseAlumniCsvRows, uploadAlumniRecords,
  ALU_DB_FIELDS, autoMapAlumniColumns,
} from "@/lib/alumniStore";
import {
  autoMapStudentColumns, uploadStudents, STUDENT_DB_FIELDS, STUDENT_REQUIRED_FIELDS,
} from "@/lib/studentUpload";
import {
  autoMapPocColumns, uploadPocs, POC_DB_FIELDS, POC_REQUIRED_FIELDS,
} from "@/lib/pocUpload";
import { invalidateDataSourceCaches, type DataSourceType } from "@/lib/hooks/useDbData";
import { validateMentorRow, validateAlumniRow, validateStudentRow } from "@/lib/uploadValidation";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { loadSavedMapping, saveMapping, clearMapping } from "@/lib/columnMappingStore";
import { UploadReportPanel } from "@/components/upload/UploadReportPanel";

type Step = "pick" | "map" | "preview" | "uploading" | "done";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function errorsToCsv(errors: string[]): string {
  return "Row Number,Error Message\n" + errors.map((e, i) => `${i + 1},${csvEscape(e)}`).join("\n");
}

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const headers = Array.from(
    rows.reduce((set, r) => { Object.keys(r).forEach(k => set.add(k)); return set; }, new Set<string>())
  );
  const headerLine = headers.map(csvEscape).join(",");
  const lines = rows.map(r => headers.map(h => {
    const v = (r as any)[h];
    if (Array.isArray(v)) return csvEscape(v.join("; "));
    return csvEscape(v);
  }).join(","));
  return [headerLine, ...lines].join("\n");
}

function tsStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const TITLES: Record<DataSourceType, string> = {
  mentor_union: "Mentor Union",
  alumni_db: "Alumni DB",
  student_db: "Student Database",
  poc_db: "POC Database",
};

const REQUIRED_FIELDS: Record<DataSourceType, string[]> = {
  mentor_union: ["name|first_name", "designation", "company", "functional_domain", "industry", "skill_tags"],
  alumni_db: ["student_name", "current_company|current_role_title"],
  student_db: STUDENT_REQUIRED_FIELDS,
  poc_db: POC_REQUIRED_FIELDS,
};

const NEEDS_MAPPING: Record<DataSourceType, boolean> = {
  mentor_union: true,
  alumni_db: true,
  student_db: true,
  poc_db: true,
};

const FIELD_OPTIONS: Record<DataSourceType, ReadonlyArray<{ key: string; label: string }>> = {
  mentor_union: DB_FIELDS,
  alumni_db: ALU_DB_FIELDS,
  student_db: STUDENT_DB_FIELDS,
  poc_db: POC_DB_FIELDS,
};

export function UploadCsvModal({
  source, open, onOpenChange,
}: {
  source: DataSourceType;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user, role } = useRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState<Step>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<MentorCsvRow[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping[]>([]);
  const [usingSavedMapping, setUsingSavedMapping] = useState(false);
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [result, setResult] = useState<{ inserted: number; updated: number; skipped: number; errors: string[] } | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

  const expectedCols =
    source === "mentor_union" ? MU_EXPECTED_COLS :
    source === "alumni_db" ? ALU_EXPECTED_COLS :
    source === "poc_db" ? POC_EXPECTED_COLS :
    STU_EXPECTED_COLS;
  const templateHeaders =
    source === "mentor_union" ? MU_TEMPLATE_HEADERS :
    source === "alumni_db" ? ALU_TEMPLATE_HEADERS :
    source === "poc_db" ? POC_TEMPLATE_HEADERS :
    STU_TEMPLATE_HEADERS;
  const templateName =
    source === "mentor_union" ? "mentor_union_template.csv" :
    source === "alumni_db" ? "alumni_db_template.csv" :
    source === "poc_db" ? "poc_db_template.csv" :
    "students_template.csv";
  const needsMapping = NEEDS_MAPPING[source];
  const fieldOptions = FIELD_OPTIONS[source];

  const autoMapFor = (fields: string[]): ColumnMapping[] => {
    if (source === "mentor_union") return autoMapColumns(fields);
    if (source === "student_db") return autoMapStudentColumns(fields);
    if (source === "alumni_db") return autoMapAlumniColumns(fields);
    if (source === "poc_db") return autoMapPocColumns(fields);
    return fields.map((h) => ({ csvColumn: h, dbField: "" }));
  };

  const reset = () => {
    setFile(null); setStep("pick"); setHeaders([]); setRows([]); setMapping([]); setResult(null); setShowAllErrors(false);
    setUsingSavedMapping(false); setSaveAsDefault(false);
  };

  const close = () => { reset(); onOpenChange(false); };

  const loadMappingWithSavedAsync = async (fields: string[]): Promise<ColumnMapping[]> => {
    try {
      const saved = await loadSavedMapping(source);
      if (saved && saved.length) {
        const lookup = new Map(saved.map((p) => [p.csvColumn.toLowerCase(), p.dbField]));
        const initial = fields.map((h) => ({ csvColumn: h, dbField: lookup.get(h.toLowerCase()) ?? "" }));
        if (initial.some((m) => m.dbField)) {
          setUsingSavedMapping(true);
          return initial;
        }
      }
    } catch { /* ignore */ }
    setUsingSavedMapping(false);
    return autoMapFor(fields);
  };

  const resetSavedMapping = async () => {
    try { await clearMapping(source); } catch { /* ignore */ }
    setUsingSavedMapping(false);
    setMapping(autoMapFor(headers));
    toast.success("Saved mapping cleared");
  };

  const applyParsed = async (fields: string[], data: MentorCsvRow[]) => {
    if (!fields.length) { toast.error("Could not detect headers"); return; }
    setHeaders(fields);
    setRows(data);
    setMapping(await loadMappingWithSavedAsync(fields));
    setStep("map");
  };

  const handleFile = (f: File) => {
    setFile(f);
    const isCsv = /\.csv$/i.test(f.name);
    const isXlsx = /\.xlsx?$/i.test(f.name);
    if (isCsv) {
      Papa.parse<MentorCsvRow>(f, {
        header: true, skipEmptyLines: true,
        complete: (res) => applyParsed(res.meta.fields || [], res.data),
        error: () => toast.error("Failed to parse CSV"),
      });
    } else if (isXlsx) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const XLSX = await import("xlsx");
          const buf = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(buf, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          if (!ws) { toast.error("Workbook has no sheets"); return; }
          const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
          const data = raw.map(r => {
            const out: Record<string, string> = {};
            for (const k of Object.keys(r)) out[k] = r[k] == null ? "" : String(r[k]);
            return out;
          }) as MentorCsvRow[];
          const fieldSet = new Set<string>();
          data.forEach(r => Object.keys(r).forEach(k => fieldSet.add(k)));
          applyParsed(Array.from(fieldSet), data);
        } catch {
          toast.error("Failed to parse Excel file");
        }
      };
      reader.onerror = () => toast.error("Failed to read file");
      reader.readAsArrayBuffer(f);
    } else {
      toast.error("Unsupported file type. Use CSV or Excel.");
    }
  };

  // ── Validation ──
  const muMissingRequired = useMemo(() => {
    if (!needsMapping) return [] as string[];
    const mappedFields = new Set(mapping.filter(m => m.dbField).map(m => m.dbField));
    const missing: string[] = [];
    for (const req of REQUIRED_FIELDS[source]) {
      const opts = req.split("|");
      if (!opts.some(o => mappedFields.has(o))) missing.push(opts.join(" or "));
    }
    return missing;
  }, [mapping, source, needsMapping]);

  const aluResult = useMemo(() => {
    if (source !== "alumni_db" || !rows.length) return { parsed: [], skipped: [] as { row: number; reason: string }[] };
    // Use confirmed mapping when available; fall back to header-based auto-resolve.
    const mapped = mapping.filter(m => m.dbField);
    return mapped.length
      ? parseAlumniCsvRows(rows, mapped)
      : parseAlumniCsvRows(rows, headers);
  }, [rows, headers, source, mapping]);
  const aluParsed = aluResult.parsed;
  const aluSkipped = aluResult.skipped;

  const aluMissingHeaders = useMemo(() => {
    if (source !== "alumni_db") return [] as string[];
    const mappedFields = new Set(mapping.filter(m => m.dbField).map(m => m.dbField));
    const lower = headers.map(h => h.trim().toLowerCase());
    const hasName = mappedFields.has("student_name") || lower.includes("student name") || lower.includes("name");
    const hasCompanyOrRole = mappedFields.has("current_company") || mappedFields.has("current_role_title") ||
      lower.includes("current company") || lower.includes("company") ||
      lower.includes("current role") || lower.includes("role");
    const missing: string[] = [];
    if (!hasName) missing.push("Student Name");
    if (!hasCompanyOrRole) missing.push("Current Company or Current Role");
    return missing;
  }, [headers, source, mapping]);

  const updateMapping = (csvCol: string, dbField: string) =>
    setMapping(prev => prev.map(m => m.csvColumn === csvCol ? { ...m, dbField } : m));

  const previewRows: Record<string, string>[] = useMemo(() => {
    if (source === "mentor_union" || source === "student_db" || source === "poc_db") {
      return rows.slice(0, 5);
    }
    return aluParsed.slice(0, 5).map(r => ({
      "Student Name": r.student_name,
      "Current Company": r.current_company || "",
      "Current Role": r.current_role_title || "",
      "Cohort": r.cohort || "",
      "Email": r.mu_email_id || "",
    }));
  }, [rows, aluParsed, source]);

  // Build per-row validation across the FULL dataset for accurate summary counts.
  const validation = useMemo(() => {
    const results: { row: number; errors: string[] }[] = [];
    if (source === "alumni_db") {
      aluParsed.forEach((r, i) => results.push({ row: i, errors: validateAlumniRow(r, i) }));
    } else if (source === "mentor_union" || source === "student_db") {
      const mapped = mapping.reduce<Record<string, string>>((acc, m) => {
        if (m.dbField) acc[m.csvColumn] = m.dbField;
        return acc;
      }, {});
      rows.forEach((row, i) => {
        const rec: Record<string, unknown> = {};
        let firstName = "", lastName = "";
        for (const [csvCol, dbField] of Object.entries(mapped)) {
          const val = (row[csvCol] || "").trim();
          if (!val) continue;
          if (dbField === "first_name") firstName = val;
          else if (dbField === "last_name") lastName = val;
          else rec[dbField] = val;
        }
        if (!rec.name && (firstName || lastName)) {
          rec.name = [firstName, lastName].filter(Boolean).join(" ").trim();
        }
        const errs = source === "mentor_union"
          ? validateMentorRow(rec, i)
          : validateStudentRow(rec, i);
        results.push({ row: i, errors: errs });
      });
    }
    const invalid = results.filter(r => r.errors.length > 0);
    return { results, validCount: results.length - invalid.length, invalidCount: invalid.length, invalid };
  }, [source, rows, mapping, aluParsed]);

  const downloadValidationReport = () => {
    const csv = "row_number,errors\n" + validation.invalid
      .map(r => `${r.row + 2},${csvEscape(r.errors.join(" | "))}`).join("\n");
    downloadCsv(`${(file?.name || "upload").replace(/\.[^.]+$/, "")}_validation_${tsStamp()}.csv`, csv);
  };


  const doUpload = async () => {
    setStep("uploading");
    try {
      const admin = { id: user.id, email: user.email, name: user.name };
      if (source === "mentor_union") {
        const r = await uploadMentors(rows, mapping, admin, file?.name || "mentor_union.csv");
        setResult(r);
      } else if (source === "student_db") {
        const r = await uploadStudents(rows, mapping, admin, file?.name || "students.csv");
        setResult(r);
      } else if (source === "poc_db") {
        const r = await uploadPocs(rows, mapping, admin, file?.name || "poc_db.csv");
        setResult(r);
      } else {
        const r = await uploadAlumniRecords(
          aluParsed,
          file?.name || "alumni_db.csv",
          admin,
          aluSkipped.map(s => s.reason),
        );
        setResult(r);
      }
      if (needsMapping && saveAsDefault) {
        try {
          await saveMapping(source, mapping.filter(m => m.dbField), user?.email);
          toast.success("Saved column mapping for future uploads");
        } catch { /* ignore */ }
      }
      invalidateDataSourceCaches(qc, source);
      setStep("done");
    } catch (e: any) {
      const msg = String(e?.message || e?.error_description || "");
      const code = String(e?.code || "");
      const isRls =
        /row[- ]level security|rls|violates.*policy|new row violates/i.test(msg) ||
        code === "42501" || e?.status === 401 || e?.status === 403;
      if (isRls) {
        toast.error("Upload failed: You need admin permissions to upload data. Contact your administrator.");
      } else {
        toast.error(`Upload failed: ${msg || "unknown error"}`);
      }
      setStep(needsMapping ? "map" : "preview");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(true); }}>
      <DialogContent className="sm:max-w-[760px] max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200 shrink-0">
          <DialogTitle className="text-[16px] font-semibold text-n900">
            Upload CSV — {TITLES[source]}
          </DialogTitle>
          <p className="text-[12px] text-n500 mt-0.5">
            CSV is shared globally. All users will see the updated database.
          </p>
        </DialogHeader>

        {!isAdmin && (
          <div className="p-6 text-[13px] text-coral-600">
            <AlertCircle className="inline h-4 w-4 mr-1" /> Only admins can upload CSV files.
          </div>
        )}

        {isAdmin && (
        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
          {step === "pick" && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault(); setDragging(false);
                  const f = e.dataTransfer.files?.[0]; if (f) handleFile(f);
                }}
                className={cn(
                  "rounded-md border-2 border-dashed p-8 text-center transition-colors",
                  dragging ? "border-orange-500 bg-orange-50" : "border-orange-200 bg-orange-50/40",
                )}
              >
                <div className="mx-auto h-10 w-10 rounded-md bg-card text-orange-500 grid place-items-center shadow-sm mb-2">
                  <Upload className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <p className="text-[13px] text-n700">
                  Drop a CSV or Excel file here or{" "}
                  <button onClick={() => inputRef.current?.click()} className="text-orange-600 font-medium hover:underline">
                    browse
                  </button>
                </p>
                <p className="text-[11px] text-n500 mt-1">CSV or Excel · max 20 MB</p>
                <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="label-eyebrow">Expected columns</div>
                  <button
                    onClick={() => downloadCsvTemplate(templateHeaders, templateName)}
                    className="inline-flex items-center gap-1.5 text-[12px] text-orange-600 hover:underline"
                  >
                    <Download className="h-3 w-3" /> Download template
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {expectedCols.map(c => (
                    <div key={c.label} className="flex items-center justify-between text-[12px] rounded-md border border-n200 bg-card px-3 py-2">
                      <span className="text-n700 truncate">{c.label}</span>
                      <span className={cn("inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.5px] shrink-0",
                        c.required ? "text-coral-500" : "text-n400")}>
                        <span className={cn("h-1.5 w-1.5 rounded-full", c.required ? "bg-coral-400" : "bg-n300")} />
                        {c.required ? "Required" : "Optional"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === "map" && needsMapping && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <span className="text-[13px] font-medium text-n900">{file?.name}</span>
                  <span className="text-[11px] text-n500">{rows.length} rows</span>
                </div>
                <button onClick={reset} className="text-[12px] text-n500 hover:text-n900">Pick another file</button>
              </div>
              {usingSavedMapping && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-[12px] text-orange-800">
                  <span>Using saved mapping from last upload.</span>
                  <button onClick={resetSavedMapping} className="text-[12px] font-medium text-orange-700 hover:text-orange-900 underline underline-offset-2">Reset</button>
                </div>
              )}
              <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
                {mapping.map(m => {
                  const unmapped = !m.dbField;
                  return (
                    <div key={m.csvColumn} className="flex items-start gap-2 text-[12px]">
                      <span className="w-[40%] text-n700 truncate bg-card border border-n200 rounded-md px-2 py-1.5">{m.csvColumn}</span>
                      <ArrowRight className="h-3 w-3 text-n400 shrink-0 mt-2.5" />
                      <div className="w-[40%] flex flex-col gap-0.5">
                        <select
                          value={m.dbField}
                          onChange={(e) => updateMapping(m.csvColumn, e.target.value)}
                          className={cn("w-full rounded-md border px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-orange-400",
                            m.dbField
                              ? "border-sage-300 bg-sage-50 text-sage-700"
                              : "border-amber-300 bg-amber-50 text-amber-800 ring-1 ring-amber-200")}
                        >
                          <option value="">— skip —</option>
                          {fieldOptions.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
                        </select>
                        {unmapped && (
                          <span className="text-[11px] text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> Could not auto-detect — please map manually
                          </span>
                        )}
                      </div>
                      {m.dbField
                        ? <span className="h-1.5 w-1.5 rounded-full bg-sage-400 shrink-0 mt-2.5" />
                        : <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-2" />}
                    </div>
                  );
                })}
              </div>
              {muMissingRequired.length > 0 && (
                <div className="mt-3 flex items-start gap-1.5 text-[12px] text-coral-600">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Missing required mappings: <strong>{muMissingRequired.join(", ")}</strong></span>
                </div>
              )}
              <label className="mt-3 flex items-center gap-2 text-[12px] text-n700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={saveAsDefault}
                  onChange={(e) => setSaveAsDefault(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-n300 text-orange-500 focus:ring-orange-400"
                />
                Save this mapping as default for future uploads
              </label>
              <div className="mt-4 flex items-center gap-2">
                <button
                  disabled={muMissingRequired.length > 0}
                  onClick={() => setStep("preview")}
                  className={cn("inline-flex items-center gap-2 rounded-md text-[13px] font-medium px-4 py-2 shadow-sm transition-colors",
                    muMissingRequired.length === 0 ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-n200 text-n400 cursor-not-allowed")}
                >
                  Continue → Preview
                </button>
                <button onClick={close} className="text-[12px] text-n500 hover:text-n700 px-2 py-2">Cancel</button>
              </div>
            </div>
          )}

          {step === "preview" && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-orange-500" />
                  <span className="text-[13px] font-medium text-n900">{file?.name}</span>
                  <span className="text-[11px] text-n500">
                    {source === "alumni_db" ? `${aluParsed.length} valid rows` : `${rows.length} rows`}
                  </span>
                </div>
                <button onClick={reset} className="text-[12px] text-n500 hover:text-n900">Pick another file</button>
              </div>

              {source === "alumni_db" && aluMissingHeaders.length > 0 && (
                <div className="mb-3 flex items-start gap-1.5 text-[12px] text-coral-600">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>Missing required columns: <strong>{aluMissingHeaders.join(", ")}</strong></span>
                </div>
              )}

              {source === "alumni_db" && aluSkipped.length > 0 && (
                <div className="mb-3 flex items-start justify-between gap-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                  <div className="flex items-start gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>
                      <strong>{aluSkipped.length}</strong> row{aluSkipped.length === 1 ? "" : "s"} were skipped due to missing required fields. Download the error report to see which rows.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const csv = "row_number,reason\n" + aluSkipped
                        .map(s => `${s.row},"${s.reason.replace(/"/g, '""')}"`).join("\n");
                      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${(file?.name || "alumni").replace(/\.[^.]+$/, "")}_skipped_rows.csv`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                    className="inline-flex items-center gap-1 text-amber-700 hover:underline shrink-0 font-medium"
                  >
                    <Download className="h-3 w-3" /> Download error report
                  </button>
                </div>
              )}

              {/* Validation summary */}
              <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
                {validation.invalidCount === 0 ? (
                  <span className="text-sage-700">
                    All {validation.results.length} rows valid
                  </span>
                ) : (
                  <span>
                    <span className="text-sage-700 font-medium">{validation.validCount} rows valid</span>
                    <span className="text-n400"> · </span>
                    <span className="text-amber-700 font-medium">
                      {validation.invalidCount} rows have warnings
                    </span>
                    <span className="text-n500"> (will still upload, warnings logged)</span>
                  </span>
                )}
                {validation.invalidCount > 0 && (
                  <button
                    onClick={downloadValidationReport}
                    className="inline-flex items-center gap-1 text-amber-700 hover:underline shrink-0 font-medium"
                  >
                    <Download className="h-3 w-3" /> Download validation report
                  </button>
                )}
              </div>

              <div className="overflow-auto rounded-md border border-n200 max-h-[320px]">
                <table className="w-full text-[12px]">
                  <thead className="bg-n50 sticky top-0">
                    <tr className="text-left text-n500 text-[10px] uppercase tracking-[0.5px]">
                      <th className="font-medium px-2 py-2 whitespace-nowrap w-[60px]">Valid</th>
                      {Object.keys(previewRows[0] || {}).slice(0, 8).map(k => (
                        <th key={k} className="font-medium px-2 py-2 whitespace-nowrap">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <TooltipProvider delayDuration={150}>
                      {previewRows.map((r, i) => {
                        const v = validation.results[i];
                        const hasErr = v && v.errors.length > 0;
                        return (
                          <tr key={i} className="border-t border-n100">
                            <td className="px-2 py-1.5">
                              {hasErr ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex"><AlertCircle className="h-3.5 w-3.5 text-coral-500" /></span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[280px] text-[11px]">
                                    {v.errors.join(" · ")}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5 text-sage-500" />
                              )}
                            </td>
                            {Object.keys(previewRows[0] || {}).slice(0, 8).map(k => (
                              <td key={k} className="px-2 py-1.5 text-n700 whitespace-nowrap max-w-[180px] truncate">{r[k] || "—"}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </TooltipProvider>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-n500 mt-2">Showing first {previewRows.length} rows.</p>


              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={doUpload}
                  disabled={source === "alumni_db" && aluMissingHeaders.length > 0}
                  className={cn("inline-flex items-center gap-2 rounded-md text-[13px] font-medium px-4 py-2 shadow-sm transition-colors",
                    (source === "alumni_db" && aluMissingHeaders.length > 0)
                      ? "bg-n200 text-n400 cursor-not-allowed"
                      : "bg-orange-500 hover:bg-orange-600 text-white")}
                >
                  Confirm & Upload
                </button>
                {needsMapping && (
                  <button onClick={() => setStep("map")} className="text-[12px] text-n500 hover:text-n700 px-2 py-2">← Back to mapping</button>
                )}
                <button onClick={close} className="text-[12px] text-n500 hover:text-n700 px-2 py-2">Cancel</button>
              </div>
            </div>
          )}

          {step === "uploading" && (
            <div className="text-center py-10">
              <Loader2 className="h-7 w-7 text-orange-500 animate-spin mx-auto mb-3" />
              <p className="text-[13px] text-n700">Uploading…</p>
            </div>
          )}

          {step === "done" && result && (
            <div className="py-2">
              <UploadReportPanel
                result={result as any}
                fileName={file?.name || `${source}.csv`}
                source={source}
                headers={headers}
                mapping={mapping}
                onClose={close}
                onUploadAnother={reset}
              />
            </div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone = "n" }: { label: string; value: number; tone?: "n" | "coral" }) {
  return (
    <div className="rounded-md border border-n200 bg-card px-2 py-2">
      <div className={cn("text-[16px] font-semibold tabular-nums", tone === "coral" ? "text-coral-600" : "text-n900")}>{value}</div>
      <div className="text-[10px] uppercase tracking-[0.5px] text-n500">{label}</div>
    </div>
  );
}
