import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { isOutreachOnlyPoc } from "@/lib/prepPocEligibility";
import { supabase } from "@/integrations/supabase/client";
import { usePocProfiles, useLmpProcesses, clearCachePrefix } from "@/lib/hooks/useDbData";
import { useRole } from "@/lib/rolesContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export type ReassignScope = "all" | "support_outreach";

type PocOpt = {
  id: string;
  name: string;
  role_type?: string | null;
  initials?: string | null;
  color?: string | null;
  active_load?: number | null;
  max_threshold?: number | null;
  domain_tags?: string[] | null;
};

/**
 * Reassign POCs on an existing LMP process.
 * Updates `lmp_processes` (UUID + legacy name columns), inserts a timeline
 * entry per changed role, and writes an audit row. Outreach is multi-select.
 */
export function ReassignPocModal({
  open,
  onOpenChange,
  lmpId,
  lmpLabel,
  scope = "all",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lmpId: string;
  lmpLabel?: string;
  scope?: ReassignScope;
}) {
  const { user } = useRole();
  const qc = useQueryClient();
  const { data: profiles = [], isLoading } = usePocProfiles();
  const { data: processes = [] } = useLmpProcesses();

  const dbRow = useMemo(
    () => (processes as any[]).find((p) => p.id === lmpId),
    [processes, lmpId],
  );

  const resolveByName = (name?: string | null) => {
    if (!name) return null;
    const n = name.toLowerCase().trim();
    const found = (profiles as PocOpt[]).find((p) => p.name.toLowerCase().trim() === n);
    return found?.id ?? null;
  };

  const initialPrep = (dbRow?.prep_poc_id as string | null) ?? resolveByName(dbRow?.prep_poc);
  const initialSupport =
    (dbRow?.support_poc_id as string | null) ?? resolveByName(dbRow?.support_poc);
  const initialOutreach: string[] = (() => {
    if (Array.isArray(dbRow?.outreach_poc_ids) && dbRow.outreach_poc_ids.length) {
      return dbRow.outreach_poc_ids as string[];
    }
    return ((dbRow?.outreach_poc as string | undefined) || "")
      .split(/[/,&+]| and /i)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((n) => resolveByName(n))
      .filter(Boolean) as string[];
  })();

  const [prepId, setPrepId] = useState<string | null>(initialPrep);
  const [supportId, setSupportId] = useState<string | null>(initialSupport);
  const [outreachIds, setOutreachIds] = useState<string[]>(initialOutreach);
  const [query, setQuery] = useState("");

  // Reset when dialog opens with a fresh record / once profiles arrive
  useEffect(() => {
    if (open) {
      setPrepId(initialPrep);
      setSupportId(initialSupport);
      setOutreachIds(initialOutreach);
      setQuery("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lmpId, dbRow?.id, profiles.length]);

  const byId = useMemo(() => {
    const m = new Map<string, PocOpt>();
    for (const p of profiles as PocOpt[]) m.set(p.id, p);
    return m;
  }, [profiles]);

  const [activeRow, setActiveRow] = useState<"prep" | "support" | "outreach">(
    scope === "support_outreach" ? "support" : "prep",
  );

  const { pocs: eligiblePrepPocs } = useEligiblePrepPocs();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list: PocOpt[];
    if (activeRow === "outreach") {
      list = (profiles as PocOpt[]).filter(
        (p) => p.name && isOutreachOnlyPoc(p.role_type),
      );
    } else {
      const eligibleIds = new Set(eligiblePrepPocs.map((p) => p.pocId));
      list = (profiles as PocOpt[]).filter(
        (p) => p.name && eligibleIds.has(p.id),
      );
    }
    if (!q) return list;
    return list.filter((p) => p.name.toLowerCase().includes(q));
  }, [profiles, query, activeRow, eligiblePrepPocs]);

  const handlePick = (id: string) => {
    if (activeRow === "prep") setPrepId(id);
    else if (activeRow === "support") setSupportId(id);
    else {
      setOutreachIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const orig = (processes as any[]).find((p) => p.id === lmpId);
      const patch: Record<string, any> = { sync_source: "app" };
      const changes: Array<{
        role: "prep" | "support" | "outreach";
        from: string | null;
        to: string | null;
        fromId: string | null;
        toId: string | null;
      }> = [];

      const nameOf = (id?: string | null) => (id ? byId.get(id)?.name ?? null : null);

      if (scope === "all") {
        const newPrepName = nameOf(prepId);
        if ((orig?.prep_poc_id ?? null) !== (prepId ?? null)) {
          patch.prep_poc_id = prepId;
          patch.prep_poc = newPrepName;
          changes.push({
            role: "prep",
            from: orig?.prep_poc ?? null,
            to: newPrepName,
            fromId: orig?.prep_poc_id ?? null,
            toId: prepId ?? null,
          });
        }
      }

      const newSupportName = nameOf(supportId);
      if ((orig?.support_poc_id ?? null) !== (supportId ?? null)) {
        patch.support_poc_id = supportId;
        patch.support_poc = newSupportName;
        changes.push({
          role: "support",
          from: orig?.support_poc ?? null,
          to: newSupportName,
          fromId: orig?.support_poc_id ?? null,
          toId: supportId ?? null,
        });
      }

      const origOutreach: string[] = Array.isArray(orig?.outreach_poc_ids)
        ? orig.outreach_poc_ids
        : [];
      const sortedNew = [...outreachIds].sort();
      const sortedOld = [...origOutreach].sort();
      const outreachChanged =
        sortedNew.length !== sortedOld.length ||
        sortedNew.some((id, i) => id !== sortedOld[i]);
      if (outreachChanged) {
        const names = outreachIds.map((id) => byId.get(id)?.name).filter(Boolean) as string[];
        patch.outreach_poc_ids = outreachIds;
        patch.outreach_poc = names.length ? names.join(" / ") : null;
        changes.push({
          role: "outreach",
          from: orig?.outreach_poc ?? null,
          to: names.length ? names.join(" / ") : null,
          fromId: null,
          toId: null,
        });
      }

      if (changes.length === 0) {
        return { changes: 0 };
      }

      const { error } = await (supabase as any)
        .from("lmp_processes")
        .update(patch)
        .eq("id", lmpId);
      if (error) throw new Error(error.message);

      // Timeline + audit (best-effort, don't fail the save if these fail)
      const actor = user?.name || user?.email || "System";
      try {
        await Promise.all(
          changes.map((c) =>
            (supabase as any).from("lmp_timeline").insert({
              lmp_id: lmpId,
              event_type: "poc_reassigned",
              description: `${c.role === "prep" ? "Prep POC" : c.role === "support" ? "Support POC" : "Outreach POC"}: ${c.from ?? "—"} → ${c.to ?? "—"}`,
              actor,
              metadata: { role: c.role, from_id: c.fromId, to_id: c.toId },
            }),
          ),
        );
      } catch { /* ignore */ }

      try {
        await (supabase as any).from("activity_log").insert({
          action: "reassign_poc",
          entity_id: lmpId,
          entity_type: "lmp_process",
          actor_name: actor,
          metadata: { changes },
        });
      } catch { /* ignore */ }

      return { changes: changes.length };
    },
    onSuccess: (res) => {
      if (res.changes === 0) {
        toast.info("No changes to save");
        onOpenChange(false);
        return;
      }
      toast.success(`POC assignment updated`);
      clearCachePrefix('["db-lmp-processes');
      clearCachePrefix('["db-poc-switcher-list');
      clearCachePrefix('["db-poc-profiles-with-load');
      clearCachePrefix('["eligible_prep_pocs');
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp"] });
      qc.invalidateQueries({ queryKey: ["db-poc-assignments"] });
      qc.invalidateQueries({ queryKey: ["db-poc-switcher-list"] });
      qc.invalidateQueries({ queryKey: ["eligible_prep_pocs"] });
      qc.invalidateQueries({ queryKey: ["prep_poc_capacity_live_v2"] });
      qc.invalidateQueries({ queryKey: ["sheet-lmp-rows"] });
      qc.invalidateQueries({ queryKey: ["lmp-timeline"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update POCs"),
  });

  const renderChip = (id: string | null, placeholder: string) => {
    if (!id) return <span className="text-n400 italic">{placeholder}</span>;
    const p = byId.get(id);
    return (
      <span className="inline-flex items-center gap-2">
        <span
          className={cn(
            "h-6 w-6 shrink-0 rounded-full inline-flex items-center justify-center text-[10px] font-semibold",
            p?.color || "bg-n200 text-n700",
          )}
        >
          {p?.initials || p?.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
        </span>
        <span className="text-n900 text-[13px] font-medium">{p?.name ?? "Unknown"}</span>
      </span>
    );
  };

  const Row = ({
    label,
    rowKey,
    value,
    onClear,
    disabled,
  }: {
    label: string;
    rowKey: "prep" | "support" | "outreach";
    value: React.ReactNode;
    onClear?: () => void;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={() => !disabled && setActiveRow(rowKey)}
      disabled={disabled}
      className={cn(
        "w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        activeRow === rowKey && !disabled
          ? "border-orange-400 bg-orange-50/40"
          : "border-n200 hover:border-n300 bg-card",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wider text-n500 font-medium">{label}</div>
        <div className="mt-0.5 truncate">{value}</div>
      </div>
      {onClear && (
        <span
          role="button"
          aria-label={`Clear ${label}`}
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md text-n400 hover:text-n900 hover:bg-n100"
        >
          <X className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Reassign POCs</DialogTitle>
          <DialogDescription>
            {lmpLabel ? (
              <>Change POC assignments for <span className="font-medium">{lmpLabel}</span>.</>
            ) : (
              "Change POC assignments for this LMP process."
            )}
            {scope === "support_outreach" && (
              <span className="block mt-1 text-[12px] text-n500">
                Prep POC can only be changed by an admin or allocator.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2.5">
          <Row
            label="Prep POC"
            rowKey="prep"
            value={renderChip(prepId, "No prep POC")}
            onClear={prepId ? () => setPrepId(null) : undefined}
            disabled={scope === "support_outreach"}
          />
          <Row
            label="Support POC"
            rowKey="support"
            value={renderChip(supportId, "No support POC")}
            onClear={supportId ? () => setSupportId(null) : undefined}
          />
          <Row
            label="Outreach POCs"
            rowKey="outreach"
            value={
              outreachIds.length === 0 ? (
                <span className="text-n400 italic">No outreach POCs</span>
              ) : (
                <span className="flex flex-wrap gap-1.5">
                  {outreachIds.map((id) => {
                    const p = byId.get(id);
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center gap-1 rounded-full bg-n100 border border-n200 px-2 py-0.5 text-[12px] text-n800"
                      >
                        {p?.name ?? id}
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOutreachIds((prev) => prev.filter((x) => x !== id));
                          }}
                          className="ml-0.5 text-n500 hover:text-n900"
                        >
                          <X className="h-3 w-3" />
                        </span>
                      </span>
                    );
                  })}
                </span>
              )
            }
          />
        </div>

        <div className="mt-2">
          <div className="text-[11px] uppercase tracking-wider text-n500 font-medium mb-1.5">
            Choose POC for{" "}
            {activeRow === "prep" ? "Prep" : activeRow === "support" ? "Support" : "Outreach"}
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search POCs by name…"
              className="pl-8"
            />
          </div>
          <ScrollArea className="h-60 mt-2 pr-2 -mr-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-40 text-n500 text-sm">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading POCs…
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center h-40 text-n500 text-sm italic">
                No POCs found.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {filtered.map((p) => {
                  const isSelected =
                    activeRow === "prep"
                      ? prepId === p.id
                      : activeRow === "support"
                        ? supportId === p.id
                        : outreachIds.includes(p.id);
                  const load = p.active_load ?? 0;
                  const threshold = p.max_threshold ?? 0;
                  const over = threshold > 0 && load >= threshold;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => handlePick(p.id)}
                        className={cn(
                          "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                          isSelected
                            ? "border-orange-400 bg-orange-50/40"
                            : "border-n200 hover:border-n300 hover:bg-n50",
                        )}
                      >
                        <span
                          className={cn(
                            "h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center text-[11px] font-semibold",
                            p.color || "bg-n200 text-n700",
                          )}
                        >
                          {p.initials ||
                            p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-n900 truncate">{p.name}</div>
                          <div className="text-[11.5px] text-n500 truncate">
                            {p.role_type ?? "POC"}
                            {threshold > 0 && (
                              <>
                                {" · Load "}
                                <span className={cn(over && "text-coral-600 font-medium")}>
                                  {load}/{threshold}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[11px] font-medium text-orange-600">Selected</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
