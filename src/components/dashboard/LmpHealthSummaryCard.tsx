/**
 * LmpHealthSummaryCard — Lumina v1
 *
 * Replaces the old LxHero "LMP Health Summary" with:
 *  - Total LMPs (distinct processes in the current filtered scope)
 *  - Process-wise Conversion % (Converted ÷ (Total - Closed) × 100)
 *  - Live donut chart (Recharts) showing the 7 canonical status buckets
 *  - 7 interactive status cards with count + % of total
 *
 * Closed definition (canonical, from lmpStatusCounts):
 *   lsc["other-reasons"] = records with status in
 *   { "other-reasons", "dormant", "closed", "converted-na" }
 *
 * Data flows in from the parent dashboard (filteredRecords already filtered
 * and the lmpStatusCounts already computed). No additional queries here.
 */

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { LX_HEX } from "@/components/insights/primitives";
import { LxInfo } from "@/components/insights/LxInfo";
import type { LmpStatus } from "@/types/lmp";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActiveLmpStatus = Exclude<
  LmpStatus,
  "ongoing" | "dormant" | "closed" | "converted-na" | "offer-received"
>;

export type LmpStatusCounts = {
  "not-started": number;
  "prep-ongoing": number;
  "prep-done": number;
  hold: number;
  converted: number;
  "not-converted": number;
  "other-reasons": number;
};

// ── Status colour palette ─────────────────────────────────────────────────────
// Matches the donut slices and status card borders.
// Uses LX_HEX where appropriate; "On hold" uses the softer plum CSS token value.

export const STATUS_HEX: Record<string, string> = {
  "not-started":    LX_HEX.neutral,   // #7A756C — muted slate
  "prep-ongoing":   LX_HEX.info,      // #4A8EE8 — soft blue
  "prep-done":      LX_HEX.yellow,    // #F7D344 — gold
  hold:             "#8B5CF6",         // soft purple (lx-ai CSS token, softer than LX_HEX.ai)
  converted:        LX_HEX.success,   // #6A9E62 — soft green
  "not-converted":  LX_HEX.risk,      // #F07040 — coral
  "other-reasons":  LX_HEX.orange,    // #E38330 — soft orange
};

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Array<{
  status: ActiveLmpStatus;
  label: string;
}> = [
  { status: "not-started",   label: "Not Started"   },
  { status: "prep-ongoing",  label: "Prep Ongoing"  },
  { status: "prep-done",     label: "Prep Done"     },
  { status: "hold",          label: "On hold"       },
  { status: "converted",     label: "Converted"     },
  { status: "not-converted", label: "Not Converted" },
  { status: "other-reasons", label: "Other reasons" },
];

// ── Tooltip ───────────────────────────────────────────────────────────────────

function DonutTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const hex = STATUS_HEX[payload[0].payload?.status] ?? LX_HEX.neutral;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-[12px] shadow-sm"
      style={{
        background: "var(--lx-surface)",
        borderColor: "var(--lx-border)",
        color: "var(--lx-text)",
      }}
    >
      <div className="flex items-center gap-2 font-semibold">
        <span className="h-2 w-2 rounded-sm shrink-0" style={{ background: hex }} />
        {name}
      </div>
      <div className="mt-0.5 tabular-nums" style={{ color: "var(--lx-text-2)" }}>
        {value} LMP{value !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function LmpHealthSkeleton() {
  return (
    <div className="lumina rounded-2xl border overflow-hidden animate-pulse"
      style={{ background: "var(--lx-surface)", borderColor: "var(--lx-border)" }}>
      <div className="p-6 lx-grad-mu">
        <div className="h-4 w-36 rounded mb-2" style={{ background: "rgba(26,25,22,0.15)" }} />
        <div className="h-6 w-56 rounded mb-1" style={{ background: "rgba(26,25,22,0.12)" }} />
        <div className="h-4 w-80 rounded" style={{ background: "rgba(26,25,22,0.10)" }} />
        <div className="flex flex-col lg:flex-row gap-8 mt-6">
          <div className="flex gap-10">
            <div>
              <div className="h-3 w-20 rounded mb-3" style={{ background: "rgba(26,25,22,0.12)" }} />
              <div className="h-10 w-16 rounded" style={{ background: "rgba(26,25,22,0.15)" }} />
            </div>
            <div>
              <div className="h-3 w-32 rounded mb-3" style={{ background: "rgba(26,25,22,0.12)" }} />
              <div className="h-10 w-20 rounded" style={{ background: "rgba(26,25,22,0.15)" }} />
            </div>
          </div>
          <div className="ml-auto h-[160px] w-[160px] rounded-full" style={{ background: "rgba(26,25,22,0.12)" }} />
        </div>
      </div>
      <div className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5"
        style={{ background: "var(--lx-surface)", borderTop: "1px solid var(--lx-border)" }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="h-16 rounded-xl" style={{ background: "var(--lx-soft)" }} />
        ))}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function LmpHealthSummaryCard({
  total,
  lsc,
  isLoading,
  isError,
  onStatusClick,
}: {
  /** COUNT(DISTINCT lmp_id) — filteredRecords.length */
  total: number;
  lsc: LmpStatusCounts;
  isLoading?: boolean;
  isError?: boolean;
  onStatusClick?: (status: ActiveLmpStatus) => void;
}) {
  // ── Conversion formula ──────────────────────────────────────────────────────
  // Closed = other-reasons (absorbs: other-reasons, dormant, closed, converted-na)
  // Eligible = Total Processes - Closed
  // Process-wise Conversion = Converted ÷ Eligible × 100
  const closedProcesses = lsc["other-reasons"];
  const eligibleProcesses = total - closedProcesses;
  const processConversionPct: number | null =
    eligibleProcesses > 0 ? (lsc.converted / eligibleProcesses) * 100 : null;

  const formatConversionPct = (v: number | null) =>
    v === null ? "—" : `${v.toFixed(1)}%`;

  // ── Donut data ──────────────────────────────────────────────────────────────
  const donutData = useMemo(() =>
    STATUS_CONFIG.map(({ status, label }) => ({
      status,
      name: label,
      value: lsc[status as keyof LmpStatusCounts] ?? 0,
    })).filter((s) => s.value > 0),
  [lsc]);

  // Donut total should reconcile with `total`. Report mismatch in dev.
  const donutSum = donutData.reduce((s, x) => s + x.value, 0);
  if (process.env.NODE_ENV !== "production" && donutSum !== total && total > 0) {
    console.warn(
      `[LmpHealthSummaryCard] Donut total (${donutSum}) ≠ Total LMPs (${total}). ` +
      "Some records may have unmapped status values.",
    );
  }

  // ── Hero gradient text tokens ───────────────────────────────────────────────
  const heroText  = "var(--lx-hero-text, #1A1916)";
  const heroMuted = "var(--lx-hero-muted, rgba(26,25,22,0.66))";
  const heroDivider = "var(--lx-hero-divider, rgba(26,25,22,0.14))";

  if (isLoading) return <LmpHealthSkeleton />;

  if (isError) {
    return (
      <div className="lumina rounded-2xl border px-6 py-10 text-center"
        style={{ background: "var(--lx-surface)", borderColor: "var(--lx-border)" }}>
        <p className="text-[14px] font-medium" style={{ color: LX_HEX.risk }}>
          Failed to load LMP health summary.
        </p>
        <p className="text-[12.5px] mt-1" style={{ color: "var(--lx-text-3)" }}>
          Refresh the page to retry.
        </p>
      </div>
    );
  }

  const conversionAccent =
    processConversionPct === null ? heroText :
    processConversionPct >= 50 ? LX_HEX.success : heroText;

  return (
    <div
      className="lumina rounded-2xl border overflow-hidden"
      style={{ background: "var(--lx-surface)", borderColor: "var(--lx-border)" }}
    >
      {/* ── Gradient hero section ─── */}
      <div className="relative lx-grad-mu px-6 pt-5 pb-6">
        {/* Subtle radial sheen */}
        <div
          className="absolute inset-0 pointer-events-none lx-hero-sheen"
          style={{ background: "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.40), transparent 55%)" }}
          aria-hidden
        />

        {/* Header row */}
        <div className="relative flex items-start justify-between gap-4 mb-5">
          <div>
            <div className="text-[10.5px] font-semibold uppercase tracking-[1.3px]" style={{ color: heroMuted }}>
              LMP HEALTH SUMMARY
            </div>
            <h2 className="mt-1 text-[19px] font-semibold tracking-tight" style={{ color: heroText }}>
              Live pipeline health
            </h2>
            <p className="mt-0.5 text-[12.5px]" style={{ color: heroMuted }}>
              Status distribution and process conversion for the selected view.
            </p>
          </div>
          {/* Live indicator */}
          <span
            className="shrink-0 inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[10.5px] font-medium"
            style={{
              background: "rgba(255,255,255,0.35)",
              border: "1px solid rgba(26,25,22,0.10)",
              color: heroText,
            }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: LX_HEX.success }} />
            Live
          </span>
        </div>

        {/* Metrics row + Donut */}
        <div className="relative flex flex-col lg:flex-row items-start lg:items-center gap-6 lg:gap-8">
          {/* Left: Total LMPs + Process-wise Conversion */}
          <div className="flex flex-wrap items-stretch gap-x-10 gap-y-5">
            {/* Total LMPs */}
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-[1.1px] inline-flex items-center gap-1"
                style={{ color: heroMuted }}
              >
                Total LMPs
                <LxInfo text="Distinct LMP processes in the current filtered scope." size={12} />
              </div>
              {total === 0 ? (
                <div className="mt-1 text-[42px] leading-none font-semibold tracking-tight tabular-nums" style={{ color: heroText }}>
                  0
                </div>
              ) : (
                <div
                  className="mt-1 text-[42px] leading-none font-semibold tracking-tight tabular-nums"
                  style={{ color: heroText }}
                >
                  {total}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="hidden sm:block w-px self-stretch" style={{ background: heroDivider }} aria-hidden />

            {/* Process-wise Conversion */}
            <div>
              <div
                className="text-[10px] font-semibold uppercase tracking-[1.1px] inline-flex items-center gap-1"
                style={{ color: heroMuted }}
              >
                Process-wise Conversion
                <LxInfo
                  text={
                    "Converted LMPs ÷ (Total Processes − Closed Processes) × 100.\n" +
                    "Closed = Other Reasons bucket (includes dormant, archived, converted-na)."
                  }
                  size={12}
                />
              </div>
              <div
                className="mt-1 text-[42px] leading-none font-semibold tracking-tight tabular-nums"
                style={{ color: conversionAccent }}
                aria-label={`Process-wise Conversion: ${formatConversionPct(processConversionPct)}`}
              >
                {formatConversionPct(processConversionPct)}
              </div>
              <div className="mt-1.5 text-[11.5px]" style={{ color: heroMuted }}>
                {lsc.converted} converted · {eligibleProcesses} eligible
              </div>
            </div>
          </div>

          {/* Right: Donut chart */}
          <div className="shrink-0 lg:ml-auto">
            {total === 0 ? (
              /* Empty donut state */
              <div
                className="relative flex flex-col items-center justify-center rounded-full"
                style={{ width: 160, height: 160, background: "rgba(26,25,22,0.10)" }}
                role="img"
                aria-label="No LMPs in current filter scope"
              >
                <div className="text-[13px] font-medium text-center px-4" style={{ color: heroMuted }}>
                  No LMPs
                </div>
              </div>
            ) : (
              <div
                className="relative"
                style={{ width: 160, height: 160 }}
                role="img"
                aria-label={`LMP status distribution: ${STATUS_CONFIG.map((s) => `${s.label} ${lsc[s.status as keyof LmpStatusCounts]}`).join(", ")}`}
                title="Distribution of LMPs by current status"
              >
                {/* Recharts donut — provides accessible tooltips per segment */}
                <PieChart width={160} height={160}>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={76}
                    paddingAngle={donutData.length > 1 ? 1 : 0}
                    strokeWidth={2}
                    stroke="rgba(255,255,255,0.7)"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {donutData.map((entry) => (
                      <Cell key={entry.status} fill={STATUS_HEX[entry.status] ?? LX_HEX.neutral} />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>
                {/* Center label */}
                <div
                  className="absolute inset-[22px] rounded-full flex flex-col items-center justify-center pointer-events-none"
                  style={{ background: "rgba(255,255,255,0.88)", border: "1px solid rgba(26,25,22,0.08)" }}
                  aria-hidden
                >
                  <div className="text-[26px] font-bold leading-none tabular-nums" style={{ color: "var(--lx-text)" }}>
                    {total}
                  </div>
                  <div className="text-[9px] font-semibold uppercase tracking-[0.8px] mt-1" style={{ color: "rgba(26,25,22,0.55)" }}>
                    LMPs
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Status cards ─── */}
      <div
        className="px-5 py-4"
        style={{ background: "var(--lx-surface)", borderTop: "1px solid var(--lx-border)" }}
      >
        {total === 0 ? (
          <div className="py-6 text-center text-[13px]" style={{ color: "var(--lx-text-3)" }}>
            No LMPs are available for the selected filters.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {STATUS_CONFIG.map(({ status, label }) => {
              const value = lsc[status as keyof LmpStatusCounts] ?? 0;
              const pct = total > 0 ? (value / total) * 100 : 0;
              const color = STATUS_HEX[status];
              const clickable = !!onStatusClick;
              return (
                <div
                  key={status}
                  className="rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-all"
                  style={{
                    background: "var(--lx-soft)",
                    border: "1px solid var(--lx-border)",
                    borderLeft: `3px solid ${color}`,
                    cursor: clickable ? "pointer" : undefined,
                  }}
                  onClick={clickable ? () => onStatusClick!(status as ActiveLmpStatus) : undefined}
                  role={clickable ? "button" : undefined}
                  tabIndex={clickable ? 0 : undefined}
                  aria-label={`${label}: ${value} LMPs, ${pct.toFixed(0)}% of total`}
                  title={`Share of Total LMPs currently in ${label} status.`}
                  onKeyDown={(e) => {
                    if (clickable && (e.key === "Enter" || e.key === " ")) {
                      e.preventDefault();
                      onStatusClick!(status as ActiveLmpStatus);
                    }
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
                    <div
                      className="text-[9.5px] font-semibold uppercase tracking-[0.5px] truncate"
                      style={{ color: "var(--lx-text-3)" }}
                    >
                      {label}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div
                      className="text-[20px] font-semibold leading-none tabular-nums"
                      style={{ color: "var(--lx-text)" }}
                    >
                      {value}
                    </div>
                    <div
                      className="text-[11px] font-semibold tabular-nums"
                      style={{ color }}
                    >
                      {pct.toFixed(0)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
