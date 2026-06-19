import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-150 ease-smooth focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        /* Lumina Accent/CTA — orange, primary actions (default for backward compat) */
        default: "bg-orange-500 text-white hover:bg-orange-600 shadow-sm",
        /* Lumina Primary — #1A1916, high-emphasis (max 1 per view) */
        primary: "bg-n900 text-white hover:bg-n800 shadow-sm dark:bg-[var(--lx-soft)] dark:text-[var(--lx-text)] dark:hover:bg-[var(--lx-border)] dark:border dark:border-[var(--lx-border)]",
        accent: "bg-orange-500 text-white hover:bg-orange-600 shadow-sm",
        destructive: "bg-coral-50 text-coral-600 border border-coral-200 hover:bg-coral-50/80 dark:bg-coral-400/15 dark:text-coral-400 dark:border-coral-400/30",
        outline: "border border-border bg-card hover:bg-muted text-foreground",
        secondary: "bg-card text-foreground hover:bg-muted border border-border",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        link: "text-orange-500 underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-sm",
        sm: "h-8 px-3.5 text-[13px] rounded-md",
        default: "h-9 px-[18px] py-2 text-sm rounded-md",
        lg: "h-11 px-6 text-base rounded-md",
        xl: "h-12 px-7 text-[17px] rounded-lg",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
