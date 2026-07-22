import { useMemo, useState } from "react";
import { Loader2, Search, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOutreachPocs } from "@/lib/hooks/usePocRegistry";
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

export function AddOutreachPocDialog({
  open,
  onOpenChange,
  lmpId,
  lmpLabel,
  currentOutreachPocName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lmpId: string;
  lmpLabel?: string;
  currentOutreachPocName?: string | null;
}) {
  const { data: pocs = [], isLoading } = useOutreachPocs();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(currentOutreachPocName ?? null);
  const qc = useQueryClient();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pocs;
    return pocs.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.company_experience ?? []).some((c) => c.toLowerCase().includes(q)),
    );
  }, [pocs, query]);

  const save = useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase
        .from("lmp_processes")
        .update({ outreach_poc: name, sync_source: "app" })
        .eq("id", lmpId)
        .select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) {
        throw new Error(
          "PERMISSION_DENIED_OR_ROW_MISSING: You are not linked as an " +
          "operational POC for this LMP. Ask an admin to verify your POC " +
          "mapping and LMP assignment."
        );
      }
      return name;
    },
    onSuccess: (name) => {
      toast.success(`Outreach POC set to ${name}`);
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp"] });
      qc.invalidateQueries({ queryKey: ["db-poc-assignments"] });
      qc.invalidateQueries({ queryKey: ["db-poc-switcher-list"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message || "Failed to update outreach POC"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Outreach POC</DialogTitle>
          <DialogDescription>
            {lmpLabel ? <>Assign an outreach POC for <span className="font-medium">{lmpLabel}</span>.</> : "Select an outreach POC from the directory."}
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-n400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outreach POCs by name or company…"
            className="pl-8"
          />
        </div>

        <ScrollArea className="h-72 pr-2 -mr-2">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-n500 text-sm">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading outreach POCs…
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-40 text-n500 text-sm italic">
              No outreach POCs found.
            </div>
          ) : (
            <ul className="space-y-1.5">
              {filtered.map((p) => {
                const isSelected = selected === p.name;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(p.name)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "border-emerald-400 bg-emerald-50/50"
                          : "border-n200 hover:border-n300 hover:bg-n50",
                      )}
                    >
                      <span className={cn("h-9 w-9 shrink-0 rounded-full inline-flex items-center justify-center text-[11px] font-semibold", p.color || "bg-n200 text-n700")}>
                        {p.initials || p.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-medium text-n900 truncate">{p.name}</div>
                        <div className="text-[11.5px] text-n500 truncate">
                          {p.availability === "available" ? "Available" : p.availability}
                          {p.company_experience?.length ? ` · ${p.company_experience.slice(0, 3).join(", ")}` : ""}
                        </div>
                      </div>
                      {isSelected && <Check className="h-4 w-4 text-emerald-600 shrink-0" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => selected && save.mutate(selected)}
            disabled={!selected || save.isPending || selected === currentOutreachPocName}
          >
            {save.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            {currentOutreachPocName ? "Update Outreach POC" : "Assign Outreach POC"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
