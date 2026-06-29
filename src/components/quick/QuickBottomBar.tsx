import { type ReactNode } from "react";

interface QuickBottomBarProps {
  children: ReactNode;
}

export function QuickBottomBar({ children }: QuickBottomBarProps) {
  return (
    <div
      className="flex gap-3"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {children}
    </div>
  );
}

interface QuickSubmitButtonProps {
  label: string;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "secondary";
}

export function QuickSubmitButton({ label, onClick, loading, disabled, variant = "primary" }: QuickSubmitButtonProps) {
  const base = "flex-1 rounded-xl py-3.5 text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-50";
  const style =
    variant === "primary"
      ? `${base} bg-primary text-primary-foreground`
      : `${base} border border-border bg-card text-foreground`;

  return (
    <button
      className={style}
      onClick={onClick}
      disabled={disabled || loading}
      style={{ minHeight: "52px" }}
    >
      {loading ? "Saving…" : label}
    </button>
  );
}
