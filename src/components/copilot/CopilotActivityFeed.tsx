import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, Clock, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ActivityFeedBlock } from "@/lib/copilotBlocks";

const STATUS_ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  pending: Clock,
  info: Zap,
};

const STATUS_COLORS = {
  success: "text-emerald-500 bg-emerald-50",
  error: "text-red-500 bg-red-50",
  pending: "text-amber-500 bg-amber-50",
  info: "text-blue-500 bg-blue-50",
};

export function CopilotActivityFeed({ block, onAction }: { block: ActivityFeedBlock; onAction?: (cmd: string) => void }) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (idx: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-n200 bg-card shadow-sm overflow-hidden"
    >
      {block.title && (
        <div className="px-5 pt-4 pb-2">
          <h4 className="text-[14px] font-semibold text-n900">{block.title}</h4>
        </div>
      )}

      <div className="px-5 pb-4 space-y-2">
        {block.entries.map((entry, idx) => {
          const Icon = STATUS_ICONS[entry.status] || Zap;
          const colors = STATUS_COLORS[entry.status] || STATUS_COLORS.info;
          const isOpen = expanded.has(idx);

          return (
            <motion.div key={idx} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="rounded-lg border border-n100 bg-n50/50"
            >
              <button onClick={() => entry.details && toggle(idx)}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
              >
                <span className={cn("h-6 w-6 rounded-md grid place-items-center shrink-0", colors)}>
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium text-n900">{entry.action}</div>
                  {entry.timestamp && (
                    <div className="text-[10.5px] text-n400 mt-0.5">{entry.timestamp}</div>
                  )}
                </div>
                {entry.details && (
                  isOpen ? <ChevronDown className="h-3.5 w-3.5 text-n400 shrink-0" />
                         : <ChevronRight className="h-3.5 w-3.5 text-n400 shrink-0" />
                )}
              </button>

              <AnimatePresence>
                {isOpen && entry.details && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 text-[12px] text-n600 border-t border-n100 pt-2 ml-9">
                      {entry.details}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {entry.follow_ups && entry.follow_ups.length > 0 && (
                <div className="px-3 pb-2.5 flex flex-wrap gap-1.5 ml-9">
                  {entry.follow_ups.map((fu, fi) => (
                    <button key={fi} onClick={() => onAction?.(fu)}
                      className="h-6 px-2.5 rounded-md bg-orange-50 text-orange-600 text-[10.5px] font-medium hover:bg-orange-100 transition-colors"
                    >
                      {fu}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
