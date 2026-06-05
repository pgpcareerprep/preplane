import { Area, AreaChart, ResponsiveContainer } from "recharts";

export function Sparkline({ data, color = "hsl(var(--orange-500))" }: { data: number[]; color?: string }) {
  const series = data.map((v, i) => ({ i, v }));
  return (
    <div className="h-10 -mx-1">
      <ResponsiveContainer>
        <AreaChart data={series} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill="url(#sparkFill)" isAnimationActive />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
