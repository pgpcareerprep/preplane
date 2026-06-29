import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useUpsertCohort } from "@/lib/hooks/useCohortProgram";
import { normalizeCohortCode } from "@/lib/cohortProgram";
import { toast } from "sonner";
import type { CohortRow } from "@/lib/hooks/useCohortProgram";

export function CreateCohortModal({
  open,
  onOpenChange,
  editRow,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editRow?: CohortRow | null;
}) {
  const upsert = useUpsertCohort();
  const [code, setCode] = useState(editRow?.code ?? "");
  const [name, setName] = useState(editRow?.name ?? "");
  const [description, setDescription] = useState(editRow?.description ?? "");
  const [isActive, setIsActive] = useState(editRow?.is_active ?? true);

  const reset = () => {
    setCode(editRow?.code ?? "");
    setName(editRow?.name ?? "");
    setDescription(editRow?.description ?? "");
    setIsActive(editRow?.is_active ?? true);
  };

  const handleSubmit = async () => {
    const norm = normalizeCohortCode(code);
    if (!norm) {
      toast.error("Cohort code is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Cohort name is required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editRow?.id,
        code: norm,
        name: name.trim(),
        description: description.trim() || undefined,
        is_active: isActive,
      });
      toast.success(editRow ? "Cohort updated" : "Cohort created");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save cohort");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editRow ? "Edit Cohort" : "Create Cohort"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="cohort-code">Cohort code</Label>
            <Input id="cohort-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="C7" disabled={!!editRow} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cohort-name">Cohort name</Label>
            <Input id="cohort-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Cohort 7" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cohort-desc">Description (optional)</Label>
            <Input id="cohort-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="cohort-active">Active</Label>
            <Switch id="cohort-active" checked={isActive} onCheckedChange={setIsActive} />
          </div>
          <Button className="w-full" onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : editRow ? "Save changes" : "Create cohort"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
