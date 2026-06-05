import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageHeader — canonical top-of-page header for non-Lumina (utility) pages.
 *
 * Pattern:
 *   • Optional eyebrow (uppercase, muted)
 *   • Title (26px semibold, n900)
 *   • Optional subtitle (13px, n500)
 *   • Optional right-aligned action slot
 *
 * Use this on Mentors, Alumni, Students, History, Data Sources, LMP Board,
 * Settings sub-pages — anywhere not wrapped in <LuminaShell>.
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
    <header
      className={cn(
        "flex flex-col md:flex-row md:items-end md:justify-between gap-3",
        className,
      )}
    >
      <div className="min-w-0 max-w-2xl">
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.6px] text-n500 mb-1">
            {eyebrow}
          </div>
        )}
        <h1 className="text-[26px] leading-[1.2] font-semibold tracking-[-0.01em] text-n900 truncate">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-[13px] text-n500">{subtitle}</p>
        )}
      </div>
      {right && <div className="shrink-0 flex items-center gap-2">{right}</div>}
    </header>
  );
}
