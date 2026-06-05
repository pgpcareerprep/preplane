import { motion } from "framer-motion";
import { User2, Users2, Globe2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkspaceView, VIEW_HINT, type WorkspaceView } from "@/lib/workspaceViewContext";

const ITEMS: { value: WorkspaceView; label: string; Icon: typeof User2 }[] = [
  { value: "mine", label: "My Processes", Icon: User2 },
  { value: "assigned", label: "Assigned to POCs", Icon: Users2 },
  { value: "all", label: "All Processes", Icon: Globe2 },
];

export function ViewSwitcher({ className, showHint = true }: { className?: string; showHint?: boolean }) {
  const { view, setView, allowed } = useWorkspaceView();

  return (
    <div className={cn("inline-flex flex-col gap-1.5", className)}>
      <div
        role="tablist"
        aria-label="Workspace view"
        className="relative inline-flex items-center rounded-full bg-n100 border border-n200 p-1"
      >
        {ITEMS.map(({ value, label, Icon }) => {
          const active = view === value;
          const disabled = !allowed.includes(value);
          return (
            <button
              key={value}
              role="tab"
              aria-selected={active}
              disabled={disabled}
              onClick={() => setView(value)}
              className={cn(
                "relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-full transition-colors",
                active ? "text-n900" : "text-n500 hover:text-n800",
                disabled && "opacity-40 cursor-not-allowed hover:text-n500",
              )}
              title={disabled ? "Not available for your role" : label}
            >
              {active && (
                <motion.span
                  layoutId="view-switcher-pill"
                  className="absolute inset-0 rounded-full bg-card shadow-sm border border-n200"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon className="relative h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="relative">{label}</span>
            </button>
          );
        })}
      </div>
      {showHint && (
        <span className="text-[11px] text-n500 px-1">{VIEW_HINT[view]}</span>
      )}
    </div>
  );
}