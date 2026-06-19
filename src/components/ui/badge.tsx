import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-n900 text-white dark:bg-[var(--lx-soft)] dark:text-[var(--lx-text)]",
        secondary: "border-border bg-muted text-muted-foreground",
        destructive: "border-coral-200 bg-coral-50 text-coral-600 dark:bg-coral-400/15 dark:text-coral-400 dark:border-coral-400/30",
        outline: "border-border text-foreground bg-card",
        success: "border-sage-200 bg-sage-50 text-sage-600 dark:bg-sage-400/15 dark:text-sage-400 dark:border-sage-400/30",
        warning: "border-orange-200 bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30",
        info: "border-sky-200 bg-sky-50 text-sky-600 dark:bg-sky-400/15 dark:text-sky-400 dark:border-sky-400/30",
        ai: "border-plum-200 bg-plum-100 text-plum-400 dark:bg-plum-400/15 dark:text-plum-400 dark:border-plum-400/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
