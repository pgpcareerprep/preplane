import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * DataTableShell — consistent card wrapper for data tables.
 * Use as the outer container around bespoke <table> markup so every
 * table page shares the same border, radius, shadow, and footer style.
 */
export function DataTableShell({
  children,
  footer,
  className,
}: {
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-card border border-n200 bg-card shadow-sm overflow-hidden",
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
      {footer && (
        <div className="px-4 py-2.5 border-t border-n100 text-[12px] text-n500">
          {footer}
        </div>
      )}
    </div>
  );
}

/** Consistent table header cell. */
export function Th({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <th
      className={cn(
        "px-4 py-3 font-medium",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** Consistent table body cell. */
export function Td({
  children,
  align = "left",
  className,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "px-4 py-3 align-middle",
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Consistent thead styling — pair with <Th>. */
export const TABLE_THEAD_CLASS =
  "bg-n50 text-n500 uppercase tracking-[0.5px] text-[11px]";

/** Consistent zebra-less row hover. */
export const TABLE_ROW_HOVER =
  "border-t border-n100 hover:bg-orange-50/40 transition-colors";
