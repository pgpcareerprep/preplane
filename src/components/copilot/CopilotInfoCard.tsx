import { motion } from "framer-motion";
import type { InfoCardBlock } from "@/lib/copilotBlocks";
import { CopilotActionButtons } from "./CopilotActionButtons";
import { cn } from "@/lib/utils";

const COLOR_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  green:  { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  orange: { bg: "bg-orange-50",  text: "text-orange-700",  dot: "bg-orange-500" },
  red:    { bg: "bg-red-50",     text: "text-red-700",     dot: "bg-red-500" },
  blue:   { bg: "bg-blue-50",    text: "text-blue-700",    dot: "bg-blue-500" },
  amber:  { bg: "bg-amber-50",   text: "text-amber-700",   dot: "bg-amber-500" },
  violet: { bg: "bg-violet-50",  text: "text-violet-700",  dot: "bg-violet-500" },
  gray:   { bg: "bg-n100",       text: "text-n600",        dot: "bg-n500" },
};

export function CopilotInfoCard({ block, onAction }: { block: InfoCardBlock; onAction: (cmd: string) => void }) {
  const statusColor = block.status ? (COLOR_MAP[block.status.color] || COLOR_MAP.gray) : null;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-n200 bg-gradient-to-br from-white to-n50/30 shadow-sm overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3 flex items-start justify-between">
        <h4 className="text-[14.5px] font-semibold text-n900">{block.title}</h4>
        {statusColor && (
          <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold", statusColor.bg, statusColor.text)}>
            <span className={cn("h-1.5 w-1.5 rounded-full", statusColor.dot)} />
            {block.status!.label}
          </span>
        )}
      </div>
      <div className="px-5 pb-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
          {block.fields.map((f, i) => (
            <div key={i}>
              <span className="text-[10.5px] uppercase tracking-[0.5px] text-n400 font-medium">{f.label}</span>
              <div className="text-[13px] text-n900 font-medium mt-0.5 truncate">{f.value}</div>
            </div>
          ))}
        </div>
      </div>
      {block.actions && block.actions.length > 0 && (
        <div className="px-5 pb-4 pt-2 border-t border-n100">
          <CopilotActionButtons
            block={{ type: "action-buttons", buttons: block.actions }}
            onAction={onAction}
          />
        </div>
      )}
    </motion.div>
  );
}
