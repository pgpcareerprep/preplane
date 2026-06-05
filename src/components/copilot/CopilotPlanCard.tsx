import { CheckCircle2, Circle, Loader2, XCircle, MinusCircle, ListChecks, PlayCircle } from "lucide-react";
import { motion } from "framer-motion";
import type { PlanCardBlock, PlanStep } from "@/lib/copilotBlocks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ICONS: Record<PlanStep["status"], { Icon: typeof Circle; cls: string; label: string }> = {
  pending:     { Icon: Circle,        cls: "text-n400",       label: "Pending" },
  in_progress: { Icon: Loader2,       cls: "text-orange-500 animate-spin", label: "Running" },
  done:        { Icon: CheckCircle2,  cls: "text-emerald-500", label: "Done" },
  failed:      { Icon: XCircle,       cls: "text-red-500",     label: "Failed" },
  skipped:     { Icon: MinusCircle,   cls: "text-n400",       label: "Skipped" },
};

export function CopilotPlanCard({
  block,
  onAction,
}: {
  block: PlanCardBlock;
  onAction?: (cmd: string) => void;
}) {
  const total = block.steps.length;
  const doneCount = block.steps.filter((s) => s.status === "done" || s.status === "skipped").length;
  const pct = total === 0 ? 0 : Math.round((doneCount / total) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-n200 bg-card shadow-sm overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-n200 bg-gradient-to-r from-orange-50/60 to-transparent">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <ListChecks className="h-4 w-4 text-orange-500 shrink-0" />
            <h4 className="text-[13px] font-semibold text-n900 truncate">Agent plan</h4>
            {block.banner && (
              <span className="text-[10px] uppercase tracking-wider text-orange-600 bg-orange-100 border border-orange-200 rounded-full px-2 py-0.5 ml-1">
                {block.banner}
              </span>
            )}
          </div>
          <span className="text-[11px] text-n500 tabular-nums shrink-0">
            {doneCount}/{total} · {pct}%
          </span>
        </div>
        <p className="mt-1 text-[12.5px] text-n700 leading-snug">{block.goal}</p>

        {/* Progress bar */}
        <div className="mt-2 h-1 w-full rounded-full bg-n100 overflow-hidden">
          <div
            className={cn(
              "h-full transition-all duration-500",
              block.done ? "bg-emerald-500" : "bg-orange-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <ol className="px-2 py-2 space-y-0.5">
        {block.steps.map((step, idx) => {
          const meta = ICONS[step.status] ?? ICONS.pending;
          const { Icon } = meta;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-start gap-3 px-2 py-2 rounded-md",
                step.status === "in_progress" && "bg-orange-50/50",
              )}
            >
              <div className="mt-0.5 shrink-0">
                <Icon className={cn("h-4 w-4", meta.cls)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[11px] font-mono text-n400 tabular-nums">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] font-medium",
                      step.status === "done" && "text-n700",
                      step.status === "skipped" && "text-n500 line-through",
                      step.status === "failed" && "text-red-700",
                      (step.status === "pending" || step.status === "in_progress") && "text-n900",
                    )}
                  >
                    {step.title}
                  </span>
                  {step.tool && (
                    <code className="text-[10.5px] font-mono text-n500 bg-n100 rounded px-1.5 py-0.5">
                      {step.tool}
                    </code>
                  )}
                </div>
                {step.detail && <p className="text-[12px] text-n600 mt-0.5">{step.detail}</p>}
                {step.result_summary && (
                  <p
                    className={cn(
                      "text-[11.5px] mt-1 leading-snug",
                      step.status === "failed" ? "text-red-600" : "text-n500",
                    )}
                  >
                    {step.result_summary}
                  </p>
                )}
              </div>
              <span className="text-[10px] uppercase tracking-wider text-n400 shrink-0 mt-1">
                {meta.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Footer */}
      {block.resume_action && !block.done && (
        <div className="px-3 py-2 border-t border-n200 flex items-center justify-end">
          <Button size="sm" variant="outline" onClick={() => onAction?.(block.resume_action!)}>
            <PlayCircle className="h-3.5 w-3.5 mr-1.5" />
            Resume
          </Button>
        </div>
      )}
    </motion.div>
  );
}
