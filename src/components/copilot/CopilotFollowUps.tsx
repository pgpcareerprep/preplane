import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { FollowUpsBlock } from "@/lib/copilotBlocks";

export function CopilotFollowUps({ block, onSelect }: { block: FollowUpsBlock; onSelect: (prompt: string) => void }) {
  return (
    <div className="pt-1">
      <div className="text-[10.5px] font-medium text-n400 uppercase tracking-[0.5px] mb-2">Suggested follow-ups</div>
      <div className="flex flex-wrap gap-2">
        {block.suggestions.map((s, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            onClick={() => onSelect(s)}
            className="group inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-n200 bg-card text-[12px] text-n700 font-medium hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 transition-all shadow-xs"
          >
            {s}
            <ArrowRight className="h-3 w-3 text-n400 group-hover:text-orange-500 transition-colors" />
          </motion.button>
        ))}
      </div>
    </div>
  );
}
