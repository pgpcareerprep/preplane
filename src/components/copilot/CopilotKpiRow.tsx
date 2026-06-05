import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiRowBlock } from "@/lib/copilotBlocks";

const COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  orange:  { bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-200" },
  emerald: { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  red:     { bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200" },
  blue:    { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200" },
  violet:  { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200" },
  amber:   { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200" },
  sky:     { bg: "bg-sky-50",     text: "text-sky-600",     border: "border-sky-200" },
};

const TrendIcon = { up: TrendingUp, down: TrendingDown, flat: Minus };

export function CopilotKpiRow({ block }: { block: KpiRowBlock }) {
  return (
    <div>
      {block.title && <h4 className="text-[12px] font-semibold text-n500 uppercase tracking-[0.5px] mb-2">{block.title}</h4>}
      <div className={cn("grid gap-3", block.items.length <= 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4")}>
        {block.items.map((item, i) => {
          const c = COLOR_MAP[item.color ?? "orange"] ?? COLOR_MAP.orange;
          const Icon = TrendIcon[item.trend ?? "flat"];
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={cn("rounded-xl border p-4 shadow-sm", c.border, c.bg)}
            >
              <div className="text-[11px] font-medium text-n500 uppercase tracking-[0.3px]">{item.label}</div>
              <div className={cn("text-[28px] font-bold mt-1 leading-none", c.text)}>{item.value}</div>
              {item.delta && (
                <div className="flex items-center gap-1 mt-2">
                  <Icon className={cn("h-3 w-3", item.trend === "up" ? "text-emerald-500" : item.trend === "down" ? "text-red-500" : "text-n400")} />
                  <span className={cn("text-[11px] font-medium", item.trend === "up" ? "text-emerald-600" : item.trend === "down" ? "text-red-600" : "text-n500")}>
                    {item.delta}
                  </span>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
