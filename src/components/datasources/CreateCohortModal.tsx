import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useDeleteProgram,
  usePrograms,
  useProgramStudentCount,
  useUpsertCohort,
  type CohortRow,
  type ProgramRow,
} from "@/lib/hooks/useCohortProgram";
import { normalizeCohortCode } from "@/lib/cohortProgram";
import { toast } from "sonner";

function ProgramDeleteRow({
  program,
  onEdit,
  onDeleted,
}: {
  program: ProgramRow;
  onEdit: (p: ProgramRow) => void;
  onDeleted: () => void;
}) {
  const deleteProgram = useDeleteProgram();
  const { data: studentCount = 0 } = useProgramStudentCount(program.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDelete = async () => {
    try {
      await deleteProgram.mutateAsync(program.id);
      toast.success(`Program ${program.code} deleted`);
      setConfirmOpen(false);
      onDeleted();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete program");
    }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2 rounded-md border border-border/80 px-2.5 py-1.5">
        <div className="min-w-0">
          <span className="text-sm font-medium">{program.code}</span>
          <span className="text-xs text-muted-foreground ml-2 truncate">{program.name}</span>
          {!program.is_active && <span className="text-[10px] text-muted-foreground ml-1">(inactive)</span>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-foreground"
            onClick={() => onEdit(program)}
            title="Edit program"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="p-1 text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmOpen(true)}
            title="Delete program"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete program {program.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the program from the cohort.
              {studentCount > 0
                ? ` ${studentCount} student${studentCount === 1 ? "" : "s"} assigned to this program will have their program cleared.`
                : " No students are currently assigned to this program."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteProgram.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteProgram.isPending}
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleteProgram.isPending ? "Deleting…" : "Delete program"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function CreateCohortModal({
  open,
  onOpenChange,
  editRow,
  onEditProgram,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editRow?: CohortRow | null;
  onEditProgram?: (program: ProgramRow) => void;
}) {
  const upsert = useUpsertCohort();
  const { data: cohortPrograms = [], refetch: refetchPrograms } = usePrograms(editRow?.id ?? null, false);
  const [code, setCode] = useState(editRow?.code ?? "");
  const [name, setName] = useState(editRow?.name ?? "");
  const [description, setDescription] = useState(editRow?.description ?? "");
  const [isActive, setIsActive] = useState(editRow?.is_active ?? true);

  useEffect(() => {
    if (open) {
      setCode(editRow?.code ?? "");
      setName(editRow?.name ?? "");
      setDescription(editRow?.description ?? "");
      setIsActive(editRow?.is_active ?? true);
    }
  }, [open, editRow]);

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

          {editRow && (
            <div className="space-y-2 pt-1 border-t border-border">
              <Label>Programs in this cohort</Label>
              {cohortPrograms.length === 0 ? (
                <p className="text-xs text-muted-foreground">No programs yet. Add one from the cohort card.</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {cohortPrograms.map((p) => (
                    <ProgramDeleteRow
                      key={p.id}
                      program={p}
                      onEdit={(prog) => onEditProgram?.(prog)}
                      onDeleted={() => void refetchPrograms()}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          <Button className="w-full" onClick={handleSubmit} disabled={upsert.isPending}>
            {upsert.isPending ? "Saving…" : editRow ? "Save changes" : "Create cohort"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
