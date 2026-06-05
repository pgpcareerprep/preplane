import { motion } from "framer-motion";
import { Plus, Check, Edit, Trash2, ArrowRight, Zap, Send, Users, FileText, BarChart3, RefreshCw, type LucideIcon } from "lucide-react";
import type { ActionButtonsBlock, ActionButton } from "@/lib/copilotBlocks";
import { cn } from "@/lib/utils";
import { useState } from "react";

const ICON_MAP: Record<string, LucideIcon> = {
  plus: Plus, check: Check, edit: Edit, trash: Trash2, arrow: ArrowRight,
  zap: Zap, send: Send, users: Users, file: FileText, chart: BarChart3, refresh: RefreshCw,
};

const VARIANT_STYLES: Record<string, string> = {
  primary: "bg-orange-500 text-white hover:bg-orange-600 shadow-sm shadow-orange-200",
  secondary: "bg-card text-n800 border border-n200 hover:border-orange-300 hover:bg-orange-50",
  danger: "bg-card text-red-600 border border-red-200 hover:bg-red-50",
  ghost: "text-n600 hover:text-n900 hover:bg-n100",
};

export function CopilotActionButtons({ block, onAction }: { block: ActionButtonsBlock; onAction: (cmd: string) => void }) {
  const [confirming, setConfirming] = useState<string | null>(null);

  const handleClick = (btn: ActionButton) => {
    if (btn.confirm && confirming !== btn.action) {
      setConfirming(btn.action);
      return;
    }
    setConfirming(null);
    onAction(btn.action);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      {block.title && <h4 className="text-[13px] font-semibold text-n700 mb-2.5">{block.title}</h4>}
      <div className={cn(
        "flex flex-wrap gap-2",
        block.layout === "grid" && "grid grid-cols-2 sm:grid-cols-3"
      )}>
        {block.buttons.map((btn, i) => {
          const Icon = btn.icon ? ICON_MAP[btn.icon] : null;
          const variant = btn.variant || "secondary";
          const isConfirming = confirming === btn.action;

          return (
            <motion.button
              key={i}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleClick(btn)}
              className={cn(
                "h-9 px-4 rounded-xl text-[12.5px] font-medium transition-all flex items-center gap-1.5",
                isConfirming ? "bg-amber-500 text-white animate-pulse" : VARIANT_STYLES[variant]
              )}
            >
              {Icon && <Icon className="h-3.5 w-3.5" />}
              {isConfirming ? `Confirm: ${btn.label}?` : btn.label}
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
