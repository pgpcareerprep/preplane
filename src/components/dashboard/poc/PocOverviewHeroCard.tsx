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

const STATUS_ROWS: Array<{ status: ActiveLmpStatus; label: string }> = [
  { status: "not-started", label: "Not Started" },
  { status: "prep-ongoing", label: "Prep Ongoing" },
  { status: "prep-done", label: "Prep Done" },
  { status: "hold", label: "On Hold" },
  { status: "converted", label: "Converted" },
  { status: "not-converted", label: "Not Converted" },
  { status: "other-reasons", label: "Other Reasons" },
];

function ConversionRing({ pct }: { pct: number }) {
  const safe = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0;
  const r = 42;
  const c = 2 * Math.PI * r;
  const dash = (safe / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: 108, height: 108 }} aria-hidden>
      <svg viewBox="0 0 100 100" width="108" height="108">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--lx-soft)" strokeWidth="8" />
        <motion.circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={LX_HEX.success}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 50 50)"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${dash} ${c}` }}
          transition={{ duration: 0.75, ease: [0, 0, 0.2, 1] }}
        />
      </svg>
      <div
        className="absolute inset-0 grid place-items-center text-[22px] font-bold tabular-nums"
        style={{ color: LX_HEX.success }}
      >
        {safe.toFixed(0)}%
      </div>
    </div>
  );
}

function MiniStat({
  icon: Icon,
  label,
  value,
  accent,
  onClick,
  info,
}: {
  icon: typeof Layers;
  label: string;
  value: number;
  accent: string;
  onClick?: () => void;
  info?: string;
}) {
  const clickable = !!onClick;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 w-full rounded-xl border px-3 py-2.5 text-left transition-colors",
        clickable && "hover:bg-[var(--lx-soft)] cursor-pointer",
        !clickable && "cursor-default",
      )}
      style={{
        background: "var(--lx-surface)",
        borderColor: "var(--lx-border)",
        borderWidth: 0.5,
      }}
    >
      <span
        className="h-9 w-9 rounded-lg grid place-items-center shrink-0"
        style={{ background: `${accent}18`, color: accent }}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.5px] inline-flex items-center gap-1" style={{ color: "var(--lx-text-3)" }}>
          {label}
          {info && <LxInfo text={info} size={11} />}
        </span>
        <span className="block text-[20px] font-semibold tabular-nums leading-tight mt-0.5" style={{ color: "var(--lx-text)" }}>
          {value}
        </span>
      </span>
    </button>
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
  const safePct = Number.isFinite(conversionPct) ? conversionPct : 0;
  const safeTotal = totalLmpCount || 0;
  const hasData = safeTotal > 0;

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
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--lx-surface)",
        borderColor: "var(--lx-border)",
        borderWidth: 0.5,
        boxShadow: "0 1px 2px rgba(26,25,22,0.04)",
      }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.85fr)_minmax(0,1.25fr)] divide-y lg:divide-y-0 lg:divide-x" style={{ borderColor: "var(--lx-border)" }}>
        {/* Left — Overall POC Conversion */}
        <div className="p-5 flex flex-col sm:flex-row lg:flex-col items-center sm:items-start gap-4">
          <div className="min-w-0 flex-1 w-full">
            <h3 className="text-[15px] font-semibold inline-flex items-center gap-1.5" style={{ color: "var(--lx-text)" }}>
              Overall POC Conversion
              {conversionInfo && <LxInfo text={conversionInfo} />}
            </h3>
            <button
              type="button"
              onClick={onConversionClick}
              className={cn("mt-4 flex items-center gap-4 w-full text-left", onConversionClick && "group cursor-pointer")}
            >
              <ConversionRing pct={safePct} />
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-[36px] font-bold tabular-nums leading-none",
                    onConversionClick && "group-hover:underline underline-offset-4",
                  )}
                  style={{ color: LX_HEX.success }}
                >
                  {safePct.toFixed(0)}%
                </div>
                <p className="text-[13px] mt-2 leading-snug" style={{ color: "var(--lx-text-2)" }}>
                  <span className="font-semibold tabular-nums" style={{ color: LX_HEX.success }}>{convertedCount}</span>
                  {" converted from "}
                  <span className="font-semibold tabular-nums">{eligibleCount}</span>
                  {" eligible LMPs"}
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Middle — Summary stats */}
        <div className="p-5 flex flex-col gap-2 justify-center">
          <MiniStat
            icon={Layers}
            label="Total LMPs"
            value={totalLmpCount}
            accent={LX_HEX.info}
            onClick={onTotalClick}
          />
          <MiniStat
            icon={CheckCircle2}
            label="Converted"
            value={convertedCount}
            accent={LX_HEX.success}
            onClick={onConvertedClick}
          />
          <MiniStat
            icon={Users}
            label="Eligible"
            value={eligibleCount}
            accent={LX_HEX.ai}
            onClick={onEligibleClick}
          />
        </div>

        {/* Right — LMP Status Distribution */}
        <div className="p-5 min-w-0">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h3 className="text-[15px] font-semibold" style={{ color: "var(--lx-text)" }}>
              LMP Status Distribution
            </h3>
            <div className="text-right shrink-0">
              <div className="text-[10.5px] uppercase tracking-[0.5px]" style={{ color: "var(--lx-text-3)" }}>Total LMPs</div>
              <div className="text-[20px] font-semibold tabular-nums leading-none mt-0.5" style={{ color: "var(--lx-text)" }}>
                {safeTotal}
              </div>
            </div>
          </div>

          {hasData ? (
            <>
              <div className="flex mb-1 min-h-[14px]">
                {segments.map((s) =>
                  s.pct > 0 ? (
                    <div
                      key={`pct-${s.status}`}
                      className="text-[9px] font-medium tabular-nums text-center truncate px-0.5"
                      style={{ width: `${s.pct}%`, color: "var(--lx-text-3)" }}
                    >
                      {s.pct.toFixed(0)}%
                    </div>
                  ) : null,
                )}
              </div>
              <div
                className="h-2 w-full overflow-hidden rounded-full mb-3"
                style={{ background: "var(--lx-soft)" }}
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
            <div className="h-2 w-full rounded-full mb-3" style={{ background: "var(--lx-soft)" }} />
          )}

          <ul className="space-y-1">
            {segments.map((s) => {
              const click = onStatusClick ? () => onStatusClick(s.status) : undefined;
              return (
                <li key={s.status}>
                  <button
                    type="button"
                    disabled={!click}
                    onClick={click}
                    className={cn(
                      "flex items-center justify-between gap-2 w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                      click && "hover:bg-[var(--lx-soft)] cursor-pointer",
                    )}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.hex }} aria-hidden />
                      <span className="text-[12.5px] truncate" style={{ color: "var(--lx-text-2)" }}>{s.label}</span>
                    </span>
                    <span className="shrink-0 font-mono tabular-nums text-[12px] flex items-center gap-2">
                      <span className="font-semibold w-5 text-right" style={{ color: "var(--lx-text)" }}>{s.value}</span>
                      <span className="w-8 text-right" style={{ color: "var(--lx-text-3)" }}>{s.pct.toFixed(0)}%</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
