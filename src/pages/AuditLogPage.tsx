import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createRollbackPatch } from "@/lib/auditLog";
import { useRole } from "@/lib/rolesContext";
import { canRollback } from "@/lib/permissions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, RotateCcw, History, ArrowRight, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

type SortKey = "created_at" | "entity_type" | "action" | "actor_name" | "source";

export default function AuditLogPage() {
  const { user, viewAsRole } = useRole();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortAsc, setSortAsc] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<any>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });

  const entityTypes = useMemo(() => {
    const set = new Set(logs.map((l: any) => l.entity_type).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [logs]);

  const sources = useMemo(() => {
    const set = new Set(logs.map((l: any) => l.source).filter(Boolean));
    return ["All", ...Array.from(set).sort()];
  }, [logs]);

  const filtered = useMemo(() => {
    let rows = logs as any[];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.action?.toLowerCase().includes(q) ||
          l.actor_name?.toLowerCase().includes(q) ||
          l.entity_id?.toLowerCase().includes(q)
      );
    }
    if (entityFilter !== "All") rows = rows.filter((l) => l.entity_type === entityFilter);
    if (sourceFilter !== "All") rows = rows.filter((l) => l.source === sourceFilter);
    rows = [...rows].sort((a, b) => {
      const av = a[sortKey], bv = b[sortKey];
      if (sortKey === "created_at") return sortAsc ? new Date(av).getTime() - new Date(bv).getTime() : new Date(bv).getTime() - new Date(av).getTime();
      return sortAsc ? String(av ?? "").localeCompare(String(bv ?? "")) : String(bv ?? "").localeCompare(String(av ?? ""));
    });
    return rows;
  }, [logs, search, entityFilter, sourceFilter, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else { setSortKey(key); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: SortKey }) =>
    sortKey === col ? (sortAsc ? <ChevronUp className="h-3 w-3 inline ml-0.5" /> : <ChevronDown className="h-3 w-3 inline ml-0.5" />) : null;

  const rollbackMutation = useMutation({
    mutationFn: async (entry: any) => {
      const patch = createRollbackPatch(entry);
      if (!patch) throw new Error("Cannot create rollback patch for this entry");

      // Determine table from entity_type
      const tableMap: Record<string, string> = {
        lmp: "lmp_processes",
        student: "students",
        poc: "poc_profiles",
        domain: "domains",
      };
      const table = tableMap[entry.entity_type];
      if (!table || !entry.entity_id) throw new Error("Cannot rollback: unknown entity type or missing ID");

      const updatePayload = { [patch.field]: patch.value } as any;
      const { error } = await supabase
        .from(table as any)
        .update(updatePayload)
        .eq("id", entry.entity_id);
      if (error) throw error;

      // Log the rollback itself
      await supabase.from("activity_log").insert({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: `rollback:${patch.field}`,
        actor_name: user.name,
        previous_value: entry.new_value,
        new_value: patch.value,
        source: "ui",
        metadata: { rolled_back_entry_id: entry.id },
      });

      return patch;
    },
    onSuccess: (patch) => {
      qc.invalidateQueries({ queryKey: ["audit-logs"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-students"] });
      qc.invalidateQueries({ queryKey: ["db-poc-profiles"] });
      toast({ title: "Rollback applied", description: `Field "${patch.field}" restored to previous value.` });
      setRollbackTarget(null);
    },
    onError: (e: Error) => {
      toast({ title: "Rollback failed", description: e.message, variant: "destructive" });
    },
  });

  const sourceColor = (s: string) => {
    const map: Record<string, string> = {
      ui: "bg-blue-50 text-blue-700",
      sheet: "bg-green-50 text-green-700",
      copilot: "bg-purple-50 text-purple-700",
      sync: "bg-orange-50 text-orange-700",
    };
    return map[s] || "bg-muted text-muted-foreground";
  };

  const canUserRollback = (entry: any) => {
    return entry.action?.startsWith("field_update:") &&
      entry.entity_id &&
      canRollback(viewAsRole, user.name, entry.actor_name);
  };

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div>
          <div className="text-[10px] uppercase tracking-[1px] font-semibold text-orange-600 mb-1">Audit & Rollback Engine</div>
          <h2 className="text-[32px] leading-[1.15] font-bold tracking-[-1px] text-foreground">
            Activity <span className="font-display text-orange-500">log</span>
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {logs.length} entries · field-level tracking with rollback support
          </p>
        </div>
      </motion.div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Events", value: logs.length, accent: "text-blue-600 bg-blue-50" },
          { label: "Field Updates", value: logs.filter((l: any) => l.action?.startsWith("field_update:")).length, accent: "text-green-600 bg-green-50" },
          { label: "Rollbacks", value: logs.filter((l: any) => l.action?.startsWith("rollback:")).length, accent: "text-orange-600 bg-orange-50" },
          { label: "Sources", value: sources.length - 1, accent: "text-purple-600 bg-purple-50" },
        ].map((k) => (
          <div key={k.label} className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-2">
              <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${k.accent}`}>
                <History className="h-4 w-4" />
              </div>
              <span className="text-[11px] uppercase tracking-[0.5px] font-medium text-muted-foreground">{k.label}</span>
            </div>
            <div className="text-[22px] font-bold text-foreground tabular-nums">{k.value.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search action, actor, entity..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9 text-[13px]" />
        </div>
        <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)} className="h-9 rounded-md border bg-card px-3 text-[13px] text-foreground">
          {entityTypes.map((e) => <option key={e} value={e}>{e === "All" ? "All Entities" : e}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="h-9 rounded-md border bg-card px-3 text-[13px] text-foreground">
          {sources.map((s) => <option key={s} value={s}>{s === "All" ? "All Sources" : s}</option>)}
        </select>
        <span className="text-[12px] text-muted-foreground">{filtered.length} shown</span>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
      ) : (
        <ScrollArea className="rounded-xl border bg-card shadow-sm" style={{ maxHeight: "65vh" }}>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                {([
                  ["created_at", "Time"],
                  ["entity_type", "Entity"],
                  ["action", "Action"],
                  ["actor_name", "Actor"],
                  ["source", "Source"],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <TableHead key={key} className="cursor-pointer select-none whitespace-nowrap text-[11px] uppercase tracking-[0.5px]" onClick={() => toggleSort(key)}>
                    {label}<SortIcon col={key} />
                  </TableHead>
                ))}
                <TableHead className="text-[11px] uppercase tracking-[0.5px]">Change</TableHead>
                <TableHead className="text-[11px] uppercase tracking-[0.5px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((l: any) => (
                <TableRow key={l.id} className="text-[13px]">
                  <TableCell className="text-muted-foreground whitespace-nowrap tabular-nums text-[12px]">
                    {new Date(l.created_at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">{l.entity_type}</Badge>
                  </TableCell>
                  <TableCell className="font-mono text-[12px] text-foreground max-w-[200px] truncate">{l.action}</TableCell>
                  <TableCell className="text-foreground font-medium">{l.actor_name}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${sourceColor(l.source)}`}>
                      {l.source}
                    </span>
                  </TableCell>
                  <TableCell>
                    {l.previous_value || l.new_value ? (
                      <div className="flex items-center gap-1 text-[11px] max-w-[220px]">
                        <span className="text-red-500 line-through truncate max-w-[90px]" title={l.previous_value}>{l.previous_value || "∅"}</span>
                        <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="text-green-600 truncate max-w-[90px]" title={l.new_value}>{l.new_value || "∅"}</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {canUserRollback(l) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                        onClick={() => setRollbackTarget(l)}
                      >
                        <RotateCcw className="h-3 w-3 mr-1" /> Rollback
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}

      {/* Rollback confirmation dialog */}
      <Dialog open={!!rollbackTarget} onOpenChange={(open) => !open && setRollbackTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Rollback</DialogTitle>
            <DialogDescription>
              This will revert the field change and log a rollback entry in the audit trail.
            </DialogDescription>
          </DialogHeader>
          {rollbackTarget && (
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <div className="text-muted-foreground">Action</div>
                <div className="font-mono text-foreground">{rollbackTarget.action}</div>
                <div className="text-muted-foreground">Actor</div>
                <div className="text-foreground">{rollbackTarget.actor_name}</div>
                <div className="text-muted-foreground">Current value</div>
                <div className="text-green-600 font-medium">{rollbackTarget.new_value || "∅"}</div>
                <div className="text-muted-foreground">Will restore to</div>
                <div className="text-orange-600 font-medium">{rollbackTarget.previous_value || "∅"}</div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>Cancel</Button>
            <Button
              variant="default"
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => rollbackTarget && rollbackMutation.mutate(rollbackTarget)}
              disabled={rollbackMutation.isPending}
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              {rollbackMutation.isPending ? "Rolling back..." : "Confirm Rollback"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
