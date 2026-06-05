import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { HeatmapBlock } from "@/lib/copilotBlocks";

function getHeatColor(value: number, max: number): string {
  if (max === 0) return "bg-n50";
  const ratio = value / max;
  if (ratio > 0.8) return "bg-orange-500 text-white";
  if (ratio > 0.6) return "bg-orange-400 text-white";
  if (ratio > 0.4) return "bg-orange-300 text-orange-900";
  if (ratio > 0.2) return "bg-orange-200 text-orange-800";
  if (ratio > 0) return "bg-orange-100 text-orange-700";
  return "bg-n50 text-n400";
}

export function CopilotHeatmap({ block }: { block: HeatmapBlock }) {
  const max = Math.max(...block.cells.map(c => c.value), 1);
  const cellMap = new Map(block.cells.map(c => [`${c.row}|${c.col}`, c.value]));

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>
      <div className="overflow-x-auto">
        <table className="text-[11px]">
          <thead>
            <tr>
              <th className="px-2 py-1.5" />
              {block.cols.map((col, i) => (
                <th key={i} className="px-2 py-1.5 text-center font-medium text-n500 text-[10px]">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, ri) => (
              <tr key={ri}>
                <td className="px-2 py-1.5 font-medium text-n700 text-right whitespace-nowrap">{row}</td>
                {block.cols.map((col, ci) => {
                  const val = cellMap.get(`${row}|${col}`) ?? 0;
                  return (
                    <td key={ci} className="px-1 py-1">
                      <div className={cn("h-8 w-12 rounded-md grid place-items-center text-[10.5px] font-semibold", getHeatColor(val, max))}>
                        {val}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
