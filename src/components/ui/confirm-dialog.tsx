import { AlertTriangle, OctagonAlert } from "lucide-react";
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
import { cn } from "@/lib/utils";

type Tone = "danger" | "warning";

/**
 * Branded confirmation dialog — 400px, scale-in entrance, 48px round icon,
 * coral (danger) or yellow (warning) accent. Use for destructive or
 * irreversible actions.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  confirmDisabled = false,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  onConfirm: () => void;
  /** Disables the confirm button (e.g. while a required field is empty). */
  confirmDisabled?: boolean;
  /** Optional body content (forms, inputs) rendered between description and footer. */
  children?: React.ReactNode;
}) {
  const isDanger = tone === "danger";
  const Icon = isDanger ? OctagonAlert : AlertTriangle;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[400px] max-w-[calc(100vw-32px)] rounded-2xl border-n200 shadow-xl p-6 data-[state=open]:motion-safe:animate-scale-in">
        <AlertDialogHeader className="items-center text-center">
          <div
            className={cn(
              "h-12 w-12 rounded-full grid place-items-center mb-2",
              isDanger ? "bg-coral-50 text-coral-600" : "bg-yellow-50 text-yellow-600",
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </div>
          <AlertDialogTitle className="text-[16px] font-semibold text-n900">
            {title}
          </AlertDialogTitle>
          {description && (
            <AlertDialogDescription className="text-[14px] text-n600 leading-relaxed">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {children && <div className="mt-2">{children}</div>}
        <AlertDialogFooter className="mt-2 gap-2 sm:justify-end">
          <AlertDialogCancel
            className="rounded-md border-0 bg-transparent text-n600 hover:text-n900 hover:bg-n100 text-[13px] font-medium px-3 h-9 mt-0"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={confirmDisabled}
            className={cn(
              "rounded-md text-white text-[13px] font-medium px-4 h-9 shadow-sm transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-current",
              isDanger
                ? "bg-coral-400 hover:bg-coral-600"
                : "bg-orange-500 hover:bg-orange-600",
            )}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}