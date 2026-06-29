import { type LucideIcon, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface QuickActionCardProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  to?: string;
  onClick?: () => void;
  badge?: string | number;
  disabled?: boolean;
}

export function QuickActionCard({ icon: Icon, label, description, to, onClick, badge, disabled }: QuickActionCardProps) {
  const navigate = useNavigate();

  const handlePress = () => {
    if (disabled) return;
    if (to) navigate(to);
    else onClick?.();
  };

  return (
    <button
      onClick={handlePress}
      disabled={disabled}
      className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left active:scale-[0.98] transition-transform disabled:opacity-40"
      style={{ minHeight: "64px" }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        {description && (
          <span className="block text-xs text-muted-foreground mt-0.5 leading-tight">{description}</span>
        )}
      </span>
      {badge != null && (
        <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
          {badge}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}
