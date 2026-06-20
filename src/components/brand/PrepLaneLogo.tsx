import { cn } from "@/lib/utils";
import { PrepLaneMark } from "./PrepLaneMark";

type PrepLaneLogoProps = {
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
};

const TEXT_SIZE = {
  sm: "text-[15px]",
  md: "text-[19px]",
  lg: "text-[32px]",
} as const;

const ICON_SIZE = {
  sm: "h-[14px] w-[22px]",
  md: "h-[16px] w-[26px]",
  lg: "h-[22px] w-[36px]",
} as const;

export function PrepLaneLogo({ size = "md", showIcon = true, className }: PrepLaneLogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2 min-w-0", className)}>
      {showIcon && <PrepLaneMark className={ICON_SIZE[size]} />}
      <span className={cn("font-bold tracking-tight leading-none whitespace-nowrap", TEXT_SIZE[size])}>
        <span style={{ color: "#E38330" }}>Prep</span>
        <span style={{ color: "var(--lx-text, #1A1916)" }}>Lane</span>
      </span>
    </span>
  );
}
