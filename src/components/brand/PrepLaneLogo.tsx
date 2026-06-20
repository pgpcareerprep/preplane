import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/themeContext";
import { PrepLaneMark } from "./PrepLaneMark";

type PrepLaneLogoProps = {
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  /** "text" = inline wordmark; "image" = theme-specific PNG (top nav). */
  variant?: "text" | "image";
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

const IMAGE_HEIGHT = {
  sm: "h-6",
  md: "h-7",
  lg: "h-10",
} as const;

export function PrepLaneLogo({ size = "md", showIcon = true, variant = "text", className }: PrepLaneLogoProps) {
  const { theme } = useTheme();

  if (variant === "image") {
    return (
      <img
        src={theme === "dark" ? "/preplane-logo-dark.png" : "/preplane-logo-light.png"}
        alt="PrepLane"
        className={cn(IMAGE_HEIGHT[size], "w-auto object-contain", className)}
      />
    );
  }

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
