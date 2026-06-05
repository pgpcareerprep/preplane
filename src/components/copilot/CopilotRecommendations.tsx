import { motion } from "framer-motion";
import { Lightbulb } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecommendationsBlock } from "@/lib/copilotBlocks";

const PRIORITY_COLOR = {
  high: "border-l-orange-500 bg-orange-50/50",
  medium: "border-l-blue-400 bg-blue-50/40",
  low: "border-l-n300 bg-n50/50",
};

export function CopilotRecommendations({ block }: { block: RecommendationsBlock }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <Lightbulb className="h-4 w-4 text-amber-500" />
        <h4 className="text-[12px] font-semibold text-n500 uppercase tracking-[0.5px]">{block.title || "Recommendations"}</h4>
      </div>
      <div className="space-y-2">
        {block.items.map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className={cn("rounded-lg border border-n200 border-l-4 px-4 py-3", PRIORITY_COLOR[item.priority ?? "medium"])}
          >
            <div className="text-[13px] font-semibold text-n900">{item.action}</div>
            <div className="text-[12px] text-n600 mt-0.5">{item.reason}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
