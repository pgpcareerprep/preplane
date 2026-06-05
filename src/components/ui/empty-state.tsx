/**
 * EmptyState
 * ----------
 * Friendly placeholder shown when a query returns zero rows. Uses semantic
 * tokens so it adapts to light/dark themes set in `index.css` /
 * `tailwind.config.ts`.
 */
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  /** Compact variant for inline / card contexts. */
  compact?: boolean;
}

export function EmptyState({
  icon: Icon = Inbox,
  title = "Nothing here yet",
  description,
  action,
  className,
  compact,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-2 rounded-xl border border-dashed border-n200 bg-card",
        compact ? "p-4" : "p-8 md:p-12",
        className,
      )}
    >
      <div className={cn("rounded-full bg-n100 text-n500 grid place-items-center", compact ? "h-8 w-8" : "h-12 w-12")}>
        <Icon className={cn(compact ? "h-4 w-4" : "h-6 w-6")} strokeWidth={1.75} />
      </div>
      <div className={cn("font-semibold text-n800", compact ? "text-[13px]" : "text-[15px]")}>{title}</div>
      {description && (
        <p className={cn("text-n500 max-w-sm", compact ? "text-[11.5px]" : "text-[13px]")}>{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
