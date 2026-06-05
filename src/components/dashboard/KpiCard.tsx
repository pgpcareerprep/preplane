import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function KpiCard({
  index = 0,
  span = 1,
  children,
  className,
}: {
  index?: number;
  span?: 1 | 2;
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: [0, 0, 0.2, 1] }}
      className={cn(
        "rounded-2xl bg-card border border-n200 p-5 shadow-sm transition-all duration-220 ease-smooth hover:shadow-md hover:border-n300",
        span === 2 && "md:col-span-2",
        className,
      )}
    >
      {children}
    </motion.div>
  );
}
