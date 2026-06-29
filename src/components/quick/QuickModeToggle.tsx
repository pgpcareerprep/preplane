import type { QuickMode } from "@/pages/QuickActionsPage";

interface Props {
  mode: QuickMode;
  setMode: (m: QuickMode) => void;
  isAllocator?: boolean;
}

export function QuickModeToggle({ mode, setMode, isAllocator }: Props) {
  const opts: { value: QuickMode; label: string }[] = [
    { value: "admin-summary", label: isAllocator ? "Allocator View" : "Admin Summary" },
    { value: "my-poc-actions", label: "My POC Actions" },
  ];

  return (
    <div
      className="flex rounded-xl border border-border bg-muted/40 p-1 gap-1"
      role="tablist"
      aria-label="View mode"
    >
      {opts.map(({ value, label }) => (
        <button
          key={value}
          role="tab"
          aria-selected={mode === value}
          onClick={() => setMode(value)}
          className={[
            "flex-1 rounded-lg px-3 py-2 text-xs font-semibold transition-all",
            mode === value
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
          style={{ minHeight: "36px" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
