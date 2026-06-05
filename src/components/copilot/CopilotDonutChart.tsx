import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { DonutChartBlock } from "@/lib/copilotBlocks";

const COLORS = [
  "hsl(var(--orange-500))",
  "hsl(var(--sky-400))",
  "hsl(var(--sage-400))",
  "hsl(var(--plum-400))",
  "hsl(var(--coral-400))",
  "hsl(var(--yellow-500))",
  "hsl(var(--teal-400))",
  "hsl(var(--coral-600))",
];

export function CopilotDonutChart({ block }: { block: DonutChartBlock }) {
  const total = block.data.reduce((s, d) => s + d.value, 0);
  const tooltipBorder = "hsl(var(--n200))";
  const sliceStroke = "hsl(var(--card))";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      <h4 className="text-[14px] font-semibold text-n900 mb-3">{block.title}</h4>
      <div className="flex items-center gap-6">
        <div className="h-[180px] w-[180px] shrink-0 relative">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={block.data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={50} outerRadius={80} strokeWidth={2} stroke={sliceStroke}>
                {block.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${tooltipBorder}` }} />
            </PieChart>
          </ResponsiveContainer>
          {block.centerLabel && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[13px] font-bold text-n700">{block.centerLabel}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 min-w-0">
          {block.data.map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
              <span className="text-n700 truncate">{d.label}</span>
              <span className="text-n500 ml-auto tabular-nums font-medium">{d.value} ({total > 0 ? Math.round(d.value / total * 100) : 0}%)</span>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
