/**
 * /quick/admin-summary — Read-only card list of all LMPs.
 * Admin/allocator only. No mutation buttons.
 */
import { useState, useMemo } from "react";
import { Search, Filter, FileText, Users, CheckSquare, ExternalLink, ChevronDown, ChevronUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLmpProcesses, usePocProfiles } from "@/lib/hooks/useDbData";
import { useDomains } from "@/lib/hooks/useDbData";
import { STATUSES, STATUS_META, type LmpStatus } from "@/lib/lmpTypes";
import { isActiveLmpStatus } from "@/lib/config/lmpStatus";
import { QuickMobileShell } from "./QuickMobileShell";
import { fetchJdFromDb, getJd } from "@/lib/jdStore";

// ── Checklist completion count from DB row ────────────────────────────────────
function checklistDone(row: any): number {
  return [
    Boolean(row.mentor_aligned),
    Boolean(row.prep_doc_shared),
    Boolean(row.assignment_review),
    Boolean(row.one_to_one_mock),
  ].filter(Boolean).length;
}

function hasJd(row: any): boolean {
  return !!(row.jd_text || row.jd_url || row.jd_file_name);
}

// ── Status chip colours ───────────────────────────────────────────────────────
const STATUS_CHIP: Record<string, string> = {
  "not-started":   "bg-slate-100 text-slate-600 border-slate-200",
  "prep-ongoing":  "bg-blue-50 text-blue-700 border-blue-200",
  "prep-done":     "bg-emerald-50 text-emerald-700 border-emerald-200",
  "hold":          "bg-amber-50 text-amber-700 border-amber-200",
  "converted":     "bg-green-100 text-green-700 border-green-200",
  "not-converted": "bg-rose-50 text-rose-600 border-rose-200",
  "other-reasons": "bg-muted text-muted-foreground border-border",
};

function statusChipClass(s: string) {
  return STATUS_CHIP[s] ?? "bg-muted text-muted-foreground border-border";
}

// ── Single read-only LMP card ─────────────────────────────────────────────────
function AdminLmpCard({ row }: { row: any }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const done = checklistDone(row);
  const jdAttached = hasJd(row);
  const domainName: string = row.domains?.name ?? row.domain_raw ?? "";
  const lmpType: string = row.type ?? "";
  const statusSlug = String(row.status ?? "");
  const statusText = STATUS_META[statusSlug as LmpStatus]?.label ?? statusSlug.replace(/-/g, " ");
  const lastProg = row.last_progress_updated_at
    ? new Date(row.last_progress_updated_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Main card row */}
      <button
        className="w-full text-left px-4 py-3.5 flex items-start gap-3 hover:bg-muted/20 transition-colors"
        onClick={() => setExpanded((e) => !e)}
        style={{ minHeight: "72px" }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-snug line-clamp-1">{row.company}</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{row.role}</p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusChipClass(statusSlug)}`}>
              {statusText}
            </span>
            {domainName && (
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {domainName}
              </span>
            )}
            {lmpType && (
              <span className="rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground">
                {lmpType}
              </span>
            )}
          </div>
        </div>
        <span className="shrink-0 mt-0.5 text-muted-foreground">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-2.5">
          {/* POC row */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Prep POC</p>
              <p className="text-xs font-medium mt-0.5">{row.prep_poc || "—"}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Support POC</p>
              <p className="text-xs font-medium mt-0.5">{row.support_poc || "—"}</p>
            </div>
            {row.outreach_poc && (
              <div>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Outreach POC</p>
                <p className="text-xs font-medium mt-0.5">{row.outreach_poc}</p>
              </div>
            )}
          </div>

          {/* Progress / JD / Checklist row */}
          <div className="flex flex-wrap gap-2 text-[10px]">
            {lastProg && (
              <span className="flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1 text-muted-foreground">
                Last: {lastProg}
              </span>
            )}
            {jdAttached && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1">
                <FileText className="h-3 w-3" /> JD Attached
              </span>
            )}
            <span className={`flex items-center gap-1 rounded-full px-2 py-1 border ${done === 4 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted/60 text-muted-foreground border-border"}`}>
              <CheckSquare className="h-3 w-3" /> {done}/4 done
            </span>
          </div>

          {/* Action links */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => navigate(`/quick/summary?lmp=${row.id}`)}
              className="flex-1 rounded-xl border border-border bg-muted/30 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors text-center"
            >
              View Summary
            </button>
            {jdAttached && (
              <button
                onClick={() => navigate(`/quick/view-jd?lmp=${row.id}`)}
                className="flex-1 rounded-xl border border-border bg-muted/30 py-2 text-xs font-semibold text-foreground hover:bg-muted/60 transition-colors text-center"
              >
                View JD
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function AdminSummaryView() {
  const { data: allLmps = [], isLoading } = useLmpProcesses();
  const { data: pocProfiles = [] } = usePocProfiles();
  const { data: domains = [] } = useDomains();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<LmpStatus | "">("");
  const [filterDomain, setFilterDomain] = useState("");
  const [filterPrepPoc, setFilterPrepPoc] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Unique prep POC names from loaded data
  const prepPocNames = useMemo(() => {
    const names = new Set((allLmps as any[]).map((r) => r.prep_poc).filter(Boolean));
    return [...names].sort();
  }, [allLmps]);

  const domainNames = useMemo(() => {
    return (domains as any[]).map((d) => d.name).filter(Boolean).sort();
  }, [domains]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return (allLmps as any[]).filter((r) => {
      if (activeOnly && !isActiveLmpStatus(r.status)) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterDomain) {
        const dn = r.domains?.name ?? r.domain_raw ?? "";
        if (!dn.toLowerCase().includes(filterDomain.toLowerCase())) return false;
      }
      if (filterPrepPoc && r.prep_poc !== filterPrepPoc) return false;
      if (q) {
        const company = String(r.company ?? "").toLowerCase();
        const role = String(r.role ?? "").toLowerCase();
        if (!company.includes(q) && !role.includes(q)) return false;
      }
      return true;
    });
  }, [allLmps, search, filterStatus, filterDomain, filterPrepPoc, activeOnly]);

  const stats = useMemo(() => ({
    total: (allLmps as any[]).length,
    active: (allLmps as any[]).filter((r) => isActiveLmpStatus(r.status)).length,
  }), [allLmps]);

  const activeFilters = [filterStatus, filterDomain, filterPrepPoc, activeOnly ? "active" : ""].filter(Boolean).length;

  return (
    <QuickMobileShell title="Admin Summary" back>
      <div className="space-y-4">
        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">All LMPs</p>
            <p className="text-xl font-bold text-foreground mt-0.5">{isLoading ? "…" : stats.total}</p>
          </div>
          <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Active</p>
            <p className="text-xl font-bold text-primary mt-0.5">{isLoading ? "…" : stats.active}</p>
          </div>
        </div>

        {/* Search + filter toggle */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <input
              type="search"
              placeholder="Search company or role…"
              className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={[
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-colors",
              showFilters || activeFilters > 0
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground",
            ].join(" ")}
          >
            <Filter className="h-4 w-4" />
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[9px] text-primary-foreground font-bold flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="rounded-2xl border border-border bg-card px-4 py-3 space-y-3">
            {/* Active toggle */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Active only</span>
              <button
                onClick={() => setActiveOnly((a) => !a)}
                className={[
                  "relative inline-flex h-6 w-11 items-center rounded-full border-2 transition-colors",
                  activeOnly ? "border-primary bg-primary" : "border-border bg-muted",
                ].join(" ")}
              >
                <span className={["h-4 w-4 rounded-full bg-white shadow-sm transition-transform", activeOnly ? "translate-x-5" : "translate-x-0.5"].join(" ")} />
              </button>
            </div>

            {/* Status */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">Status</p>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as LmpStatus | "")}
              >
                <option value="">All statuses</option>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_META[s]?.label ?? s}</option>)}
              </select>
            </div>

            {/* Domain */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">Domain</p>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={filterDomain}
                onChange={(e) => setFilterDomain(e.target.value)}
              >
                <option value="">All domains</option>
                {domainNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Prep POC */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1.5">Prep POC</p>
              <select
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={filterPrepPoc}
                onChange={(e) => setFilterPrepPoc(e.target.value)}
              >
                <option value="">All POCs</option>
                {prepPocNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>

            {/* Clear */}
            {activeFilters > 0 && (
              <button
                onClick={() => { setFilterStatus(""); setFilterDomain(""); setFilterPrepPoc(""); setActiveOnly(false); }}
                className="w-full text-xs text-primary font-medium py-1.5 rounded-xl border border-primary/20 bg-primary/5"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {/* Results count */}
        <p className="text-xs text-muted-foreground px-1">
          {isLoading ? "Loading…" : `${filtered.length} LMP${filtered.length === 1 ? "" : "s"}`}
          {search || activeFilters > 0 ? ` matching filters` : ""}
        </p>

        {/* LMP cards */}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No LMPs match your filters.</p>
        )}
        <ul className="space-y-2">
          {filtered.map((row: any) => (
            <li key={row.id}>
              <AdminLmpCard row={row} />
            </li>
          ))}
        </ul>

        <div className="h-4" />
      </div>
    </QuickMobileShell>
  );
}
