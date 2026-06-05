import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ExecutiveSummaryBlock } from "@/lib/copilotBlocks";

export function CopilotSummary({ block }: { block: ExecutiveSummaryBlock }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50/80 via-white to-amber-50/40 p-5 shadow-sm"
    >
      <div className="flex items-center gap-2 mb-3">
        <div className="h-7 w-7 rounded-lg bg-orange-500 grid place-items-center">
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-[13px] font-bold text-n900 uppercase tracking-[0.5px]">Executive Summary</span>
      </div>
      <div className="prose prose-sm max-w-none text-[13.5px] text-n800 leading-[1.7] prose-strong:text-n900 prose-a:text-orange-600">
        <ReactMarkdown>{block.content}</ReactMarkdown>
      </div>
      {block.highlights && block.highlights.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {block.highlights.map((h, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-100/80 text-orange-700 text-[11.5px] font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
              {h}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
