import { motion } from "framer-motion";
import { ShieldAlert, Lightbulb, ArrowRight } from "lucide-react";
import type { PermissionDeniedCardBlock } from "@/lib/copilotBlocks";

export function CopilotPermissionDeniedCard({
  block, onAction,
}: {
  block: PermissionDeniedCardBlock;
  onAction: (cmd: string) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-rose-200 bg-rose-50/60 overflow-hidden"
    >
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="h-8 w-8 rounded-lg bg-rose-100 grid place-items-center shrink-0">
          <ShieldAlert className="h-4 w-4 text-rose-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[12.5px] font-semibold text-rose-900">
            You can't {block.human_action || block.action}
          </div>
          <div className="text-[11.5px] text-rose-800/90 mt-0.5 leading-snug">{block.reason}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[9.5px] uppercase tracking-wide text-rose-500 font-semibold bg-rose-100 px-1.5 py-0.5 rounded">
              role: {block.role}
            </span>
            <span className="text-[9.5px] uppercase tracking-wide text-rose-500 font-semibold bg-rose-100 px-1.5 py-0.5 rounded">
              action: {block.action}
            </span>
          </div>
        </div>
      </div>

      {block.safe_alternative && (
        <div className="px-4 py-2.5 border-t border-rose-200/70 bg-card/60 flex items-start gap-2.5">
          <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] uppercase tracking-[0.5px] text-n500 font-semibold mb-0.5">
              What you can do
            </div>
            <div className="text-[12px] text-n800 leading-snug">{block.safe_alternative}</div>
            {block.alternative_action && (
              <button
                onClick={() => onAction(block.alternative_action!)}
                className="mt-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-[11.5px] font-medium text-orange-700 bg-orange-50 hover:bg-orange-100"
              >
                {block.alternative_action} <ArrowRight className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
