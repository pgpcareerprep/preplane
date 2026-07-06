/**
 * Combined POC overview hero — status distribution (horizontal) + conversion.
 * UI only; all values passed from parent live hook data.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Layers, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { LxInfo } from "@/components/insights/LxInfo";
import { LX_HEX } from "@/components/insights/primitives";
import {
  STATUS_HEX,
  type ActiveLmpStatus,
  type LmpStatusCounts,
} from "@/components/dashboard/LmpHealthSummaryCard";

const POC_HERO_SURFACE = {
  border: "0.5px solid var(--lx-border)",
  borderRadius: 16,
  boxShadow: "var(--shadow-sm)",
  background: "var(--poc-hero-card-bg)",
  minHeight: 280,
} as const;

const POC_MINI_CARD = {
  background: "var(--lmp-health-mini-bg)",
  border: "0.5px solid var(--lmp-health-mini-border)",
  borderRadius: 10,
} as const;

const POC_STATUS_CARD = {
  background: "var(--lmp-health-mini-bg)",
  border: "0.5px solid var(--lmp-health-mini-border)",
  borderRadius: 12,
} as const;

const POC_TXT = "var(--lx-hero-text, #1A1916)";
const POC_MUTED = "var(--lx-hero-muted, rgba(26,25,22,0.66))";
const POC_DIVIDE = "var(--lx-hero-divider, rgba(26,25,22,0.16))";

/** Segments below this share get their % rendered above the bar instead of inside it. */
const INLINE_LABEL_THRESHOLD = 8;

const STATUS_ROWS: Array<{ status: ActiveLmpStatus; label: string }> = [
  { status: "not-started", label: "Not Started" },
  { status: "prep-ongoing", label: "Prep Ongoing" },
  { status: "prep-done", label: "Prep Done" },
  { status: "hold", label: "On Hold" },
  { status: "converted", label: "Converted" },
  { status: "not-converted", label: "Not Converted" },
  { status: "other-reasons", label: "Other Reasons" },
];

/** Safe percentage — never divides by zero, never returns NaN. */
function pctOf(value: number, total: number): number {
  if (total <= 0 || !Number.isFinite(value)) return 0;
  const pct = (value / total) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

function PocMiniStat({
  icon: Icon,
  label,
  value,
  accent,
  onClick,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  accent: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition-colors shrink-0",
        clickable && "hover:bg-white/55 cursor-pointer",
      )}
      style={POC_MINI_CARD}
    >
      <span
        className="h-6 w-6 rounded-md grid place-items-center shrink-0"
        style={{ background: `${accent}22`, color: accent }}
      >
        <Icon className="h-3 w-3" strokeWidth={2.25} />
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color: POC_TXT }}>
          {value}
        </span>
        <span className="text-[11px] font-medium" style={{ color: POC_MUTED }}>
          {label}
        </span>
      </span>
    </button>
  );
}

function PocStatusCard({
  label,
  value,
  pct,
  hex,
  onClick,
}: {
  label: string;
  value: number;
  pct: number;
  hex: string;
  onClick?: () => void;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      title={`${label}: ${value} (${pct.toFixed(0)}%)`}
      className={cn(
        "flex flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition-colors min-w-0",
        clickable && "hover:brightness-95 cursor-pointer",
      )}
      style={POC_STATUS_CARD}
    >
      <span className="flex items-center gap-1.5 min-w-0">
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: hex }} aria-hidden />
        <span className="text-[11px] font-medium truncate" style={{ color: POC_TXT }} title={label}>
          {label}
        </span>
      </span>
      <span className="flex items-baseline justify-between gap-1">
        <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color: POC_TXT }}>
          {value}
        </span>
        <span className="text-[11px] font-semibold tabular-nums" style={{ color: pct > 0 ? hex : POC_MUTED }}>
          {pct.toFixed(0)}%
        </span>
      </span>
    </button>
  );
}

function PocStatusDistribution({
  totalLmpCount,
  segments,
  convertedCount,
  eligibleCount,
  onStatusClick,
  onTotalClick,
  onConvertedClick,
  onEligibleClick,
}: {
  totalLmpCount: number;
  segments: Array<{
    status: ActiveLmpStatus;
    label: string;
    value: number;
    hex: string;
    pct: number;
  }>;
  convertedCount: number;
  eligibleCount: number;
  onStatusClick?: (status: ActiveLmpStatus) => void;
  onTotalClick?: () => void;
  onConvertedClick?: () => void;
  onEligibleClick?: () => void;
}) {
  const safeTotal = totalLmpCount || 0;
  const hasData = safeTotal > 0;

  return (
    <div className="flex flex-col h-full min-w-0 px-4 py-4 lg:px-5 lg:py-4 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <h3 className="text-[14px] font-semibold leading-tight shrink-0" style={{ color: POC_TXT }}>
          LMP Status Distribution
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <PocMiniStat icon={Layers} label="Total" value={totalLmpCount} accent={LX_HEX.info} onClick={onTotalClick} />
          <PocMiniStat icon={CheckCircle2} label="Converted" value={convertedCount} accent={LX_HEX.success} onClick={onConvertedClick} />
          <PocMiniStat icon={Users} label="Eligible" value={eligibleCount} accent={LX_HEX.ai} onClick={onEligibleClick} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-1.5 lg:gap-2 shrink-0">
        {segments.map((s) => (
          <PocStatusCard
            key={s.status}
            label={s.label}
            value={s.value}
            pct={s.pct}
            hex={s.hex}
            onClick={onStatusClick ? () => onStatusClick(s.status) : undefined}
          />
        ))}
      </div>

      {hasData ? (
        <>
          <div className="flex min-h-[12px] shrink-0">
            {segments.map((s) =>
              s.pct > 0 && s.pct < INLINE_LABEL_THRESHOLD ? (
                <div
                  key={`pct-${s.status}`}
                  className="text-[8.5px] font-medium tabular-nums text-center truncate leading-none"
                  style={{ width: `${s.pct}%`, color: POC_MUTED }}
                >
                  {s.pct.toFixed(0)}%
                </div>
              ) : s.pct > 0 ? (
                <div key={`pct-${s.status}`} style={{ width: `${s.pct}%` }} />
              ) : null,
            )}
          </div>
          <div
            className="h-5 w-full overflow-hidden rounded-full shrink-0"
            style={{ background: "rgba(255,255,255,0.4)" }}
            role="img"
            aria-label="LMP status distribution"
          >
            <div className="flex h-full w-full">
              {segments.map((s) => {
                if (s.pct <= 0) return null;
                const click = onStatusClick ? () => onStatusClick(s.status) : undefined;
                return (
                  <motion.div
                    key={s.status}
                    initial={{ width: 0 }}
                    animate={{ width: `${s.pct}%` }}
                    transition={{ duration: 0.45, ease: [0, 0, 0.2, 1] }}
                    className={cn("h-full flex items-center justify-center overflow-hidden", click && "cursor-pointer")}
                    style={{ background: s.hex, minWidth: s.pct > 0 ? 2 : 0 }}
                    title={`${s.label}: ${s.value} (${s.pct.toFixed(0)}%)`}
                    onClick={click}
                    role={click ? "button" : undefined}
                  >
                    {s.pct >= INLINE_LABEL_THRESHOLD && (
                      <span className="text-[10.5px] font-semibold text-white leading-none truncate px-1">
                        {s.pct.toFixed(0)}%
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="h-5 w-full rounded-full shrink-0" style={{ background: "var(--lx-soft)" }} />
      )}
    </div>
  );
}

function PocConversionSummary({
  conversionPct,
  convertedCount,
  eligibleCount,
  conversionInfo,
  onConversionClick,
}: {
  conversionPct: number;
  convertedCount: number;
  eligibleCount: number;
  conversionInfo?: string;
  onConversionClick?: () => void;
}) {
  const safe = Number.isFinite(conversionPct) ? Math.max(0, Math.min(100, conversionPct)) : 0;
  const r = 40;
  const c = 2 * Math.PI * r;
  const dash = (safe / 100) * c;

  return (
    <div className="flex flex-col h-full min-w-0 px-3 py-4 lg:px-4 lg:py-4">
      <h3
        className="text-[13px] font-semibold inline-flex items-center gap-1.5 shrink-0 leading-tight"
        style={{ color: POC_TXT }}
      >
        Overall POC Conversion
        {conversionInfo && <LxInfo text={conversionInfo} size={13} />}
      </h3>

      <button
        type="button"
        onClick={onConversionClick}
        disabled={!onConversionClick}
        className={cn(
          "flex flex-col items-center justify-center flex-1 mt-2 min-h-[140px] w-full rounded-xl transition-colors",
          onConversionClick && "hover:bg-card/40 dark:hover:bg-card/20 cursor-pointer group",
        )}
      >
        <div className="relative shrink-0" style={{ width: 108, height: 108 }} aria-hidden>
          <svg viewBox="0 0 100 100" width="108" height="108">
            <circle cx="50" cy="50" r={r} fill="none" stroke="var(--lx-soft)" strokeWidth="7" />
            <motion.circle
              cx="50"
              cy="50"
              r={r}
              fill="none"
              stroke={LX_HEX.success}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c}`}
              transform="rotate(-90 50 50)"
              initial={{ strokeDasharray: `0 ${c}` }}
              animate={{ strokeDasharray: `${dash} ${c}` }}
              transition={{ duration: 0.75, ease: [0, 0, 0.2, 1] }}
            />
          </svg>
          <div
            className="absolute inset-0 grid place-items-center text-[23px] font-bold tabular-nums"
            style={{ color: LX_HEX.success }}
          >
            {safe.toFixed(0)}%
          </div>
        </div>

        <p
          className={cn(
            "text-[12px] mt-2.5 text-center leading-snug max-w-[180px]",
            onConversionClick && "group-hover:underline underline-offset-2",
          )}
          style={{ color: POC_MUTED }}
        >
          <span className="font-semibold tabular-nums" style={{ color: LX_HEX.success }}>
            {convertedCount}
          </span>
          {" converted from "}
          <span className="font-semibold tabular-nums">{eligibleCount}</span>
          {" eligible LMPs"}
        </p>
      </button>
    </div>
  );
}

export function PocOverviewHeroCard({
  conversionPct,
  convertedCount,
  eligibleCount,
  totalLmpCount,
  lsc,
  conversionInfo,
  onConversionClick,
  onTotalClick,
  onConvertedClick,
  onEligibleClick,
  onStatusClick,
}: {
  conversionPct: number;
  convertedCount: number;
  eligibleCount: number;
  totalLmpCount: number;
  lsc: LmpStatusCounts;
  conversionInfo?: string;
  onConversionClick?: () => void;
  onTotalClick?: () => void;
  onConvertedClick?: () => void;
  onEligibleClick?: () => void;
  onStatusClick?: (status: ActiveLmpStatus) => void;
}) {
  const safeTotal = totalLmpCount || 0;

  const segments = useMemo(
    () =>
      STATUS_ROWS.map(({ status, label }) => ({
        status,
        label,
        value: lsc[status] ?? 0,
        hex: STATUS_HEX[status] ?? LX_HEX.neutral,
        pct: pctOf(lsc[status] ?? 0, safeTotal),
      })),
    [lsc, safeTotal],
  );

  return (
    <div
      className="rounded-2xl border overflow-hidden relative lx-grad-green lx-grain-overlay"
      style={POC_HERO_SURFACE}
    >
      <div
        className="relative z-[1] grid grid-cols-1 lg:grid-cols-[4fr_1fr] items-stretch divide-y lg:divide-y-0 lg:divide-x min-h-[280px]"
        style={{ borderColor: POC_DIVIDE }}
      >
        <PocStatusDistribution
          totalLmpCount={totalLmpCount}
          segments={segments}
          convertedCount={convertedCount}
          eligibleCount={eligibleCount}
          onStatusClick={onStatusClick}
          onTotalClick={onTotalClick}
          onConvertedClick={onConvertedClick}
          onEligibleClick={onEligibleClick}
        />
        <PocConversionSummary
          conversionPct={conversionPct}
          convertedCount={convertedCount}
          eligibleCount={eligibleCount}
          conversionInfo={conversionInfo}
          onConversionClick={onConversionClick}
        />
      </div>
    </div>
  );
}
