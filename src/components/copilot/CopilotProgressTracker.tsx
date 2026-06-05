import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProgressTrackerBlock } from "@/lib/copilotBlocks";

const STATUS_ICON = {
  done: CheckCircle2,
  "in-progress": Loader2,
  pending: Circle,
};

export function CopilotProgressTracker({ block }: { block: ProgressTrackerBlock }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      {block.title && <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>}
      <div className="space-y-3">
        {block.items.map((item, i) => {
          const Icon = STATUS_ICON[item.status ?? "pending"];
          const isDone = item.status === "done";
          const isActive = item.status === "in-progress";
          return (
            <div key={i} className="flex items-center gap-3">
              <Icon className={cn("h-4 w-4 shrink-0", isDone ? "text-emerald-500" : isActive ? "text-orange-500 animate-spin" : "text-n300")} />
              <div className="flex-1 min-w-0">
                <div className={cn("text-[12.5px] font-medium", isDone ? "text-n500 line-through" : "text-n800")}>{item.label}</div>
                <div className="mt-1 h-1.5 rounded-full bg-n100 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${item.value}%` }}
                    transition={{ duration: 0.6, delay: i * 0.08 }}
                    className={cn("h-full rounded-full", isDone ? "bg-emerald-500" : isActive ? "bg-orange-500" : "bg-n300")}
                  />
                </div>
              </div>
              <span className="text-[11px] font-semibold text-n500 tabular-nums">{item.value}%</span>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
