import { useEffect, useMemo, useState } from "react";
import { DataSourceViewDrawer } from "./DataSourceViewDrawer";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Loader2, Search } from "lucide-react";
import { useAllDomains, useMappedPocCountsByDomain } from "@/lib/hooks/useDbData";
import { useStudentPreferencePlacementAnalytics } from "@/lib/hooks/useStudentPreferencePlacementAnalytics";
import { StudentPreferencePlacementAnalytics } from "@/components/dashboard/StudentPreferencePlacementAnalytics";
import { LxDrillDown, type DrillState } from "@/components/insights/LxDrillDown";
import { LX_HEX } from "@/components/insights/primitives";
import { cn } from "@/lib/utils";
import type { StudentRosterEntry } from "@/lib/analytics/studentPreferencePlacement";
import type { LmpRecord } from "@/lib/lmpTypes";
import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import type { Process } from "@/lib/lmpProcessQueries";

type SortKey = "name" | "total_lmps" | "active_lmps" | "converted_lmps" | "conversion_rate";
type DomainModalView = "database" | "analytics";

function lmpRecordsToProcesses(records: LmpRecord[], live: Process[]): Process[] {
  const byId = new Map(live.map((p) => [p.processId, p]));
  return records.map((r) => byId.get(r.id)).filter((p): p is Process => !!p);
}

export function ViewAllDomainsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [view, setView] = useState<DomainModalView>("database");
  const { data: domains, isLoading } = useAllDomains();
  const { data: mappedCounts } = useMappedPocCountsByDomain();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "total_lmps", dir: "desc" });
  const [drill, setDrill] = useState<DrillState | null>(null);

  const analyticsEnabled = open && view === "analytics";
  const { domainPrefData, pocLensData, lmpRecords, isLoading: analyticsLoading } =
    useStudentPreferencePlacementAnalytics(analyticsEnabled);
  const { processes: liveProcesses } = useLiveProcesses();

  useEffect(() => {
    if (!open) {
      setView("database");
      setSearch("");
      setDrill(null);
    }
  }, [open]);

  const rows = useMemo(() => {
    const list = (domains ?? []).filter((d: any) =>
      !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.slug?.toLowerCase().includes(search.toLowerCase())
    );
    return [...list].sort((a: any, b: any) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }, [domains, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const SortHead = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={cn("py-2.5 px-3 text-[11px] uppercase tracking-wide font-medium", align === "right" && "text-right")}
      style={{ color: "var(--lx-text-3)" }}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:opacity-80">
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  const ViewToggle = (
    <div
      className="inline-flex rounded-md p-0.5 shrink-0"
      style={{ background: "var(--lx-soft)", border: "0.5px solid var(--lx-border)" }}
    >
      {([
        { id: "database" as const, label: "Database" },
        { id: "analytics" as const, label: "Analytics" },
      ]).map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => setView(id)}
          className="px-2.5 h-7 text-[11.5px] font-medium rounded-[5px] transition-colors"
          style={{
            background: view === id ? "var(--lx-surface)" : "transparent",
            color: view === id ? LX_HEX.orange : "var(--lx-text-3)",
            boxShadow: view === id ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <DataSourceViewDrawer
        open={open}
        onOpenChange={onOpenChange}
        title="Domain Database — All Domains"
      >
          <div className="flex items-center gap-3 px-5 pt-3 pb-2 shrink-0 flex-wrap border-b border-border">
            {view === "database" && (
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--lx-text-3)" }} />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search domain…" className="pl-9 h-9" />
              </div>
            )}
            {view === "database" && (
              <div className="text-[12px] shrink-0" style={{ color: "var(--lx-text-2)" }}>
                {rows.length} domain{rows.length === 1 ? "" : "s"}
              </div>
            )}
            <div className={cn(view === "analytics" && "ml-auto")}>{ViewToggle}</div>
          </div>

          {view === "database" ? (
            <div className="overflow-auto mx-5 mb-5 border rounded-md flex-1 min-h-0" style={{ borderColor: "var(--lx-border)" }}>
              <table className="w-full text-[13px]">
                <thead className="sticky top-0 z-[1]" style={{ background: "var(--lx-soft)" }}>
                  <tr className="text-left">
                    <SortHead k="name" label="Domain" />
                    <SortHead k="total_lmps" label="Total LMPs" align="right" />
                    <SortHead k="active_lmps" label="Active" align="right" />
                    <SortHead k="converted_lmps" label="Converted" align="right" />
                    <SortHead k="conversion_rate" label="Conv %" align="right" />
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide font-medium text-right" style={{ color: "var(--lx-text-3)" }}>Mapped POCs</th>
                    <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide font-medium text-right" style={{ color: "var(--lx-text-3)" }}>Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr><td colSpan={7} className="py-8 text-center" style={{ color: "var(--lx-text-3)" }}>Loading…</td></tr>
                  )}
                  {!isLoading && rows.length === 0 && (
                    <tr><td colSpan={7} className="py-8 text-center" style={{ color: "var(--lx-text-3)" }}>No domains found</td></tr>
                  )}
                  {rows.map((d: any) => (
                    <tr key={d.id} className="border-t hover:bg-[var(--lx-soft)]" style={{ borderColor: "var(--lx-border)" }}>
                      <td className="py-2.5 px-3 font-medium" style={{ color: "var(--lx-text)" }}>{d.name}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{d.total_lmps ?? 0}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{d.active_lmps ?? 0}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{d.converted_lmps ?? 0}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{Number(d.conversion_rate ?? 0).toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{mappedCounts?.[d.slug] ?? 0}</td>
                      <td className="py-2.5 px-3 text-right text-[12px]" style={{ color: "var(--lx-text-3)" }}>
                        {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0 px-5 pb-5 overflow-hidden">
              {analyticsLoading ? (
                <div className="flex items-center justify-center py-16 gap-2 text-[13px]" style={{ color: "var(--lx-text-3)" }}>
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading analytics…
                </div>
              ) : (
                <StudentPreferencePlacementAnalytics
                  domainPrefData={domainPrefData}
                  pocLensData={pocLensData}
                  lmpRecords={lmpRecords}
                  onStudentDrill={(title, studentRows) =>
                    setDrill({ kind: "students", title, rows: studentRows as StudentRosterEntry[] })
                  }
                  onLmpDrill={(title, records) =>
                    setDrill({
                      kind: "lmps",
                      title,
                      rows: lmpRecordsToProcesses(records, liveProcesses),
                    })
                  }
                />
              )}
            </div>
          )}
      </DataSourceViewDrawer>
      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </>
  );
}
