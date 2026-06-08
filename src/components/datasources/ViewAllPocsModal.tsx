import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useAllPocProfiles, usePocLiveLoads } from "@/lib/hooks/useDbData";
import { useResolveDomain } from "@/lib/hooks/useResolveDomain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PocEditDrawer } from "@/components/poc/PocEditDrawer";
import { PocDeleteDialog } from "@/components/poc/PocDeleteDialog";
import { useRole } from "@/lib/rolesContext";
import { ACCESS_LABEL, ACCESS_PILL, type PocAccessLevel } from "@/lib/pocDomains";

type SortKey = "name" | "active_load" | "historical_load" | "converted_count" | "conversion_rate" | "total_load" | "converted_load";

const ROLE_LABEL: Record<string, string> = {
  prep_poc: "Prep POC",
  support_poc: "Support POC",
  outreach_poc: "Outreach POC",
};

export function ViewAllPocsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: pocs, isLoading } = useAllPocProfiles();
  const { data: liveLoads } = usePocLiveLoads();
  const byPoc = useMemo(() => liveLoads?.byPoc ?? {}, [liveLoads?.byPoc]);

  /**
   * Robust load resolver — tolerant to role_type drift and naming variants.
   * Picks the relevant slice of the active-LMP breakdown for the POC's declared role,
   * but falls back to the total active count whenever:
   *   - the role-specific slice is empty (e.g. an outreach POC marked as "admin"), OR
   *   - the POC's role_type is anything other than the standard prep/outreach values.
   */
  const loadFor = (p: any): number => {
    const breakdown = byPoc[p.name];
    if (!breakdown) return 0;
    const role = (p.role_type ?? "").toLowerCase();
    if (role === "outreach_poc") return breakdown.outreach || breakdown.total;
    if (role === "prep_poc" || role === "support_poc" || role === "allocator" || role === "admin") {
      return (breakdown.prep + breakdown.support) || breakdown.total;
    }
    return breakdown.total;
  };
  const totalFor = (p: any): number => byPoc[p.name]?.historicalTotal ?? 0;
  const convertedFor = (p: any): number => byPoc[p.name]?.converted ?? 0;
  const { role } = useRole();
  const { names: domainOptions, display: domainDisplay, resolve: resolveDomain } = useResolveDomain();
  const isAdmin = role === "admin";
  const [search, setSearch] = useState("");
  const [pocKind, setPocKind] = useState<"prep" | "outreach">("prep");
  const [mappingFilter, setMappingFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [domainFilter, setDomainFilter] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "active_load", dir: "desc" });
  const [editPoc, setEditPoc] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletePoc, setDeletePoc] = useState<any | null>(null);

  const openCreate = () => { setEditPoc(null); setDrawerOpen(true); };
  const openEdit = (p: any) => { setEditPoc(p); setDrawerOpen(true); };

  const roleTypes = useMemo(() => {
    const set = new Set<string>();
    (pocs ?? []).forEach((p: any) => p.role_type && set.add(p.role_type));
    return [...set];
  }, [pocs]);

  const isPrep = pocKind === "prep";

  const rows = useMemo(() => {
    const _loadFor = (p: any): number => {
      const breakdown = byPoc[p.name];
      if (!breakdown) return 0;
      const role = (p.role_type ?? "").toLowerCase();
      if (role === "outreach_poc") return breakdown.outreach || breakdown.total;
      if (role === "prep_poc" || role === "support_poc" || role === "allocator" || role === "admin") {
        return (breakdown.prep + breakdown.support) || breakdown.total;
      }
      return breakdown.total;
    };
    const _totalFor = (p: any): number => byPoc[p.name]?.historicalTotal ?? 0;
    const _convertedFor = (p: any): number => byPoc[p.name]?.converted ?? 0;

    const q = search.toLowerCase();
    const list = (pocs ?? []).filter((p: any) => {
      const kind = p.role_type === "outreach_poc" ? "outreach" : "prep";
      if (kind !== pocKind) return false;
      if (isPrep) {
        const mapped = !!p.primary_domain || (p.domain_tags?.length ?? 0) > 0;
        if (mappingFilter === "mapped" && !mapped) return false;
        if (mappingFilter === "unmapped" && mapped) return false;
        if (domainFilter) {
          const all = [p.primary_domain, ...(p.domain_tags ?? [])].filter(Boolean);
          const matched = all.some((t: string) => (resolveDomain(t) ?? "Unmapped") === domainFilter);
          if (!matched) return false;
        }
      }
      if (!q) return true;
      const allDomains = [p.primary_domain, ...(p.domain_tags ?? [])].filter(Boolean);
      return (
        p.name?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        allDomains.some((t: string) => t.toLowerCase().includes(q))
      );

    });
    return [...list].sort((a: any, b: any) => {
      const pick = (x: any) => {
        if (sort.key === "active_load") return _loadFor(x);
        if (sort.key === "total_load") return _totalFor(x);
        if (sort.key === "converted_load") return _convertedFor(x);
        return x[sort.key] ?? 0;
      };
      const av = pick(a);
      const bv = pick(b);
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === "asc" ? av - bv : bv - av;
    });
  }, [pocs, search, pocKind, isPrep, mappingFilter, domainFilter, sort, byPoc, resolveDomain]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const SortHead = ({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th className={cn("py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium", align === "right" && "text-right")}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-n800">
        {label}
        {sort.key === k && (sort.dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
      </button>
    </th>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>POC Database — All POCs</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 pt-2 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-n400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, role, domain…" className="pl-9" />
          </div>
          <div className="inline-flex rounded-md border border-n200 overflow-hidden text-[12px]">
            {(["prep","outreach"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setPocKind(k)}
                className={cn("px-3 py-1.5", pocKind === k ? "bg-n900 text-white" : "bg-card text-n600 hover:bg-n50")}
              >
                {k === "prep" ? "Prep POCs" : "Outreach POCs"}
              </button>
            ))}
          </div>
          {isPrep && (
            <select
              value={mappingFilter}
              onChange={(e) => setMappingFilter(e.target.value as any)}
              className="text-[13px] border border-n200 rounded-md px-3 py-2 bg-card"
            >
              <option value="all">All mappings</option>
              <option value="mapped">Mapped</option>
              <option value="unmapped">Unmapped</option>
            </select>
          )}
          {isPrep && (
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="text-[13px] border border-n200 rounded-md px-3 py-2 bg-card"
            >
              <option value="">Primary Domain</option>
              {domainOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              <option value="Unmapped">Unmapped</option>
            </select>
          )}
          <div className="text-[12px] text-n500 ml-auto">{rows.length} POC{rows.length === 1 ? "" : "s"}</div>
          {isAdmin && (
            <Button size="sm" onClick={openCreate} className="gap-1">
              <Plus className="h-4 w-4" /> Add POC
            </Button>
          )}
        </div>

        <div className="overflow-auto border border-n200 rounded-md mt-3">
          <table className="w-full text-[13px]">
            <thead className="bg-n50 sticky top-0">
              <tr className="text-left">
                <SortHead k="name" label="Name" />
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Email</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Role</th>
                {isPrep && <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Access</th>}
                {isPrep && <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium">Domains</th>}
                <SortHead k="total_load" label="Total LMPs" align="right" />
                <SortHead k="active_load" label="Active" align="right" />
                <SortHead k="converted_load" label="Converted" align="right" />
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium text-right">Last Updated</th>
                {isAdmin && <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={9} className="py-8 text-center text-n500">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-n500">No POCs found</td></tr>
              )}
              {rows.map((p: any) => {
                const rawTags: string[] = p.domain_tags ?? [];
                const rawPrimary: string | null = p.primary_domain || null;
                // Canonicalize for display + dedupe against canonical primary.
                const primary: string | null = rawPrimary
                  ? (resolveDomain(rawPrimary) ?? rawPrimary)
                  : null;
                const supportedSeen = new Set<string>();
                const supported = rawTags
                  .map((t) => (resolveDomain(t) ?? t))
                  .filter((t) => {
                    if (!t || t === primary) return false;
                    const k = t.toLowerCase();
                    if (supportedSeen.has(k)) return false;
                    supportedSeen.add(k);
                    return true;
                  });
                const hasAny = !!primary || supported.length > 0;
                const access = (p.access_level ?? "poc") as PocAccessLevel;
                return (
                  <tr key={p.id} className="border-t border-n100 hover:bg-n50">
                    <td
                      className={cn("py-2.5 px-3 font-medium text-n800", isAdmin && "cursor-pointer hover:text-orange-600")}
                      onClick={() => isAdmin && openEdit(p)}
                    >
                      {p.name}
                    </td>
                    <td className="py-2.5 px-3 text-n600 text-[12px]">{p.email || "—"}</td>
                    <td className="py-2.5 px-3 text-n700">{ROLE_LABEL[p.role_type] ?? p.role_type}</td>
                    {isPrep && (
                      <td className="py-2.5 px-3">
                        <span className={cn("inline-flex items-center text-[11px] rounded-full px-2 py-[2px] border", ACCESS_PILL[access])}>
                          {ACCESS_LABEL[access]}
                        </span>
                      </td>
                    )}
                    {isPrep && (
                      <td className="py-2.5 px-3 text-n600 text-[12px]">
                        {hasAny ? (
                          <div className="flex flex-wrap gap-1">
                            {primary && (
                              <span
                                title="Primary domain"
                                className="inline-flex items-center text-[10.5px] rounded-full px-2 py-[1px] border border-orange-300 bg-orange-50 text-orange-700 font-medium"
                              >
                                {primary}
                              </span>
                            )}
                            {supported.map((t) => (
                              <span key={t} className="inline-flex items-center text-[10.5px] rounded-full px-2 py-[1px] border border-n200 bg-card text-n700">{t}</span>
                            ))}
                          </div>
                        ) : "—"}
                      </td>
                    )}

                    <td className="py-2.5 px-3 text-right tabular-nums font-medium text-n800">{totalFor(p)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums">{loadFor(p)}</td>
                    <td className="py-2.5 px-3 text-right tabular-nums text-emerald-700">{convertedFor(p)}</td>
                    <td className="py-2.5 px-3 text-right text-n500 text-[12px]">
                      {p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "—"}
                    </td>
                    {isAdmin && (
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex gap-1">
                          <button type="button" onClick={() => openEdit(p)} className="p-1 rounded hover:bg-n100 text-n500 hover:text-n800" title="Edit">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" onClick={() => setDeletePoc(p)} className="p-1 rounded hover:bg-red-50 text-n500 hover:text-red-600" title="Delete">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </DialogContent>

      <PocEditDrawer open={drawerOpen} onOpenChange={setDrawerOpen} poc={editPoc} />
      {deletePoc && (
        <PocDeleteDialog
          open={!!deletePoc}
          onOpenChange={(v) => !v && setDeletePoc(null)}
          poc={deletePoc}
          onDeleted={() => setDeletePoc(null)}
        />
      )}
    </Dialog>
  );
}
