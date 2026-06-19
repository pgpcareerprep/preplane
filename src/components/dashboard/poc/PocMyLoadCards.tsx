import { Building2, ChevronRight, GitBranch, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LxInfo } from "@/components/insights/LxInfo";
import { LX_HEX } from "@/components/insights/primitives";

type LoadCard = {
  label: string;
  value: number;
  helper: string;
  icon: typeof Building2;
  accent: string;
  info?: string;
  onClick?: () => void;
};

function LoadCardItem({ label, value, helper, icon: Icon, accent, info, onClick }: LoadCard) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border p-4 text-left w-full transition-colors",
        clickable && "hover:bg-[var(--lx-soft)] cursor-pointer group",
        !clickable && "cursor-default",
      )}
      style={{
        background: "var(--lx-surface)",
        borderColor: "var(--lx-border)",
        borderWidth: 0.5,
        boxShadow: "0 1px 2px rgba(26,25,22,0.04)",
      }}
    >
      <span
        className="h-10 w-10 rounded-xl grid place-items-center shrink-0"
        style={{ background: `${accent}18`, color: accent }}
      >
        <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[12px] font-medium inline-flex items-center gap-1" style={{ color: "var(--lx-text-2)" }}>
          {label}
          {info && <LxInfo text={info} size={11} />}
        </span>
        <span className="block text-[26px] font-bold tabular-nums leading-none mt-1" style={{ color: accent }}>
          {value}
        </span>
        <span className="block text-[11.5px] mt-1 truncate" style={{ color: "var(--lx-text-3)" }}>{helper}</span>
      </span>
      {clickable && (
        <ChevronRight
          className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
          style={{ color: "var(--lx-text-3)" }}
        />
      )}
    </button>
  );
}

export function PocMyLoadCards({
  inDomainCount,
  crossDomainCount,
  primaryPocCount,
  supportPocCount,
  onInDomainClick,
  onCrossDomainClick,
  onPrimaryClick,
  onSupportClick,
  inDomainInfo,
  crossDomainInfo,
  primaryInfo,
  supportInfo,
}: {
  inDomainCount: number;
  crossDomainCount: number;
  primaryPocCount: number;
  supportPocCount: number;
  onInDomainClick?: () => void;
  onCrossDomainClick?: () => void;
  onPrimaryClick?: () => void;
  onSupportClick?: () => void;
  inDomainInfo?: string;
  crossDomainInfo?: string;
  primaryInfo?: string;
  supportInfo?: string;
}) {
  const cards: LoadCard[] = [
    {
      label: "In-domain LMPs",
      value: inDomainCount,
      helper: "Matches my domains",
      icon: Building2,
      accent: LX_HEX.teal,
      info: inDomainInfo,
      onClick: onInDomainClick,
    },
    {
      label: "Cross-domain",
      value: crossDomainCount,
      helper: "Outside my domains",
      icon: GitBranch,
      accent: LX_HEX.orange,
      info: crossDomainInfo,
      onClick: onCrossDomainClick,
    },
    {
      label: "Primary POC",
      value: primaryPocCount,
      helper: "Prep / primary role",
      icon: User,
      accent: LX_HEX.info,
      info: primaryInfo,
      onClick: onPrimaryClick,
    },
    {
      label: "Support POC",
      value: supportPocCount,
      helper: "Support / secondary role",
      icon: Users,
      accent: LX_HEX.ai,
      info: supportInfo,
      onClick: onSupportClick,
    },
  ];

  return (
    <div>
      <h3 className="text-[16px] font-semibold mb-3" style={{ color: "var(--lx-text)" }}>My Load</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-gutter">
        {cards.map((c) => (
          <LoadCardItem key={c.label} {...c} />
        ))}
      </div>
    </div>
  );
}
