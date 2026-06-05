import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { AreaChartBlock } from "@/lib/copilotBlocks";

export function CopilotAreaChart({ block }: { block: AreaChartBlock }) {
  const accent = "hsl(var(--orange-500))";
  const grid = "hsl(var(--n100))";
  const axisStrong = "hsl(var(--n600))";
  const axisMuted = "hsl(var(--n400))";
  const tooltipBorder = "hsl(var(--n200))";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>
      <div className="h-[220px]">
        <ResponsiveContainer>
          <AreaChart data={block.data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
            <defs>
              <linearGradient id="copilotAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={accent} stopOpacity={0.3} />
                <stop offset="100%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisStrong }} />
            <YAxis tick={{ fontSize: 11, fill: axisMuted }} />
            <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${tooltipBorder}` }} />
            <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={2} fill="url(#copilotAreaFill)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
