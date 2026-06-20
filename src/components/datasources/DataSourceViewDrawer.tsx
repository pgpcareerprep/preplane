import type { ReactNode } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
};

/** Half-screen right drawer for Data Sources "View all" database browsers. */
export function DataSourceViewDrawer({
  open,
  onOpenChange,
  title,
  subtitle,
  headerExtra,
  children,
  footer,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-none flex-col gap-0 overflow-hidden p-0 sm:w-[50vw] sm:max-w-[50vw]"
      >
        <SheetHeader className="shrink-0 space-y-0 border-b border-border px-6 pb-3 pt-5 text-left">
          <div className="flex items-start justify-between gap-3 pr-8">
            <div className="min-w-0">
              <SheetTitle className="text-[16px] font-semibold text-foreground">{title}</SheetTitle>
              {subtitle ? (
                <p className="mt-0.5 text-[12px] text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {headerExtra}
          </div>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-border">{footer}</div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
