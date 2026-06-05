import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useDeactivatePoc, useDeletePoc } from "@/lib/hooks/usePocMutations";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  poc: { id: string; name: string; status?: string };
  onDeleted?: () => void;
};

export function PocDeleteDialog({ open, onOpenChange, poc, onDeleted }: Props) {
  const deactivate = useDeactivatePoc();
  const del = useDeletePoc();
  const busy = deactivate.isPending || del.isPending;

  const handleDeactivate = async () => {
    await deactivate.mutateAsync(poc.id);
    onDeleted?.();
  };
  const handleDelete = async () => {
    await del.mutateAsync({ id: poc.id, name: poc.name });
    onDeleted?.();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {poc.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>Deactivate</strong> keeps history and excludes them from new allocations.{" "}
            <strong>Delete permanently</strong> removes the POC profile and registry entry — this can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          {poc.status !== "inactive" && (
            <Button variant="outline" onClick={handleDeactivate} disabled={busy}>
              Deactivate
            </Button>
          )}
          <Button variant="destructive" onClick={handleDelete} disabled={busy}>
            Delete permanently
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
