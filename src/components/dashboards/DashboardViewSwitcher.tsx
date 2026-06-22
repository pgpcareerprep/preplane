import { cn } from "@/lib/utils";
import {
  dashboardSwitcherOptions,
  type DashboardView,
} from "@/lib/dashboardViewRouting";

export type { DashboardView };

export function DashboardViewSwitcher({
  value,
  onChange,
  options,
}: {
  value: DashboardView;
  onChange: (view: DashboardView) => void;
  options?: Array<{ id: DashboardView; label: string }>;
}) {
  const opts = options ?? dashboardSwitcherOptions("admin");

  return (
    <div
      className="inline-flex rounded-md p-0.5 shrink-0"
      style={{ background: "var(--lx-soft)", border: "1px solid var(--lx-border)" }}
      role="tablist"
      aria-label="Dashboard view"
    >
      {opts.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={cn(
            "px-2.5 h-7 text-[11.5px] font-medium rounded-[5px] transition-colors whitespace-nowrap",
            value === opt.id ? "shadow-sm" : "hover:opacity-80",
          )}
          style={{
            background: value === opt.id ? "var(--lx-surface)" : "transparent",
            color: value === opt.id ? "var(--lx-text)" : "var(--lx-text-3)",
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
