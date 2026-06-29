import { useEffect, useState } from "react";
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
  useCohorts,
  useDeleteProgram,
  useProgramStudentCount,
  useUpsertProgram,
  type ProgramRow,
} from "@/lib/hooks/useCohortProgram";
import { aliasesToInput, normalizeProgramCode } from "@/lib/cohortProgram";
import { toast } from "sonner";

export function AddProgramModal({
  open,
  onOpenChange,
  editRow,
  defaultCohortId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editRow?: ProgramRow | null;
  defaultCohortId?: string;
}) {
  const { data: cohorts = [] } = useCohorts(false);
  const upsert = useUpsertProgram();
  const deleteProgram = useDeleteProgram();
  const { data: studentCount = 0 } = useProgramStudentCount(editRow?.id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [cohortId, setCohortId] = useState(editRow?.cohort_id ?? defaultCohortId ?? "");
  const [code, setCode] = useState(editRow?.code ?? "");
  const [name, setName] = useState(editRow?.name ?? "");
  const [description, setDescription] = useState(editRow?.description ?? "");
  const [aliasesInput, setAliasesInput] = useState(aliasesToInput(editRow?.aliases));
  const [isActive, setIsActive] = useState(editRow?.is_active ?? true);

  useEffect(() => {
    if (open) {
      setCohortId(editRow?.cohort_id ?? defaultCohortId ?? cohorts[0]?.id ?? "");
      setCode(editRow?.code ?? "");
      setName(editRow?.name ?? "");
      setDescription(editRow?.description ?? "");
      setAliasesInput(aliasesToInput(editRow?.aliases));
      setIsActive(editRow?.is_active ?? true);
      setConfirmDelete(false);
    }
  }, [open, editRow, defaultCohortId, cohorts]);

  const handleSubmit = async () => {
    const norm = normalizeProgramCode(code);
    if (!cohortId) {
      toast.error("Select a cohort");
      return;
    }
    if (!norm) {
      toast.error("Program code is required");
      return;
    }
    if (!name.trim()) {
      toast.error("Program name is required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: editRow?.id,
        cohort_id: cohortId,
        code: norm,
        name: name.trim(),
        description: description.trim() || undefined,
        aliasesInput,
        is_active: isActive,
      });
      toast.success(editRow ? "Program updated" : "Program added");
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save program");
    }
  };

  const handleDelete = async () => {
    if (!editRow?.id) return;
    try {
      await deleteProgram.mutateAsync(editRow.id);
      toast.success(`Program ${editRow.code} deleted`);
      setConfirmDelete(false);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete program");
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editRow ? "Edit Program" : "Add Program"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="prog-cohort">Cohort</Label>
              <select
                id="prog-cohort"
                className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={cohortId}
                onChange={(e) => setCohortId(e.target.value)}
                disabled={!!editRow}
              >
                <option value="">Select cohort…</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-code">Program code</Label>
              <Input id="prog-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="HROS" disabled={!!editRow} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-name">Program name</Label>
              <Input id="prog-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Human Resources & Org Strategy" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-aliases">Aliases (comma-separated)</Label>
              <Input id="prog-aliases" value={aliasesInput} onChange={(e) => setAliasesInput(e.target.value)} placeholder="YLC2, PGP" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prog-desc">Description (optional)</Label>
              <Input id="prog-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="prog-active">Active</Label>
              <Switch id="prog-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
            <Button className="w-full" onClick={handleSubmit} disabled={upsert.isPending || deleteProgram.isPending}>
              {upsert.isPending ? "Saving…" : editRow ? "Save changes" : "Add program"}
            </Button>
            {editRow && (
              <Button
                type="button"
                variant="outline"
                className="w-full text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={() => setConfirmDelete(true)}
                disabled={upsert.isPending || deleteProgram.isPending}
              >
                Delete program
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete program {editRow?.code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the program from the cohort.
              {studentCount > 0
                ? ` ${studentCount} student${studentCount === 1 ? "" : "s"} currently assigned to this program will have their program cleared (cohort unchanged).`
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
