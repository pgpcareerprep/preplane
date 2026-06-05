import { cn } from "@/lib/utils";

/**
 * Shimmer skeleton — sweeps a lighter highlight across an n200 base.
 * Use exact heights/widths matching the loaded element. Multiple lines:
 * <Skeleton className="h-3 w-32" />
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton", className)} {...props} />;
}

export { Skeleton };
