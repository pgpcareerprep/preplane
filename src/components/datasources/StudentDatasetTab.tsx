import { useMemo, useState } from "react";
import { Search, X, Plus, Upload, Download, GraduationCap, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useRole } from "@/lib/rolesContext";
import {
  useCohorts,
  usePrograms,
  useStudentsDataset,
  type CohortRow,
  type ProgramRow,
} from "@/lib/hooks/useCohortProgram";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { getStudentBatchLabel } from "@/lib/cohortProgram";
import { exportTableToCsv, dateStamp } from "@/lib/exportCsv";
import { CreateCohortModal } from "./CreateCohortModal";
import { AddProgramModal } from "./AddProgramModal";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

type Props = {
  onUpload?: () => void;
};

export function StudentDatasetTab({ onUpload }: Props) {
  const { role } = useRole();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [cohortFilter, setCohortFilter] = useState<string[]>([]);
  const [programFilter, setProgramFilter] = useState<string[]>([]);
  const [placementStatus, setPlacementStatus] = useState("All");
  const [primaryDomain, setPrimaryDomain] = useState("All");
  const [secondaryDomain, setSecondaryDomain] = useState("All");
  const [page, setPage] = useState(1);

  const [cohortModal, setCohortModal] = useState(false);
  const [editCohort, setEditCohort] = useState<CohortRow | null>(null);
  const [programModal, setProgramModal] = useState(false);
  const [editProgram, setEditProgram] = useState<ProgramRow | null>(null);
  const [programCohortId, setProgramCohortId] = useState<string | undefined>();

  const { data: cohorts = [] } = useCohorts(false);
  const { data: allPrograms = [] } = usePrograms(null, false);
  const { names: domains, display: domainDisplay, matches: domainMatches } = useResolveDomain();

  const { data: students = [], isLoading } = useStudentsDataset({
    search,
    cohortIds: cohortFilter,
    programIds: programFilter,
    placementStatus: placementStatus === "All" ? "" : placementStatus,
    primaryDomain: primaryDomain === "All" ? "" : primaryDomain,
    secondaryDomain: secondaryDomain === "All" ? "" : secondaryDomain,
  });

  const filtered = useMemo(() => {
    return students.filter((s) => {
      if (primaryDomain !== "All" && !domainMatches(s.primary_domain, primaryDomain)) return false;
      if (secondaryDomain !== "All" && !domainMatches(s.secondary_domain, secondaryDomain)) return false;
      return true;
    });
  }, [students, primaryDomain, secondaryDomain, domainMatches]);

  const placementOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      if (s.placement_status) set.add(s.placement_status);
    }
    return ["All", ...[...set].sort()];
  }, [students]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasFilters =
    !!search ||
    cohortFilter.length > 0 ||
    programFilter.length > 0 ||
    placementStatus !== "All" ||
    primaryDomain !== "All" ||
    secondaryDomain !== "All";

  const clearFilters = () => {
    setSearch("");
    setCohortFilter([]);
    setProgramFilter([]);
    setPlacementStatus("All");
    setPrimaryDomain("All");
    setSecondaryDomain("All");
    setPage(1);
  };

  const toggleCohort = (id: string) => {
    setCohortFilter((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length !== 1) setProgramFilter([]);
      return next;
    });
    setPage(1);
  };

  const toggleProgram = (id: string) => {
    setProgramFilter((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
    setPage(1);
  };

  const exportCsv = () => {
    exportTableToCsv(
      `students_dataset_${dateStamp()}.csv`,
      filtered.map((s) => ({
        roll_no: s.roll_no ?? "",
        name: s.name ?? "",
        email: s.email ?? "",
        cohort: s.cohort_code ?? "",
        program: s.program_code ?? "",
        batch_label: getStudentBatchLabel(s),
        primary_domain: s.primary_domain ?? "",
        secondary_domain: s.secondary_domain ?? "",
        placement_status: s.placement_status ?? "",
        active_lmp_count: s.active_lmp_count ?? 0,
        total_lmp_count: s.total_lmp_count ?? 0,
        updated_at: s.updated_at ?? "",
      })),
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Student Dataset</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage cohorts, programs, and student master database.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setEditCohort(null); setCohortModal(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Create Cohort
              </Button>
              <Button variant="outline" size="sm" onClick={() => { setEditProgram(null); setProgramCohortId(cohortFilter[0]); setProgramModal(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Program
              </Button>
              <Button variant="outline" size="sm" onClick={onUpload}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload Students
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!filtered.length}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Cohort / program setup panel */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <h3 className="text-sm font-medium text-foreground">Cohorts &amp; programs</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          {cohorts.map((c) => {
            const progs = allPrograms.filter((p) => p.cohort_id === c.id);
            return (
              <div key={c.id} className="rounded-lg border border-border/80 p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => toggleCohort(c.id)}
                    className={cn(
                      "text-left font-semibold text-sm",
                      cohortFilter.includes(c.id) && "text-orange-600",
                    )}
                  >
                    {c.code} — {c.name}
                    {!c.is_active && <span className="ml-2 text-xs text-muted-foreground">(inactive)</span>}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditCohort(c); setCohortModal(true); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {progs.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleProgram(p.id)}
                      className={cn(
                        "text-[11px] px-2 py-0.5 rounded-full border",
                        programFilter.includes(p.id)
                          ? "bg-orange-50 border-orange-300 text-orange-800"
                          : "bg-muted/40 border-border text-muted-foreground",
                      )}
                    >
                      {p.code}
                    </button>
                  ))}
                  {isAdmin && (
                    <button
                      type="button"
                      className="text-[11px] px-2 py-0.5 rounded-full border border-dashed text-muted-foreground"
                      onClick={() => { setEditProgram(null); setProgramCohortId(c.id); setProgramModal(true); }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, email, roll no…"
            className="w-full h-8 rounded-md border border-input bg-background pl-8 pr-8 text-[13px]"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-[13px]"
          value={placementStatus}
          onChange={(e) => { setPlacementStatus(e.target.value); setPage(1); }}
        >
          {placementOptions.map((o) => <option key={o} value={o}>{o === "All" ? "Placement: All" : o}</option>)}
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-[13px]"
          value={primaryDomain}
          onChange={(e) => { setPrimaryDomain(e.target.value); setPage(1); }}
        >
          <option value="All">Primary domain: All</option>
          {domains.map((d) => <option key={d} value={d}>{domainDisplay(d)}</option>)}
        </select>
        <select
          className="h-8 rounded-md border border-input bg-background px-2 text-[13px]"
          value={secondaryDomain}
          onChange={(e) => { setSecondaryDomain(e.target.value); setPage(1); }}
        >
          <option value="All">Secondary domain: All</option>
          {domains.map((d) => <option key={d} value={d}>{domainDisplay(d)}</option>)}
        </select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>
        )}
      </div>

      {hasFilters && (
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {cohortFilter.map((id) => {
            const c = cohorts.find((x) => x.id === id);
            return c ? (
              <span key={id} className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-800 border border-orange-200">
                Cohort: {c.code}
              </span>
            ) : null;
          })}
          {programFilter.map((id) => {
            const p = allPrograms.find((x) => x.id === id);
            return p ? (
              <span key={id} className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-800 border border-blue-200">
                Program: {p.code}
              </span>
            ) : null;
          })}
        </div>
      )}

      {/* Table */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-[12px] text-muted-foreground">
          Showing {filtered.length} students
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading students…</div>
        ) : !filtered.length ? (
          <EmptyState
            icon={GraduationCap}
            title="No students match these filters."
            description={hasFilters ? "Try clearing filters or upload new students." : "Upload a student CSV to get started."}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Student ID</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium">Cohort</th>
                  <th className="px-3 py-2 font-medium">Program</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Primary</th>
                  <th className="px-3 py-2 font-medium">Secondary</th>
                  <th className="px-3 py-2 font-medium">Placement</th>
                  <th className="px-3 py-2 font-medium text-right">LMPs</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s.id} className="border-t border-border/60 hover:bg-muted/20">
                    <td className="px-3 py-2 font-mono text-[11px]">{s.roll_no || "—"}</td>
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">{s.email || "—"}</td>
                    <td className="px-3 py-2">{s.cohort_code || "—"}</td>
                    <td className="px-3 py-2">{s.program_code || "—"}</td>
                    <td className="px-3 py-2">{getStudentBatchLabel(s)}</td>
                    <td className="px-3 py-2">{domainDisplay(s.primary_domain)}</td>
                    <td className="px-3 py-2">{domainDisplay(s.secondary_domain)}</td>
                    <td className="px-3 py-2">{s.placement_status || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{s.active_lmp_count ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-[12px]">
            <span className="text-muted-foreground">Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>

      <CreateCohortModal open={cohortModal} onOpenChange={setCohortModal} editRow={editCohort} />
      <AddProgramModal
        open={programModal}
        onOpenChange={setProgramModal}
        editRow={editProgram}
        defaultCohortId={programCohortId}
      />
    </div>
  );
}
