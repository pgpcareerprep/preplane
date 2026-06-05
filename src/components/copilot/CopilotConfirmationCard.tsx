import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Check, X } from "lucide-react";
import type { ConfirmationCardBlock } from "@/lib/copilotBlocks";
import { cn } from "@/lib/utils";

export function CopilotConfirmationCard({ block, onAction }: { block: ConfirmationCardBlock; onAction: (cmd: string) => void }) {
  const [state, setState] = useState<"pending" | "confirmed" | "cancelled">("pending");

  if (state === "confirmed") {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5">
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-full bg-emerald-100 grid place-items-center">
            <Check className="h-4 w-4 text-emerald-600" />
          </span>
          <div>
            <div className="text-[13.5px] font-semibold text-emerald-800">Confirmed & Executing</div>
            <div className="text-[12px] text-emerald-600">{block.title}</div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (state === "cancelled") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        className="rounded-2xl border border-n200 bg-n50 p-4">
        <div className="flex items-center gap-2 text-[13px] text-n500">
          <X className="h-4 w-4" /> Action cancelled
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white shadow-sm overflow-hidden"
    >
      <div className="px-5 pt-4 pb-3 flex items-start gap-3">
        <span className="h-9 w-9 rounded-xl bg-amber-100 grid place-items-center shrink-0 mt-0.5">
          <AlertTriangle className="h-4.5 w-4.5 text-amber-600" />
        </span>
        <div className="flex-1 min-w-0">
          <h4 className="text-[14px] font-semibold text-n900">{block.title}</h4>
          <p className="text-[12.5px] text-n600 mt-0.5 leading-relaxed">{block.description}</p>
        </div>
      </div>

      {block.changes && block.changes.length > 0 && (
        <div className="mx-5 mb-3 rounded-xl bg-card border border-n100 overflow-hidden">
          {block.changes.map((c, i) => (
            <div key={i} className={cn("flex items-center gap-3 px-4 py-2.5 text-[12.5px]", i > 0 && "border-t border-n50")}>
              <span className="text-n500 font-medium w-28 shrink-0">{c.field}</span>
              {c.from && (
                <>
                  <span className="text-n400 line-through">{c.from}</span>
                  <ArrowRight className="h-3 w-3 text-n300 shrink-0" />
                </>
              )}
              <span className="text-n900 font-semibold">{c.to}</span>
            </div>
          ))}
        </div>
      )}

      {block.sync_impact && (
        <div className="mx-5 mb-3 flex items-start gap-2 rounded-lg bg-amber-100/60 px-3 py-2 text-[11.5px] text-amber-800">
          <span className="mt-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
          <span className="leading-relaxed">{block.sync_impact}</span>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 px-5 pb-4 pt-1">
        <button
          onClick={() => setState("cancelled")}
          className="h-9 px-4 rounded-xl text-[12.5px] font-medium text-n600 hover:bg-n100 transition-colors"
        >
          {block.cancel_label || "Cancel"}
        </button>
        <button
          onClick={() => { setState("confirmed"); onAction(block.confirm_action); }}
          className="h-9 px-5 rounded-xl bg-orange-500 text-white text-[12.5px] font-semibold hover:bg-orange-600 shadow-sm shadow-orange-200 transition-all flex items-center gap-1.5"
        >
          <Check className="h-3.5 w-3.5" /> {block.confirm_label || "Confirm"}
        </button>
      </div>
    </motion.div>
  );
}
