import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { StatusCardsBlock } from "@/lib/copilotBlocks";

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  green:   { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  orange:  { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500" },
  red:     { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
  blue:    { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500" },
  gray:    { bg: "bg-n50",        text: "text-n700",        dot: "bg-n400" },
};

export function CopilotStatusCards({ block }: { block: StatusCardsBlock }) {
  return (
    <div>
      {block.title && <h4 className="text-[12px] font-semibold text-n500 uppercase tracking-[0.5px] mb-2">{block.title}</h4>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
        {block.cards.map((card, i) => {
          const c = STATUS_COLORS[card.color ?? "orange"] ?? STATUS_COLORS.orange;
          return (
            <motion.div key={i} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.04 }}
              className={cn("rounded-xl px-4 py-3 border border-transparent", c.bg)}
            >
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", c.dot)} />
                <span className="text-[11px] font-medium text-n500">{card.label}</span>
              </div>
              <div className={cn("text-[24px] font-bold mt-1", c.text)}>{card.value}</div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
