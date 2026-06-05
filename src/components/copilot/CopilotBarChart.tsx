import { motion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { BarChartBlock } from "@/lib/copilotBlocks";

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

export function CopilotBarChart({ block }: { block: BarChartBlock }) {
  const isHorizontal = block.orientation === "horizontal";
  const grid = "hsl(var(--n100))";
  const axisStrong = "hsl(var(--n600))";
  const axisMuted = "hsl(var(--n400))";
  const tooltipBorder = "hsl(var(--n200))";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>
      <div className={isHorizontal ? "h-[280px]" : "h-[260px]"}>
        <ResponsiveContainer>
          {isHorizontal ? (
            <BarChart data={block.data} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis type="number" tick={{ fontSize: 11, fill: axisMuted }} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 11, fill: axisStrong }} width={80} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${tooltipBorder}` }} />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                {block.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          ) : (
            <BarChart data={block.data} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={grid} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisStrong }} />
              <YAxis tick={{ fontSize: 11, fill: axisMuted }} />
              <Tooltip contentStyle={{ borderRadius: 10, fontSize: 12, border: `1px solid ${tooltipBorder}` }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={32}>
                {block.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
