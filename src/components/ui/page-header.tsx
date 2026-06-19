import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — canonical top-of-page header (Lumina-aligned).
 * Gradient accent bar, eyebrow label, H2-scale title, optional actions.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-2", className)}>
      <div className="h-[3px] w-full rounded-full bg-grad-mu opacity-90" aria-hidden />
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mt-2">
        <div className="min-w-0 max-w-2xl">
          {eyebrow && (
            <div className="label-eyebrow mb-1">{eyebrow}</div>
          )}
          <h1 className="text-[28px] leading-[1.2] font-semibold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 text-[13px] text-muted-foreground">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
      </div>
    </header>
  );
}
