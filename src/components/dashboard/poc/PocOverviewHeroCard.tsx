/**
 * Combined POC overview hero — conversion, summary stats, status distribution.
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
  boxShadow: "0 1px 2px rgba(26,25,22,0.04)",
  background:
    "linear-gradient(to right, rgba(255,255,255,0.78), rgba(255,255,255,0.48)), var(--lx-grad-yellow)",
  minHeight: 280,
} as const;

const POC_MINI_CARD = {
  background: "rgba(255,255,255,0.42)",
  border: "0.5px solid rgba(232,229,220,0.85)",
  borderRadius: 10,
} as const;

const POC_TXT = "var(--lx-hero-text, #1A1916)";
const POC_MUTED = "var(--lx-hero-muted, rgba(26,25,22,0.66))";

const STATUS_ROWS: Array<{ status: ActiveLmpStatus; label: string }> = [
  { status: "not-started", label: "Not Started" },
  { status: "prep-ongoing", label: "Prep Ongoing" },
  { status: "prep-done", label: "Prep Done" },
  { status: "hold", label: "On Hold" },
  { status: "converted", label: "Converted" },
  { status: "not-converted", label: "Not Converted" },
  { status: "other-reasons", label: "Other Reasons" },
];

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
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = (safe / 100) * c;

  return (
    <div className="flex flex-col h-full min-w-0 px-4 py-4 lg:px-5 lg:py-4">
      <h3
        className="text-[14px] font-semibold inline-flex items-center gap-1.5 shrink-0"
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
          "flex flex-col items-center justify-center flex-1 mt-3 min-h-[140px] w-full rounded-xl transition-colors",
          onConversionClick && "hover:bg-white/45 cursor-pointer group",
        )}
      >
        <div className="relative shrink-0" style={{ width: 120, height: 120 }} aria-hidden>
          <svg viewBox="0 0 100 100" width="120" height="120">
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
            className="absolute inset-0 grid place-items-center text-[26px] font-bold tabular-nums"
            style={{ color: LX_HEX.success }}
          >
            {safe.toFixed(0)}%
          </div>
        </div>

        <p
          className={cn(
            "text-[13px] mt-3 text-center leading-snug max-w-[220px]",
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

function PocSummaryMiniStats({
  totalLmpCount,
  convertedCount,
  eligibleCount,
  onTotalClick,
  onConvertedClick,
  onEligibleClick,
}: {
  totalLmpCount: number;
  convertedCount: number;
  eligibleCount: number;
  onTotalClick?: () => void;
  onConvertedClick?: () => void;
  onEligibleClick?: () => void;
}) {
  const items = [
    { icon: Layers, label: "Total LMPs", value: totalLmpCount, accent: LX_HEX.info, onClick: onTotalClick },
    { icon: CheckCircle2, label: "Converted", value: convertedCount, accent: LX_HEX.success, onClick: onConvertedClick },
    { icon: Users, label: "Eligible", value: eligibleCount, accent: LX_HEX.ai, onClick: onEligibleClick },
  ] as const;

  return (
    <div className="flex flex-col justify-center gap-2 h-full min-w-0 px-4 py-4 lg:px-3 lg:py-4">
      {items.map(({ icon: Icon, label, value, accent, onClick }) => {
        const clickable = !!onClick;
        return (
          <button
            key={label}
            type="button"
            disabled={!clickable}
            onClick={onClick}
            className={cn(
              "flex items-center gap-2.5 w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
              clickable && "hover:bg-white/55 cursor-pointer",
            )}
            style={POC_MINI_CARD}
          >
            <span
              className="h-8 w-8 rounded-lg grid place-items-center shrink-0"
              style={{ background: `${accent}22`, color: accent }}
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
            </span>
            <span className="min-w-0 flex-1 flex items-baseline justify-between gap-2">
              <span className="text-[11.5px] font-medium truncate" style={{ color: POC_MUTED }}>
                {label}
              </span>
              <span className="text-[18px] font-bold tabular-nums leading-none shrink-0" style={{ color: POC_TXT }}>
                {value}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PocStatusDistribution({
  totalLmpCount,
  segments,
  onStatusClick,
}: {
  totalLmpCount: number;
  segments: Array<{
    status: ActiveLmpStatus;
    label: string;
    value: number;
    hex: string;
    pct: number;
  }>;
  onStatusClick?: (status: ActiveLmpStatus) => void;
}) {
  const safeTotal = totalLmpCount || 0;
  const hasData = safeTotal > 0;

  return (
    <div className="flex flex-col h-full min-w-0 px-4 py-4 lg:px-5 lg:py-4">
      <div className="flex items-start justify-between gap-3 mb-2.5 shrink-0">
        <h3 className="text-[14px] font-semibold leading-tight" style={{ color: POC_TXT }}>
          LMP Status Distribution
        </h3>
        <div className="text-right shrink-0">
          <div
            className="text-[9.5px] font-semibold uppercase tracking-[0.6px]"
            style={{ color: POC_MUTED }}
          >
            Total LMPs
          </div>
          <div
            className="text-[22px] font-bold tabular-nums leading-none mt-0.5"
            style={{ color: POC_TXT }}
          >
            {safeTotal}
          </div>
        </div>
      </div>

      {hasData ? (
        <>
          <div className="flex mb-0.5 min-h-[12px] shrink-0">
            {segments.map((s) =>
              s.pct > 0 ? (
                <div
                  key={`pct-${s.status}`}
                  className="text-[8.5px] font-medium tabular-nums text-center truncate leading-none"
                  style={{ width: `${s.pct}%`, color: POC_MUTED }}
                >
                  {s.pct.toFixed(0)}%
                </div>
              ) : null,
            )}
          </div>
          <div
            className="h-[7px] w-full overflow-hidden rounded-full mb-2.5 shrink-0"
            style={{ background: "rgba(255,255,255,0.35)" }}
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
                    className={cn("h-full", click && "cursor-pointer")}
                    style={{ background: s.hex, minWidth: s.pct > 0 ? 2 : 0 }}
                    title={`${s.label}: ${s.value}`}
                    onClick={click}
                    role={click ? "button" : undefined}
                  />
                );
              })}
            </div>
          </div>
        </>
      ) : (
        <div className="h-[7px] w-full rounded-full mb-2.5 shrink-0" style={{ background: "var(--lx-soft)" }} />
      )}

      <ul className="flex-1 min-h-0 space-y-0 overflow-y-auto">
        {segments.map((s) => {
          const click = onStatusClick ? () => onStatusClick(s.status) : undefined;
          return (
            <li key={s.status}>
              <button
                type="button"
                disabled={!click}
                onClick={click}
                className={cn(
                  "flex items-center justify-between gap-2 w-full rounded-md px-1.5 py-[5px] text-left transition-colors",
                  click && "hover:bg-white/45 cursor-pointer",
                )}
              >
                <span className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="h-[7px] w-[7px] rounded-full shrink-0" style={{ background: s.hex }} aria-hidden />
                  <span className="text-[12px] truncate" style={{ color: POC_MUTED }}>
                    {s.label}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-[11.5px] flex items-center gap-2.5">
                  <span className="font-semibold min-w-[1.25rem] text-right" style={{ color: POC_TXT }}>
                    {s.value}
                  </span>
                  <span className="min-w-[2rem] text-right" style={{ color: POC_MUTED }}>
                    {s.pct.toFixed(0)}%
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
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
        pct: safeTotal > 0 ? ((lsc[status] ?? 0) / safeTotal) * 100 : 0,
      })),
    [lsc, safeTotal],
  );

  return (
    <div
      className="rounded-2xl border overflow-hidden relative lx-grad-yellow lx-grain-overlay"
      style={POC_HERO_SURFACE}
    >
      <div
        className="relative z-[1] grid grid-cols-1 md:grid-cols-[1.15fr_0.95fr_1.35fr] items-stretch divide-y md:divide-y-0 md:divide-x min-h-[280px]"
        style={{ borderColor: "rgba(232,229,220,0.75)" }}
      >
        <PocConversionSummary
          conversionPct={conversionPct}
          convertedCount={convertedCount}
          eligibleCount={eligibleCount}
          conversionInfo={conversionInfo}
          onConversionClick={onConversionClick}
        />
        <PocSummaryMiniStats
          totalLmpCount={totalLmpCount}
          convertedCount={convertedCount}
          eligibleCount={eligibleCount}
          onTotalClick={onTotalClick}
          onConvertedClick={onConvertedClick}
          onEligibleClick={onEligibleClick}
        />
        <PocStatusDistribution
          totalLmpCount={totalLmpCount}
          segments={segments}
          onStatusClick={onStatusClick}
        />
      </div>
    </div>
  );
}
