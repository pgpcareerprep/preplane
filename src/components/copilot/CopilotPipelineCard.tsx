import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { PipelineCardBlock } from "@/lib/copilotBlocks";
import { cn } from "@/lib/utils";

const STAGE_COLORS = [
  "from-blue-500 to-blue-400",
  "from-violet-500 to-violet-400",
  "from-orange-500 to-orange-400",
  "from-emerald-500 to-emerald-400",
  "from-amber-500 to-amber-400",
  "from-rose-500 to-rose-400",
];

export function CopilotPipelineCard({ block, onAction }: { block: PipelineCardBlock; onAction: (cmd: string) => void }) {
  const handleStageClick = (stageName: string) => {
    if (block.move_action) {
      onAction(block.move_action.replace("{{stage}}", stageName));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-n200 bg-gradient-to-br from-white to-n50/30 shadow-sm overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3">
        <h4 className="text-[14.5px] font-semibold text-n900">{block.title}</h4>
        {block.entity && <p className="text-[12px] text-n500 mt-0.5">{block.entity}</p>}
      </div>
      <div className="px-5 pb-5">
        <div className="flex items-center gap-1">
          {block.stages.map((stage, i) => {
            const isCurrent = stage.name === block.current_stage || stage.active;
            const colorIdx = i % STAGE_COLORS.length;
            return (
              <div key={i} className="flex items-center gap-1 flex-1 min-w-0">
                <button
                  onClick={() => handleStageClick(stage.name)}
                  className={cn(
                    "flex-1 rounded-xl px-3 py-2.5 text-center transition-all min-w-0",
                    isCurrent
                      ? `bg-gradient-to-r ${STAGE_COLORS[colorIdx]} text-white shadow-sm`
                      : "bg-n50 text-n600 hover:bg-n100 border border-n100"
                  )}
                >
                  <div className={cn("text-[12px] font-semibold truncate", isCurrent ? "text-white" : "text-n800")}>{stage.name}</div>
                  <div className={cn("text-[10px] mt-0.5", isCurrent ? "text-white/80" : "text-n400")}>{stage.count} candidates</div>
                </button>
                {i < block.stages.length - 1 && (
                  <ChevronRight className="h-3.5 w-3.5 text-n300 shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
