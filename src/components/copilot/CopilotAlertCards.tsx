import { motion } from "framer-motion";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AlertCardsBlock } from "@/lib/copilotBlocks";

const SEV = {
  critical: { icon: AlertCircle, bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-500" },
  warning:  { icon: AlertTriangle, bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-500" },
  info:     { icon: Info, bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", badge: "bg-blue-500" },
};

export function CopilotAlertCards({ block }: { block: AlertCardsBlock }) {
  return (
    <div>
      {block.title && <h4 className="text-[12px] font-semibold text-n500 uppercase tracking-[0.5px] mb-2">{block.title}</h4>}
      <div className="space-y-2.5">
        {block.alerts.map((alert, i) => {
          const s = SEV[alert.severity];
          const Icon = s.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
              className={cn("rounded-xl border px-4 py-3", s.bg, s.border)}
            >
              <div className="flex items-start gap-2.5">
                <div className={cn("h-5 w-5 rounded-md grid place-items-center shrink-0 mt-0.5", s.badge)}>
                  <Icon className="h-3 w-3 text-white" />
                </div>
                <div className="min-w-0">
                  <div className={cn("text-[13px] font-semibold leading-snug", s.text)}>{alert.title}</div>
                  <div className="text-[12px] text-n600 mt-0.5 leading-relaxed">{alert.body}</div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
