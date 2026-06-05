import { useMemo, useState } from "react";
import { Search, X, GraduationCap } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStudentsWithLoad } from "@/lib/hooks/useDbData";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { EmptyState } from "@/components/ui/empty-state";
import { ClearDataSourceButton } from "./ClearDataSourceButton";

const PAGE_SIZE = 50;

function deriveProgram(s: any): string {
  const cohort = String(s?.cohort || "").trim().toUpperCase();
  if (cohort) {
    if (cohort.startsWith("YLC")) return "YLC";
    if (cohort.startsWith("PGP") || cohort.startsWith("TBM")) return "TBM";
    return cohort;
  }
  const rollNo = s?.roll_no;
  if (!rollNo) return "—";
  if (String(rollNo).startsWith("YLC")) return "YLC";
  if (String(rollNo).startsWith("PGP")) return "TBM";
  return "—";
}

export function ViewAllStudentsModal({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: students = [], isLoading } = useStudentsWithLoad(5000);
  const { names: domains, display: domainDisplay, matches: domainMatches } = useResolveDomain();
  const [search, setSearch] = useState("");
  const [domain, setDomain] = useState("");
  const [program, setProgram] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (students as any[]).filter((s) => {
      if (domain && !domainMatches(s.primary_domain, domain)) return false;
      if (program && deriveProgram(s) !== program) return false;
      if (!q) return true;
      return (
        (s.name || "").toLowerCase().includes(q) ||
        (s.roll_no || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.primary_domain || "").toLowerCase().includes(q) ||
        (s.secondary_domain || "").toLowerCase().includes(q) ||
        (s.actual_domain || "").toLowerCase().includes(q) ||
        (s.other_domains || "").toLowerCase().includes(q)
      );
    });
  }, [students, search, domain, program, domainMatches]);

  const renderSecondary = (s: any) => {
    if (s.secondary_domain) return domainDisplay(s.secondary_domain);
    if (s.actual_domain) return domainDisplay(s.actual_domain);
    let raw = s.other_domains;
    if (!raw) return "—";
    // Heal legacy values stored as JSON arrays like '["Sales"]' or '["A","B"]'
    if (typeof raw === "string" && raw.trim().startsWith("[")) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) raw = arr.join(", ");
      } catch { /* fall through */ }
    } else if (Array.isArray(raw)) {
      raw = raw.join(", ");
    }
    const parts = String(raw)
      .replace(/[\[\]"]/g, "")
      .split(/[,;|]+/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!parts.length) return "—";
    return parts.map((p) => domainDisplay(p)).join(", ");
  };

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1200px] max-h-[88vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="text-[16px] font-semibold text-n900">All Students</DialogTitle>
              <p className="text-[12px] text-n500 mt-0.5">
                Showing {filtered.length} of {students.length} students
              </p>
            </div>
            <ClearDataSourceButton
              source="student_db"
              label="students"
              count={students.length}
              onCleared={() => onOpenChange(false)}
            />
          </div>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-n200 shrink-0 flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-n400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, roll no, email, domain…"
              className="w-full h-8 rounded-md border border-n300 bg-card pl-8 pr-8 text-[13px] focus:outline-none focus:border-orange-400"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-n400 hover:text-n700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <select
            value={domain}
            onChange={(e) => { setDomain(e.target.value); setPage(1); }}
            className="h-8 rounded-md border border-n300 bg-card px-2 text-[12px] text-n700 focus:outline-none focus:border-orange-400"
          >
            <option value="">Primary Domain</option>
            {domains.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select
            value={program}
            onChange={(e) => { setProgram(e.target.value); setPage(1); }}
            className="h-8 rounded-md border border-n300 bg-card px-2 text-[12px] text-n700 focus:outline-none focus:border-orange-400"
          >
            <option value="">Program</option>
            <option value="TBM">TBM</option>
            <option value="YLC">YLC</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto px-6 py-3">
          {isLoading ? (
            <div className="text-center text-n500 py-12 text-[13px]">Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={GraduationCap} title="No students found" description="Try clearing filters or upload a CSV." />
          ) : (
            <table className="w-full text-[12px] whitespace-nowrap">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="text-left text-n500 text-[10px] uppercase tracking-[0.5px] border-b border-n200">
                  <th className="font-medium px-2 py-2">Student ID</th>
                  <th className="font-medium px-2 py-2">Student Name</th>
                  <th className="font-medium px-2 py-2">Student Email ID</th>
                  <th className="font-medium px-2 py-2">Primary Domain</th>
                  <th className="font-medium px-2 py-2">Secondary Domain</th>
                  <th className="font-medium px-2 py-2">Program Name</th>
                  <th className="font-medium px-2 py-2 text-right">Current LMP Count</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s: any) => (
                  <tr key={s.id} className="border-b border-n100 hover:bg-n50/50">
                    <td className="px-2 py-2 text-n700 font-mono text-[11px]">{s.roll_no || s.student_code || "—"}</td>
                    <td className="px-2 py-2 text-n900 font-medium">{s.name}</td>
                    <td className="px-2 py-2 text-n600">{s.email || "—"}</td>
                    <td className="px-2 py-2 text-n600">{domainDisplay(s.primary_domain)}</td>
                    <td className="px-2 py-2 text-n600">{renderSecondary(s)}</td>
                    <td className="px-2 py-2 text-n600">{deriveProgram(s)}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {Number(s.total_lmp_count || 0) > 0 ? (
                        <span className="inline-flex items-center justify-center min-w-[28px] h-5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-semibold px-2">
                          {s.total_lmp_count}
                        </span>
                      ) : (
                        <span className="text-n400">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > PAGE_SIZE && (
          <div className="px-6 py-3 border-t border-n200 flex items-center justify-between text-[12px]">
            <span className="text-n500">Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-2 py-1 rounded-md border border-n300 disabled:opacity-40">Prev</button>
              <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-2 py-1 rounded-md border border-n300 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
