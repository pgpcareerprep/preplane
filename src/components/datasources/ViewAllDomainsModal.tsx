import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useAllDomains, useMappedPocCountsByDomain } from "@/lib/hooks/useDbData";
import { cn } from "@/lib/utils";

type SortKey = "name" | "total_lmps" | "active_lmps" | "converted_lmps" | "conversion_rate";

export function ViewAllDomainsModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: domains, isLoading } = useAllDomains();
  const { data: mappedCounts } = useMappedPocCountsByDomain();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "total_lmps", dir: "desc" });

  const rows = useMemo(() => {
    const list = (domains ?? []).filter((d: any) =>
      !search || d.name?.toLowerCase().includes(search.toLowerCase()) || d.slug?.toLowerCase().includes(search.toLowerCase())
    );
    const sorted = [...list].sort((a: any, b: any) => {
      const av = a[sort.key] ?? 0;
      const bv = b[sort.key] ?? 0;
      if (typeof av === "string") return sort.dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return sorted;
  }, [domains, search, sort]);

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
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Domain Database — All Domains</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-3 pt-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-n400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search domain…" className="pl-9" />
          </div>
          <div className="text-[12px] text-n500">{rows.length} domain{rows.length === 1 ? "" : "s"}</div>
        </div>

        <div className="overflow-auto border border-n200 rounded-md mt-3">
          <table className="w-full text-[13px]">
            <thead className="bg-n50 sticky top-0">
              <tr className="text-left">
                <SortHead k="name" label="Domain" />
                <SortHead k="total_lmps" label="Total LMPs" align="right" />
                <SortHead k="active_lmps" label="Active" align="right" />
                <SortHead k="converted_lmps" label="Converted" align="right" />
                <SortHead k="conversion_rate" label="Conv %" align="right" />
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium text-right">Mapped POCs</th>
                <th className="py-2.5 px-3 text-[11px] uppercase tracking-wide text-n500 font-medium text-right">Last Updated</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="py-8 text-center text-n500">Loading…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-n500">No domains found</td></tr>
              )}
              {rows.map((d: any) => (
                <tr key={d.id} className="border-t border-n100 hover:bg-n50">
                  <td className="py-2.5 px-3 font-medium text-n800">{d.name}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{d.total_lmps ?? 0}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{d.active_lmps ?? 0}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{d.converted_lmps ?? 0}</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{Number(d.conversion_rate ?? 0).toFixed(1)}%</td>
                  <td className="py-2.5 px-3 text-right tabular-nums">{mappedCounts?.[d.slug] ?? 0}</td>
                  <td className="py-2.5 px-3 text-right text-n500 text-[12px]">
                    {d.updated_at ? new Date(d.updated_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
