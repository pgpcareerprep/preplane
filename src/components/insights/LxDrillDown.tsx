import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, Download, ChevronUp, ChevronDown } from "lucide-react";
import type { Process } from "@/lib/lmpProcessQueries";
import { LX_HEX } from "./primitives";

function toCsv(rows: any[], headers: { key: string; label: string }[]): string {
  const esc = (v: any) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = headers.map((h) => esc(h.label)).join(",");
  const body = rows.map((r) => headers.map((h) => esc(r[h.key])).join(",")).join("\n");
  return `${head}\n${body}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ─────────── Status pill (mirrors the dashboards) ─────────── */
const STATUS_COLOR: Record<string, string> = {
  // Legacy ProcessStatus bucket labels (kept for backward compat)
  Ongoing: LX_HEX.info,
  "Offer Received": LX_HEX.yellow,
  Converted: LX_HEX.success,
  "On Hold": LX_HEX.ai,
  Dormant: LX_HEX.orange,
  Closed: LX_HEX.risk,
  // Canonical display labels (from Process.displayStatus)
  "Not Started": LX_HEX.neutral,
  "Prep Ongoing": LX_HEX.info,
  "Prep Done": LX_HEX.teal,
  "Not Converted": LX_HEX.risk,
  "Other Reasons": LX_HEX.orange,
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLOR[status] ?? LX_HEX.neutral;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border"
      style={{ background: `${c}1f`, color: c, borderColor: `${c}55` }}
    >
      {status || "—"}
    </span>
  );
}

/* ─────────── Row shapes ─────────── */
export type LmpDrillRow = Process;

export type StudentDrillRow = {
  id?: string | null;
  email?: string | null;
  name: string;
  cohort?: string;
  program?: string;
  batchLabel?: string;
  primaryDomain?: string;
  secondaryDomain?: string;
  rollNo?: string;
  studentCode?: string;
  phone?: string;
  lmpCount?: number;
  activeLmpCount?: number;
  placementStatus?: string | null;
};

export type PocDrillRow = {
  name: string;
  role?: string;
  activeLoad?: number;
  threshold?: number;
  domains?: string[];
  primaryDomain?: string;
};

export type ConvertedStudentDrillRow = {
  studentName: string;
  studentIdDisplay: string;
  email: string;
  phone: string;
  cohort: string;
  primaryDomain: string;
  secondaryDomain: string;
  company: string;
  role: string;
  lmpDomain: string;
  processType: string;
  lmpStatus: string;
  displayStatus: string;
  prepPoc: string;
  outreachPoc: string;
  closingDate: string;
  lmpCode: string;
  lmpId: string;
  matchStatus: "matched" | "ambiguous" | "not_matched";
};

export type DrillState =
  | { kind: "lmps";               title: string; subtitle?: string; rows: LmpDrillRow[] }
  | { kind: "students";           title: string; subtitle?: string; rows: StudentDrillRow[] }
  | { kind: "pocs";               title: string; subtitle?: string; rows: PocDrillRow[] }
  | { kind: "domains";            title: string; subtitle?: string; rows: { name: string; value: number; sub?: string }[] }
  | { kind: "converted-students"; title: string; subtitle?: string; rows: ConvertedStudentDrillRow[] };

/* ─────────── Modal ─────────── */
export function LxDrillDown({
  state,
  onClose,
}: {
  state: DrillState | null;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  // Sorting for converted-students table
  const [sortKey, setSortKey] = useState<"studentName" | "company" | "closingDate" | "cohort">("studentName");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const filtered = useMemo(() => {
    if (!state) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return state;
    if (state.kind === "lmps") {
      return {
        ...state,
        rows: state.rows.filter((r) => {
          const hay = `${r.company} ${r.role} ${r.r1Shortlisted} ${r.r2Shortlisted} ${r.r3Shortlisted} ${r.convertNames} ${r.finalConvert} ${r.prepPoc} ${r.outreachPoc} ${r.domain} ${r.displayStatus ?? r.status}`.toLowerCase();
          return hay.includes(needle);
        }),
      };
    }
    if (state.kind === "students") {
      return {
        ...state,
        rows: state.rows.filter((r) =>
          `${r.name} ${r.rollNo ?? ""} ${r.studentCode ?? ""} ${r.email ?? ""} ${r.cohort ?? ""} ${r.primaryDomain ?? ""}`.toLowerCase().includes(needle),
        ),
      };
    }
    if (state.kind === "pocs") {
      return {
        ...state,
        rows: state.rows.filter((r) =>
          `${r.name} ${r.role ?? ""} ${(r.domains ?? []).join(" ")}`.toLowerCase().includes(needle),
        ),
      };
    }
    if (state.kind === "converted-students") {
      return {
        ...state,
        rows: state.rows.filter((r) =>
          `${r.studentName} ${r.studentIdDisplay} ${r.email} ${r.phone} ${r.cohort} ${r.company} ${r.role} ${r.lmpDomain} ${r.primaryDomain} ${r.secondaryDomain} ${r.prepPoc} ${r.outreachPoc} ${r.lmpCode}`
            .toLowerCase().includes(needle),
        ),
      };
    }
    return {
      ...state,
      rows: state.rows.filter((r) => `${r.name} ${r.sub ?? ""}`.toLowerCase().includes(needle)),
    };
  }, [state, q]);

  const open = !!state;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setQ(""); onClose(); } }}>
      <DialogContent className="sm:max-w-[920px] max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col rounded-2xl">
        <DialogHeader className="px-6 pt-5 pb-4 border-b" style={{ borderColor: "var(--lx-border, rgba(0,0,0,0.08))" }}>
          <div className="flex items-start justify-between gap-4 pr-8">
            <div className="min-w-0">
              <DialogTitle className="text-[15px] font-semibold truncate">{state?.title}</DialogTitle>
              {state?.subtitle && (
                <DialogDescription className="text-[12px] mt-1">{state.subtitle}</DialogDescription>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (!filtered) return;
                  const safe = (state?.title ?? "drill").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                  let csv = "";
                  if (filtered.kind === "lmps") {
                    const headers = [
                      { key: "company", label: "Company" }, { key: "role", label: "Role" },
                      { key: "student", label: "Student" }, { key: "status", label: "Status" },
                      { key: "prepPoc", label: "Prep POC" }, { key: "outreachPoc", label: "Outreach POC" },
                      { key: "domain", label: "Domain" }, { key: "lastUpdated", label: "Updated" },
                    ];
                    const rows = (filtered.rows as LmpDrillRow[]).map((r) => ({
                      ...r,
                      status: r.displayStatus ?? r.status,
                      student: (r.convertNames || r.finalConvert || r.r3Shortlisted || r.r2Shortlisted || r.r1Shortlisted || "").split(/[,/]/)[0]?.trim() ?? "",
                      lastUpdated: r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString() : "",
                    }));
                    csv = toCsv(rows, headers);
                  } else if (filtered.kind === "students") {
                    csv = toCsv(
                      filtered.rows.map((r) => ({
                        ...r,
                        rollNo: r.rollNo || r.studentCode || r.id || "",
                      })),
                      [
                      { key: "name", label: "Name" },
                      { key: "rollNo", label: "Student ID" },
                      { key: "email", label: "Email" },
                      { key: "phone", label: "Phone" },
                      { key: "cohort", label: "Cohort" },
                      { key: "program", label: "Program" },
                      { key: "batchLabel", label: "Batch" },
                      { key: "primaryDomain", label: "Primary Domain" },
                      { key: "secondaryDomain", label: "Secondary Domain" },
                      { key: "placementStatus", label: "Placement Status" },
                      { key: "activeLmpCount", label: "Active LMPs" }, { key: "lmpCount", label: "Total LMPs" },
                    ]);
                  } else if (filtered.kind === "pocs") {
                    csv = toCsv(
                      (filtered.rows as PocDrillRow[]).map((r) => ({ ...r, domains: (r.domains ?? (r.primaryDomain ? [r.primaryDomain] : [])).join("; ") })),
                      [
                        { key: "name", label: "Name" }, { key: "role", label: "Role" },
                        { key: "activeLoad", label: "Active load" }, { key: "threshold", label: "Threshold" },
                        { key: "domains", label: "Domains" },
                      ],
                    );
                  } else if (filtered.kind === "converted-students") {
                    csv = toCsv(
                      (filtered.rows as ConvertedStudentDrillRow[]).map((r) => ({
                        ...r,
                        closingDate: r.closingDate && r.closingDate !== "—"
                          ? new Date(r.closingDate).toLocaleDateString() : r.closingDate,
                      })),
                      [
                        { key: "studentName", label: "Student Name" },
                        { key: "studentIdDisplay", label: "Student ID" },
                        { key: "email", label: "Email" },
                        { key: "phone", label: "Phone" },
                        { key: "cohort", label: "Cohort" },
                        { key: "primaryDomain", label: "Primary Domain" },
                        { key: "secondaryDomain", label: "Secondary Domain" },
                        { key: "company", label: "Company" },
                        { key: "role", label: "Role" },
                        { key: "lmpDomain", label: "LMP Domain" },
                        { key: "processType", label: "Process Type" },
                        { key: "displayStatus", label: "LMP Status" },
                        { key: "prepPoc", label: "Prep POC" },
                        { key: "outreachPoc", label: "Outreach POC" },
                        { key: "closingDate", label: "Closing Date" },
                        { key: "lmpCode", label: "LMP ID" },
                      ],
                    );
                  } else {
                    csv = toCsv(filtered.rows, [
                      { key: "name", label: "Name" }, { key: "value", label: "Value" }, { key: "sub", label: "Detail" },
                    ]);
                  }
                  downloadCsv(`${safe || "drill"}.csv`, csv);
                }}
                disabled={!filtered || filtered.rows.length === 0}
                className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium border transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[var(--lx-soft)]"
                style={{ borderColor: "var(--lx-border, rgba(0,0,0,0.08))", color: "var(--lx-text-2)" }}
              >
                <Download className="h-3 w-3" /> CSV
              </button>
              <div className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                style={{ background: "var(--lx-soft)", color: "var(--lx-text-2)" }}>
                {filtered?.rows.length ?? 0} {
                  state?.kind === "students" ? "students" :
                  state?.kind === "pocs" ? "POCs" :
                  state?.kind === "domains" ? "domains" :
                  state?.kind === "converted-students" ? "records" :
                  "LMPs"
                }
              </div>
            </div>
          </div>
          <div className="relative mt-3">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-50" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search…"
              className="h-9 pl-8 text-[12px]"
            />
          </div>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 px-6 py-4">
          {!filtered || filtered.rows.length === 0 ? (
            <div className="px-2 py-16 text-center text-[12.5px]" style={{ color: "var(--lx-text-3)" }}>
              {q.trim() ? "No matches for your search." : "No records to show."}
            </div>
          ) : filtered.kind === "lmps" ? (
            <LmpTable rows={filtered.rows} onClose={onClose} />
          ) : filtered.kind === "students" ? (
            <StudentTable rows={filtered.rows} />
          ) : filtered.kind === "pocs" ? (
            <PocTable rows={filtered.rows} />
          ) : filtered.kind === "converted-students" ? (
            <ConvertedStudentTable
              rows={filtered.rows}
              onClose={onClose}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={toggleSort}
            />
          ) : (
            <DomainList rows={filtered.rows} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── Tables ─────────── */
function LmpTable({ rows, onClose }: { rows: LmpDrillRow[]; onClose: () => void }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10" style={{ background: "var(--lx-surface, white)" }}>
        <tr style={{ borderBottom: "1px solid var(--lx-border, rgba(0,0,0,0.06))" }}>
          {["Company", "Role", "Student", "Status", "Prep POC", "Outreach POC", "Domain", "Updated", ""].map((h) => (
            <th key={h} className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium"
              style={{ color: "var(--lx-text-3)" }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => {
          const student = (r.convertNames || r.finalConvert || r.r3Shortlisted || r.r2Shortlisted || r.r1Shortlisted || "").split(/[,/]/)[0]?.trim();
          return (
            <tr key={r.processId} className="border-b last:border-0 hover:bg-[var(--lx-soft)] transition-colors"
              style={{ borderColor: "var(--lx-border, rgba(0,0,0,0.04))" }}>
              <td className="px-3 py-2 truncate max-w-[160px]" style={{ color: "var(--lx-text)" }}>{r.company || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[160px]" style={{ color: "var(--lx-text-2)" }}>{r.role || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[140px]" style={{ color: "var(--lx-text-2)" }}>{student || "—"}</td>
              <td className="px-3 py-2"><StatusBadge status={r.displayStatus ?? r.status} /></td>
              <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.prepPoc || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.outreachPoc || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[140px]" style={{ color: "var(--lx-text-2)" }}>{r.domain || "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums text-[11.5px]" style={{ color: "var(--lx-text-3)" }}>
                {r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString() : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  to={`/lmp/${r.processId}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium"
                  style={{ color: "var(--lx-accent, #4A8EE8)" }}
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function StudentTable({ rows }: { rows: StudentDrillRow[] }) {
  const displayId = (r: StudentDrillRow) => r.rollNo || r.studentCode || r.id || "—";
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10" style={{ background: "var(--lx-surface, white)" }}>
        <tr style={{ borderBottom: "1px solid var(--lx-border, rgba(0,0,0,0.06))" }}>
          {["Name", "Student ID", "Email", "Phone", "Cohort", "Program", "Batch", "Primary Domain", "Secondary Domain", "Active LMPs", "Total LMPs"].map((h) => (
            <th key={h} className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium"
              style={{ color: "var(--lx-text-3)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={`${r.name}-${i}`} className="border-b last:border-0 hover:bg-[var(--lx-soft)] transition-colors"
            style={{ borderColor: "var(--lx-border, rgba(0,0,0,0.04))" }}>
            <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: "var(--lx-text)" }}>{r.name || "—"}</td>
            <td className="px-3 py-2 font-mono text-[11px] truncate max-w-[140px]" style={{ color: "var(--lx-text-2)" }}>{displayId(r)}</td>
            <td className="px-3 py-2 truncate max-w-[180px]" style={{ color: "var(--lx-text-2)" }}>{r.email || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.phone || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.cohort || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[100px]" style={{ color: "var(--lx-text-2)" }}>{r.program || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.batchLabel || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: "var(--lx-text-2)" }}>{r.primaryDomain || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: "var(--lx-text-2)" }}>{r.secondaryDomain || "—"}</td>
            <td className="px-3 py-2 font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>{r.activeLmpCount ?? 0}</td>
            <td className="px-3 py-2 font-mono tabular-nums" style={{ color: "var(--lx-text-3)" }}>{r.lmpCount ?? 0}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PocTable({ rows }: { rows: PocDrillRow[] }) {
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10" style={{ background: "var(--lx-surface, white)" }}>
        <tr style={{ borderBottom: "1px solid var(--lx-border, rgba(0,0,0,0.06))" }}>
          {["Name", "Role", "Active load", "Threshold", "Domains"].map((h) => (
            <th key={h} className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium"
              style={{ color: "var(--lx-text-3)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const over = (r.activeLoad ?? 0) > (r.threshold ?? Infinity);
          return (
            <tr key={`${r.name}-${i}`} className="border-b last:border-0 hover:bg-[var(--lx-soft)] transition-colors"
              style={{ borderColor: "var(--lx-border, rgba(0,0,0,0.04))" }}>
              <td className="px-3 py-2" style={{ color: "var(--lx-text)" }}>{r.name || "—"}</td>
              <td className="px-3 py-2" style={{ color: "var(--lx-text-2)" }}>{r.role || "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums"
                style={{ color: over ? LX_HEX.risk : "var(--lx-text)" }}>{r.activeLoad ?? 0}</td>
              <td className="px-3 py-2 font-mono tabular-nums" style={{ color: "var(--lx-text-3)" }}>{r.threshold ?? "—"}</td>
              <td className="px-3 py-2 truncate max-w-[260px]" style={{ color: "var(--lx-text-2)" }}>
                {(r.domains ?? (r.primaryDomain ? [r.primaryDomain] : [])).join(", ") || "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ConvertedStudentTable({
  rows, onClose, sortKey, sortDir, onSort,
}: {
  rows: ConvertedStudentDrillRow[];
  onClose: () => void;
  sortKey: "studentName" | "company" | "closingDate" | "cohort";
  sortDir: "asc" | "desc";
  onSort: (k: "studentName" | "company" | "closingDate" | "cohort") => void;
}) {
  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp = sortKey === "closingDate"
        ? (new Date(av || 0).getTime() - new Date(bv || 0).getTime())
        : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [rows, sortKey, sortDir]);

  const SortIcon = ({ col }: { col: typeof sortKey }) => {
    if (sortKey !== col) return <span className="opacity-20 inline-block w-3">↕</span>;
    return sortDir === "asc"
      ? <ChevronUp className="h-3 w-3 inline-block" />
      : <ChevronDown className="h-3 w-3 inline-block" />;
  };

  const sortableTh = (label: string, col: typeof sortKey) => (
    <th
      className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium cursor-pointer select-none hover:opacity-70 transition-opacity"
      style={{ color: "var(--lx-text-3)" }}
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">{label} <SortIcon col={col} /></span>
    </th>
  );

  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10" style={{ background: "var(--lx-surface, white)" }}>
        <tr style={{ borderBottom: "1px solid var(--lx-border, rgba(0,0,0,0.06))" }}>
          {sortableTh("Student Name", "studentName")}
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Student ID</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Email</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Phone</th>
          {sortableTh("Cohort", "cohort")}
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Primary Domain</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Secondary Domain</th>
          {sortableTh("Company", "company")}
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Role</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>LMP Domain</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Type</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>LMP Status</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Prep POC</th>
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>Outreach POC</th>
          {sortableTh("Closing Date", "closingDate")}
          <th className="px-3 py-2 text-left text-[10.5px] uppercase tracking-[0.5px] font-medium" style={{ color: "var(--lx-text-3)" }}>LMP ID</th>
          <th className="px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((r, i) => {
          const unmatched = r.matchStatus !== "matched";
          return (
            <tr
              key={`${r.studentName}--${r.lmpId}--${i}`}
              className="border-b last:border-0 hover:bg-[var(--lx-soft)] transition-colors"
              style={{ borderColor: "var(--lx-border, rgba(0,0,0,0.04))" }}
            >
              <td className="px-3 py-2 font-medium truncate max-w-[150px]" style={{ color: "var(--lx-text)" }}>
                {r.studentName || "—"}
              </td>
              <td className="px-3 py-2 font-mono text-[11px] truncate max-w-[130px]" style={{ color: "var(--lx-text-2)" }}>
                {r.studentIdDisplay || "—"}
              </td>
              <td className="px-3 py-2 truncate max-w-[150px]" style={{ color: "var(--lx-text-2)" }}>{r.email || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[110px]" style={{ color: "var(--lx-text-2)" }}>{r.phone || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[100px]"
                style={{ color: unmatched ? "var(--lx-text-3)" : "var(--lx-text-2)", fontStyle: unmatched ? "italic" : undefined }}>
                {r.cohort || "—"}
              </td>
              <td className="px-3 py-2 truncate max-w-[120px]"
                style={{ color: unmatched ? "var(--lx-text-3)" : "var(--lx-text-2)", fontStyle: unmatched ? "italic" : undefined }}>
                {r.primaryDomain || "—"}
              </td>
              <td className="px-3 py-2 truncate max-w-[120px]"
                style={{ color: unmatched ? "var(--lx-text-3)" : "var(--lx-text-2)", fontStyle: unmatched ? "italic" : undefined }}>
                {r.secondaryDomain || "—"}
              </td>
              <td className="px-3 py-2 truncate max-w-[130px]" style={{ color: "var(--lx-text)" }}>{r.company || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.role || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[100px]" style={{ color: "var(--lx-text-2)" }}>{r.lmpDomain || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[80px]" style={{ color: "var(--lx-text-2)" }}>{r.processType || "—"}</td>
              <td className="px-3 py-2"><StatusBadge status={r.displayStatus || r.lmpStatus} /></td>
              <td className="px-3 py-2 truncate max-w-[110px]" style={{ color: "var(--lx-text-2)" }}>{r.prepPoc || "—"}</td>
              <td className="px-3 py-2 truncate max-w-[110px]" style={{ color: "var(--lx-text-2)" }}>{r.outreachPoc || "—"}</td>
              <td className="px-3 py-2 font-mono tabular-nums text-[11.5px]" style={{ color: "var(--lx-text-3)" }}>
                {r.closingDate && r.closingDate !== "—"
                  ? (() => { try { return new Date(r.closingDate).toLocaleDateString(); } catch { return r.closingDate; } })()
                  : "—"}
              </td>
              <td className="px-3 py-2 font-mono text-[11px]" style={{ color: "var(--lx-text-3)" }}>
                {r.lmpCode || r.lmpId.slice(0, 8)}
              </td>
              <td className="px-3 py-2 text-right">
                <Link
                  to={`/lmp/${r.lmpId}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[11.5px] font-medium"
                  style={{ color: "var(--lx-accent, #4A8EE8)" }}
                >
                  Open <ExternalLink className="h-3 w-3" />
                </Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DomainList({ rows }: { rows: { name: string; value: number; sub?: string }[] }) {
  return (
    <ul className="divide-y" style={{ borderColor: "var(--lx-border)" }}>
      {rows.map((r) => (
        <li key={r.name} className="px-4 py-2.5 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-[13px] font-medium truncate" style={{ color: "var(--lx-text)" }}>{r.name}</div>
            {r.sub && <div className="text-[11px] truncate" style={{ color: "var(--lx-text-3)" }}>{r.sub}</div>}
          </div>
          <div className="font-mono tabular-nums text-[13px]" style={{ color: "var(--lx-text)" }}>{r.value}</div>
        </li>
      ))}
    </ul>
  );
}
