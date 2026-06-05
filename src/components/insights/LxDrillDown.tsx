import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, ExternalLink, Download } from "lucide-react";
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
  Ongoing: LX_HEX.info,
  "Offer Received": LX_HEX.yellow,
  Converted: LX_HEX.success,
  "On Hold": LX_HEX.ai,
  Dormant: LX_HEX.orange,
  Closed: LX_HEX.risk,
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
  name: string;
  cohort?: string;
  primaryDomain?: string;
  secondaryDomain?: string;
  lmpCount?: number;
  activeLmpCount?: number;
};

export type PocDrillRow = {
  name: string;
  role?: string;
  activeLoad?: number;
  threshold?: number;
  domains?: string[];
  primaryDomain?: string;
};

export type DrillState =
  | { kind: "lmps";     title: string; subtitle?: string; rows: LmpDrillRow[] }
  | { kind: "students"; title: string; subtitle?: string; rows: StudentDrillRow[] }
  | { kind: "pocs";     title: string; subtitle?: string; rows: PocDrillRow[] }
  | { kind: "domains";  title: string; subtitle?: string; rows: { name: string; value: number; sub?: string }[] };

/* ─────────── Modal ─────────── */
export function LxDrillDown({
  state,
  onClose,
}: {
  state: DrillState | null;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    if (!state) return null;
    const needle = q.trim().toLowerCase();
    if (!needle) return state;
    if (state.kind === "lmps") {
      return {
        ...state,
        rows: state.rows.filter((r) => {
          const hay = `${r.company} ${r.role} ${r.r1Shortlisted} ${r.r2Shortlisted} ${r.r3Shortlisted} ${r.convertNames} ${r.finalConvert} ${r.prepPoc} ${r.outreachPoc} ${r.domain} ${r.status}`.toLowerCase();
          return hay.includes(needle);
        }),
      };
    }
    if (state.kind === "students") {
      return {
        ...state,
        rows: state.rows.filter((r) =>
          `${r.name} ${r.cohort ?? ""} ${r.primaryDomain ?? ""}`.toLowerCase().includes(needle),
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
                      student: (r.convertNames || r.finalConvert || r.r3Shortlisted || r.r2Shortlisted || r.r1Shortlisted || "").split(/[,/]/)[0]?.trim() ?? "",
                      lastUpdated: r.lastUpdated ? new Date(r.lastUpdated).toLocaleDateString() : "",
                    }));
                    csv = toCsv(rows, headers);
                  } else if (filtered.kind === "students") {
                    csv = toCsv(filtered.rows, [
                      { key: "name", label: "Name" }, { key: "cohort", label: "Cohort" },
                      { key: "primaryDomain", label: "Primary Domain" },
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
                {filtered?.rows.length ?? 0} {state?.kind === "students" ? "students" : state?.kind === "pocs" ? "POCs" : state?.kind === "domains" ? "domains" : "LMPs"}
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
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
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
  return (
    <table className="w-full text-[12.5px]">
      <thead className="sticky top-0 z-10" style={{ background: "var(--lx-surface, white)" }}>
        <tr style={{ borderBottom: "1px solid var(--lx-border, rgba(0,0,0,0.06))" }}>
          {["Name", "Cohort", "Primary Domain", "Active LMPs", "Total LMPs"].map((h) => (
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
            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.cohort || "—"}</td>
            <td className="px-3 py-2 truncate max-w-[200px]" style={{ color: "var(--lx-text-2)" }}>{r.primaryDomain || "—"}</td>
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
