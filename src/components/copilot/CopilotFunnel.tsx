import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { FunnelBlock } from "@/lib/copilotBlocks";

const FUNNEL_COLORS = [
  "hsl(var(--orange-500))",
  "hsl(var(--orange-400))",
  "hsl(var(--orange-200))",
  "hsl(var(--orange-100))",
  "hsl(var(--orange-50))",
];

export function CopilotFunnel({ block }: { block: FunnelBlock }) {
  const max = Math.max(...block.steps.map(s => s.value), 1);
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>
      <div className="space-y-2">
        {block.steps.map((step, i) => {
          const pct = Math.max((step.value / max) * 100, 8);
          const convRate = i > 0 ? Math.round((step.value / block.steps[i - 1].value) * 100) : 100;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.08 }}>
              {i > 0 && (
                <div className="flex items-center gap-2 py-1 pl-4">
                  <div className="h-4 w-px bg-n200" />
                  <span className="text-[10px] text-n400 font-medium">{convRate}% conversion</span>
                </div>
              )}
              <div className="relative rounded-xl overflow-hidden h-11" style={{ width: `${pct}%` }}>
                <div className="absolute inset-0 rounded-xl" style={{ backgroundColor: FUNNEL_COLORS[i % FUNNEL_COLORS.length] }} />
                <div className="relative flex items-center justify-between px-3 h-full">
                  <span className="text-[12px] font-semibold text-white truncate">{step.label}</span>
                  <span className="text-[13px] font-bold text-white">{step.value}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
