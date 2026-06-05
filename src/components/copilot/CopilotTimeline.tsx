import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { TimelineBlock } from "@/lib/copilotBlocks";

const DOT_COLOR = {
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-red-500",
  info: "bg-blue-500",
  neutral: "bg-n400",
};

export function CopilotTimeline({ block }: { block: TimelineBlock }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      {block.title && <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>}
      <div className="relative pl-6">
        <div className="absolute left-2 top-1 bottom-1 w-px bg-n200" />
        <div className="space-y-4">
          {block.events.map((ev, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className="relative">
              <span className={cn("absolute -left-[18px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-white", DOT_COLOR[ev.status ?? "neutral"])} />
              <div className="text-[10.5px] text-n400 tabular-nums font-medium">{ev.date}</div>
              <div className="text-[13px] text-n800 leading-snug mt-0.5">{ev.text}</div>
              {ev.author && <div className="text-[11px] text-n500 italic mt-0.5">— {ev.author}</div>}
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
