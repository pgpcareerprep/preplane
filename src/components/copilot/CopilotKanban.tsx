import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { KanbanBlock } from "@/lib/copilotBlocks";

const COL_COLORS = ["border-t-orange-500", "border-t-blue-500", "border-t-emerald-500", "border-t-violet-500", "border-t-amber-500", "border-t-sky-500"];

export function CopilotKanban({ block }: { block: KanbanBlock }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-n200 bg-card p-5 shadow-sm">
      {block.title && <h4 className="text-[14px] font-semibold text-n900 mb-4">{block.title}</h4>}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {block.columns.map((col, ci) => (
          <div key={ci} className={cn("min-w-[180px] flex-1 rounded-xl bg-n50 border border-n100 border-t-[3px] p-3", COL_COLORS[ci % COL_COLORS.length])}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold text-n800">{col.title}</span>
              <span className="text-[11px] font-bold text-n500 bg-card px-1.5 py-0.5 rounded-md">{col.count}</span>
            </div>
            <div className="space-y-2">
              {col.items.slice(0, 5).map((item, ii) => (
                <div key={ii} className="rounded-lg bg-card border border-n100 px-3 py-2 shadow-xs">
                  <div className="text-[12px] font-medium text-n800 leading-snug">{item.label}</div>
                  {item.sub && <div className="text-[10.5px] text-n500 mt-0.5">{item.sub}</div>}
                  {item.tag && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 text-[9.5px] font-semibold">{item.tag}</span>}
                </div>
              ))}
              {col.items.length > 5 && (
                <div className="text-[10.5px] text-n400 text-center py-1">+{col.items.length - 5} more</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
