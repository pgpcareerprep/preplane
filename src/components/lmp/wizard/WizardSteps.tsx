import { Check } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: 1, label: "Basic Info" },
  { id: 2, label: "POC Allocation" },
];

export function WizardSteps({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-8">
      {STEPS.map((s, i) => {
        const completed = current > s.id;
        const active = current === s.id;
        return (
          <div key={s.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-3">
              <motion.div
                initial={false}
                animate={{ scale: active ? 1.05 : 1 }}
                transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center text-[13px] font-semibold border transition-colors",
                  completed && "bg-sage-400 border-sage-400 text-white",
                  active && "bg-orange-500 border-orange-500 text-white shadow-sm",
                  !completed && !active && "bg-card border-n300 text-n400",
                )}
              >
                {completed ? <Check className="h-4 w-4" strokeWidth={2.5} /> : s.id}
              </motion.div>
              <span
                className={cn(
                  "text-[13px] font-medium",
                  active ? "text-n900" : completed ? "text-sage-600" : "text-n500",
                )}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="flex-1 h-[2px] bg-n200 mx-3 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: completed ? "100%" : "0%" }}
                  transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
                  className="h-full bg-orange-500"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
