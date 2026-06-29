import { type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickMobileShellProps {
  title: string;
  back?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export function QuickMobileShell({ title, back, children, footer }: QuickMobileShellProps) {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col bg-background text-foreground"
      style={{ minHeight: "100dvh" }}
    >
      {/* Header */}
      <header
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        {back && (
          <button
            onClick={() => navigate(-1)}
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted active:bg-muted/70"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <h1 className="text-base font-semibold leading-tight">{title}</h1>
      </header>

      {/* Scrollable body */}
      <main className="flex-1 overflow-y-auto px-4 py-4">{children}</main>

      {/* Optional sticky footer */}
      {footer && (
        <div
          className="sticky bottom-0 border-t border-border bg-background/95 backdrop-blur px-4 pt-3"
          style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
        >
          {footer}
        </div>
      )}
    </div>
  );
}
