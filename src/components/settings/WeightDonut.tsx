import { Cell, Pie, PieChart, ResponsiveContainer } from "recharts";
import { motion } from "framer-motion";

export function WeightDonut({
  segments,
  size = 180,
}: {
  segments: { name: string; value: number; color: string }[];
  size?: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={segments}
            dataKey="value"
            innerRadius={size * 0.30}
            outerRadius={size * 0.46}
            paddingAngle={2}
            stroke="none"
            isAnimationActive
            animationDuration={350}
          >
            {segments.map(s => <Cell key={s.name} fill={s.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 grid place-items-center pointer-events-none">
        <motion.div
          key={total}
          initial={{ scale: 0.92 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
          className="text-center"
        >
          <div className={`text-[20px] font-bold tabular-nums ${total === 100 ? "text-n900" : "text-coral-600"}`}>
            {total}%
          </div>
          <div className="text-[10px] uppercase tracking-[0.5px] text-n500">Weighted</div>
        </motion.div>
      </div>
    </div>
  );
}
