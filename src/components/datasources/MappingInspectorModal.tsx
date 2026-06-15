import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw, AlertTriangle, Search, X, ArrowLeftRight, ArrowLeft, ArrowRight, Settings2, ChevronDown, ChevronUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { useSyncIngest } from "@/lib/hooks/useDbData";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SHEET_TO_DB, DB_TO_SHEET } from "@/lib/sheets/fieldMap";

const ACTIVE_TAB = "LMP Tracker" as const;
const CALCULATED_FIELDS = new Set([
  "pool_count", "pool_names",
  "r1_count", "r2_count", "r3_count",
  "mentor_feedback_avg", "mentor_rating", "mentor_selected",
]);

type Registry = {
  id: string;
  tab_name: string;
  sheet_column: string;
  app_field: string | null;
  sync_direction: string;
  is_mapped: boolean;
  data_coverage_pct: number | null;
  last_verified_at: string | null;
  notes: string | null;
};

const colLetter = (i: number) => {
  let s = ""; let n = i + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

const normalizeHeader = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

const relativeTime = (iso: string | null) => {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
};

function DirectionBadge({ direction }: { direction: string }) {
  const d = (direction || "").toLowerCase();
  if (d === "bidirectional" || d === "both" || d === "two-way") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-[11px] font-medium"><ArrowLeftRight className="h-3 w-3" /> Bidirectional</span>;
  }
  if (d === "read" || d === "sheet_to_db" || d === "sheet→db") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 text-[11px] font-medium"><ArrowLeft className="h-3 w-3" /> Sheet → DB</span>;
  }
  if (d === "write" || d === "db_to_sheet" || d === "db→sheet" || d === "computed") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-[11px] font-medium"><ArrowRight className="h-3 w-3" /> DB → Sheet</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-n100 text-n600 border border-n200 px-2 py-0.5 text-[11px] font-medium"><Settings2 className="h-3 w-3" /> {direction || "—"}</span>;
}

function StatusChip({ kind }: { kind: "declared" | "undeclared" | "wired" | "not wired" | "registry only" | "sheet only" | "DB only" | "conflict" }) {
  const map: Record<string, string> = {
    declared: "bg-emerald-50 text-emerald-700 border-emerald-200",
    wired: "bg-emerald-50 text-emerald-700 border-emerald-200",
    undeclared: "bg-amber-50 text-amber-700 border-amber-200",
    "not wired": "bg-amber-50 text-amber-700 border-amber-200",
    "registry only": "bg-amber-50 text-amber-700 border-amber-200",
    "sheet only": "bg-amber-50 text-amber-700 border-amber-200",
    "DB only": "bg-amber-50 text-amber-700 border-amber-200",
    conflict: "bg-coral-50 text-coral-600 border-coral-200",
  };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10.5px] font-medium", map[kind])}>{kind}</span>;
}

function useRegistry() {
  return useQuery<Registry[]>({
    queryKey: ["field-mapping-registry"],
    queryFn: async () => {
      const { data, error } = await supabase.from("field_mapping_registry").select("*").order("tab_name").order("sheet_column");
      if (error) throw error;
      return (data ?? []) as Registry[];
    },
    staleTime: 60_000,
  });
}

export function MappingInspectorModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { role } = useRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();
  const syncIngest = useSyncIngest();

  const [search, setSearch] = useState("");

  const { data: registry, isLoading: regLoading } = useRegistry();

  const reverify = useMutation({
    mutationFn: async () => {
      await syncIngest.mutateAsync("lmp");
      const tabRows = (registry ?? []).filter((r) => r.tab_name === ACTIVE_TAB);
      if (tabRows.length) {
        await supabase.from("field_mapping_registry")
          .update({ last_verified_at: new Date().toISOString() })
          .in("id", tabRows.map((r) => r.id));
      }
      return { matched: tabRows.length };
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["field-mapping-registry"] });
      toast({ title: "Mapping re-verified", description: `${r.matched} fields verified` });
    },
    onError: (e: Error) => toast({ title: "Re-verify failed", description: e.message, variant: "destructive" }),
  });

  const tabRows = useMemo(() => {
    const all = registry ?? [];
    const filtered = all.filter((r) => r.tab_name === ACTIVE_TAB);

    const colRegex = /^col\s+([a-z]+)\b/i;
    const humanize = (s: string | null | undefined) =>
      (s || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    const enriched = filtered.map((r) => {
      const calculated = r.app_field ? CALCULATED_FIELDS.has(r.app_field) : false;
      let col = "—";
      const m = colRegex.exec(r.sheet_column) || colRegex.exec(r.notes || "");
      if (m) col = m[1].toUpperCase();
      let displayHeader = r.sheet_column;
      const stripped = displayHeader.replace(colRegex, "").trim();
      if (!stripped) displayHeader = humanize(r.app_field) || r.sheet_column;
      else if (stripped !== displayHeader) displayHeader = stripped;
      return { ...r, col, displayHeader, calculated };
    });

    const colRank = (c: string) => {
      if (!c || c === "—") return Number.MAX_SAFE_INTEGER;
      let n = 0;
      for (const ch of c) n = n * 26 + (ch.charCodeAt(0) - 64);
      return n;
    };
    enriched.sort((a, b) => {
      const ra = colRank(a.col); const rb = colRank(b.col);
      if (ra !== rb) return ra - rb;
      return a.sheet_column.localeCompare(b.sheet_column);
    });

    if (!search.trim()) return enriched;
    const q = search.toLowerCase();
    return enriched.filter((r) =>
      r.sheet_column.toLowerCase().includes(q) ||
      (r.app_field || "").toLowerCase().includes(q) ||
      (r.displayHeader || "").toLowerCase().includes(q),
    );
  }, [registry, search]);

  const loading = regLoading;

  const lmpRegistry = useMemo(
    () => (registry ?? []).filter((r) => r.tab_name === ACTIVE_TAB),
    [registry],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-n200">
          <DialogTitle className="text-[20px] font-semibold text-n900 flex items-center gap-2">
            Mapping Inspector
            <span className="text-[11px] font-normal text-n500 border border-n200 rounded-full px-2 py-0.5">LMP Tracker</span>
          </DialogTitle>
          <p className="text-[13px] text-n500 mt-1">
            DB ↔ Sheet column mapping for the LMP Tracker, with declared / wired status.
          </p>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-n100 flex items-center gap-2 flex-wrap bg-n50/40">
          <div className="relative w-72">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-n400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search header, DB column…"
              className="w-full pl-8 pr-8 py-1.5 rounded-md border border-n200 text-[13px] bg-card focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-n400 hover:text-n700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          {isAdmin && (
            <button
              onClick={() => reverify.mutate()}
              disabled={reverify.isPending || syncIngest.isPending}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-200 text-amber-700 hover:bg-amber-50 px-3 py-1.5 text-[12px] font-medium disabled:opacity-50"
            >
              {reverify.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Re-verify now
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-n500 text-[13px]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading mapping…
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-[12px] text-emerald-800">
                <span className="font-medium">One-way sync:</span> the LMP Tracker sheet is a mirror of the database.
                All writable columns are pushed from <code className="font-mono">lmp_processes</code> → Sheet.
                Manual edits in the sheet are <span className="font-medium">not</span> read back.
              </div>

              <CodeMapAudit registry={lmpRegistry} />

              

              <div className="rounded-md border border-n200 overflow-hidden">
                <table className="w-full text-[13px]">
                  <thead className="bg-n50 text-n600 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="text-left px-3 py-2 w-12">Col</th>
                      <th className="text-left px-3 py-2">Sheet header</th>
                      <th className="text-left px-3 py-2">DB column</th>
                      <th className="text-left px-3 py-2">Direction</th>
                      <th className="text-left px-3 py-2 w-28">Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabRows.length === 0 && (
                      <tr><td colSpan={5} className="text-center text-n400 py-8 text-[13px]">No mappings match.</td></tr>
                    )}
                    {tabRows.map((r) => {
                      const stale = !r.last_verified_at || (Date.now() - new Date(r.last_verified_at).getTime() > 7 * 24 * 60 * 60 * 1000);
                      const verifiedClass = !r.is_mapped || stale ? "text-coral-600" : "text-n600";
                      return (
                        <tr key={r.id} className="border-t border-n100 hover:bg-n50/50">
                          <td className="px-3 py-2 font-mono text-n500 text-[12px]">{r.col}</td>
                          <td className="px-3 py-2">
                            <div className="text-n900">{r.displayHeader}</div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-[12px] text-n800">{r.app_field || <span className="text-n400 italic">—</span>}</span>
                            {r.calculated && (
                              <span className="ml-1.5 inline-flex items-center rounded-full bg-n100 text-n600 border border-n200 px-1.5 py-[1px] text-[10px]">calculated</span>
                            )}
                            {r.notes && <div className="text-[11px] text-n500 mt-0.5">{r.notes}</div>}
                          </td>
                          <td className="px-3 py-2">
                            <DirectionBadge direction={r.calculated ? "computed" : r.sync_direction} />
                          </td>
                          <td className={cn("px-3 py-2 text-[12px] tabular-nums", verifiedClass)}>
                            {relativeTime(r.last_verified_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 text-[11px] text-n500">
                Showing {tabRows.length} of {lmpRegistry.length} fields in <span className="font-medium text-n700">LMP Tracker</span>.
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Code-level fieldMap audit for LMP Tracker — cross-references the actual
 * SHEET_TO_DB / DB_TO_SHEET maps (what the edge sync functions execute)
 * against the `field_mapping_registry` rows.
 */
function CodeMapAudit({ registry }: { registry: Registry[] }) {
  const [open, setOpen] = useState(true);

  const rows = useMemo(() => {
    const sheetByDb = new Map<string, string[]>();
    for (const [sheetCol, dbCol] of Object.entries(SHEET_TO_DB)) {
      const list = sheetByDb.get(dbCol) ?? [];
      list.push(sheetCol);
      sheetByDb.set(dbCol, list);
    }
    const dbCols = new Set<string>([
      ...Object.values(SHEET_TO_DB),
      ...Object.keys(DB_TO_SHEET),
    ]);

    const out = Array.from(dbCols).map((dbCol) => {
      const sheetHeaders = sheetByDb.get(dbCol) ?? [];
      const writeBackHeader = DB_TO_SHEET[dbCol];
      const hasRead = sheetHeaders.length > 0;
      const hasWrite = !!writeBackHeader;
      const direction: "read" | "write" | "bidirectional" = hasRead && hasWrite
        ? "bidirectional"
        : hasWrite
          ? "write"
          : "read";
      const headerForRegistry = writeBackHeader ?? sheetHeaders[0] ?? "";
      const registryHit = registry.find(
        (r) => normalizeHeader(r.app_field || "") === normalizeHeader(dbCol)
          || normalizeHeader(r.sheet_column) === normalizeHeader(headerForRegistry),
      );
      return { dbCol, sheetHeaders, writeBackHeader, direction, registryHit };
    });
    out.sort((a, b) => a.dbCol.localeCompare(b.dbCol));
    return out;
  }, [registry]);

  const registryOnly = useMemo(() => {
    const codeDbCols = new Set(rows.map((r) => r.dbCol.toLowerCase()));
    return registry.filter(
      (r) =>
        r.app_field &&
        !codeDbCols.has(r.app_field.toLowerCase()) &&
        // Exclude computed/calculated fields — they are wired via calcMap in the
        // edge function, not via the canonical SHEET_TO_DB / DB_TO_SHEET maps.
        r.sync_direction !== "computed",
    );
  }, [registry, rows]);

  const counts = useMemo(() => ({
    bidirectional: rows.filter((r) => r.direction === "bidirectional").length,
    read: rows.filter((r) => r.direction === "read").length,
    write: rows.filter((r) => r.direction === "write").length,
    registryOnly: registryOnly.length,
  }), [rows, registryOnly]);

  return (
    <div className="mb-4 rounded-md border border-n200 bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-n50"
      >
        <div className="flex items-center gap-2 text-[12px] font-medium text-n800">
          <Settings2 className="h-3.5 w-3.5 text-n500" />
          Code-level sync map (what the edge functions actually do)
          <span className="text-[11px] text-n500 font-normal">
            · {counts.bidirectional} both · {counts.read} sheet→DB · {counts.write} DB→sheet
            {counts.registryOnly > 0 && (
              <span className="text-amber-700"> · {counts.registryOnly} not wired in code</span>
            )}
          </span>
        </div>
        {open ? <ChevronUp className="h-3.5 w-3.5 text-n400" /> : <ChevronDown className="h-3.5 w-3.5 text-n400" />}
      </button>
      {open && (
        <div className="border-t border-n100">
          <table className="w-full text-[12.5px]">
            <thead className="bg-n50 text-n600 text-[10.5px] uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-1.5">DB column</th>
                <th className="text-left px-3 py-1.5">Sheet header(s)</th>
                <th className="text-left px-3 py-1.5 w-32">Direction</th>
                <th className="text-left px-3 py-1.5 w-32">Registry</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sheetText = r.direction === "write"
                  ? r.writeBackHeader
                  : r.sheetHeaders[0] + (r.sheetHeaders.length > 1 ? `  (+${r.sheetHeaders.length - 1})` : "");
                return (
                  <tr key={r.dbCol} className="border-t border-n100">
                    <td className="px-3 py-1.5 font-mono text-[12px] text-n800">{r.dbCol}</td>
                    <td className="px-3 py-1.5 text-n700">{sheetText}</td>
                    <td className="px-3 py-1.5"><DirectionBadge direction={r.direction} /></td>
                    <td className="px-3 py-1.5 text-[11.5px]">
                      {r.registryHit ? <StatusChip kind="declared" /> : <StatusChip kind="undeclared" />}
                    </td>
                  </tr>
                );
              })}
              {registryOnly.map((r) => (
                <tr key={`reg-${r.id}`} className="border-t border-n100">
                  <td className="px-3 py-1.5 font-mono text-[12px] text-n800">{r.app_field || "—"}</td>
                  <td className="px-3 py-1.5 text-n700">{r.sheet_column}</td>
                  <td className="px-3 py-1.5"><StatusChip kind="not wired" /></td>
                  <td className="px-3 py-1.5 text-[11.5px]"><StatusChip kind="registry only" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

