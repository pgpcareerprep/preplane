/**
 * LmpHealthSummaryCard — Lumina v1 (UI redesign, reference-matched)
 *
 * UI-ONLY redesign. All business logic, formulas, queries, filters, realtime
 * subscriptions, status mappings, and component contracts are UNCHANGED.
 *
 * Closed definition (canonical, from lmpStatusCounts):
 *   lsc["other-reasons"] = records with status in
 *   { "other-reasons", "dormant", "closed", "converted-na" }
 *
 * Visual changes vs. previous version:
 *  - One continuous lx-grad-mu (yellow→orange) gradient over the full card
 *  - No white lower panel; status cards use translucent rgba backgrounds
 *  - Donut chart sized at 172px with white stroke separators
 *  - Metric values enlarged (~56px bold)
 *  - Status cards: translucent surface, left-side coloured accent, compact
 *  - Loading skeleton and empty/error states restyled to match gradient card
 */

import { useMemo } from "react";
import { PieChart, Pie, Cell, Tooltip } from "recharts";
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
// Donut slices ↔ status card accents ↔ percentage colours — kept in sync.

export const STATUS_HEX: Record<string, string> = {
  "not-started":   LX_HEX.neutral,  // #7A756C  muted slate/charcoal
  "prep-ongoing":  LX_HEX.info,     // #4A8EE8  soft blue
  "prep-done":     LX_HEX.yellow,   // #F7D344  warm yellow/gold
  hold:            "#8B5CF6",        // soft plum (lx-ai CSS token, lighter shade)
  converted:       LX_HEX.success,  // #6A9E62  muted green
  "not-converted": LX_HEX.risk,     // #F07040  soft coral
  "other-reasons": LX_HEX.orange,   // #E38330  muted orange
};

// ── Status display config ─────────────────────────────────────────────────────

const STATUS_CONFIG: Array<{ status: ActiveLmpStatus; label: string }> = [
  { status: "not-started",   label: "Not Started"   },
  { status: "prep-ongoing",  label: "Prep Ongoing"  },
  { status: "prep-done",     label: "Prep Done"     },
  { status: "hold",          label: "On hold"       },
  { status: "converted",     label: "Converted"     },
  { status: "not-converted", label: "Not Converted" },
  { status: "other-reasons", label: "Other reasons" },
];

// ── Shared gradient-surface text tokens ──────────────────────────────────────
// Used throughout the card (gradient covers the entire surface including status cards).

const TXT    = "var(--lx-hero-text,  #1A1916)";          // strong dark
const MUTED  = "var(--lx-hero-muted, rgba(26,25,22,0.66))"; // soft dark
const DIVIDE = "var(--lx-hero-divider, rgba(26,25,22,0.16))"; // divider line

// ── Custom donut tooltip ──────────────────────────────────────────────────────

function DonutTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  const hex = STATUS_HEX[payload[0].payload?.status] ?? LX_HEX.neutral;
  return (
    <div
      className="rounded-xl border px-3 py-2 text-[12px] shadow-sm"
      style={{ background: "var(--lx-surface)", borderColor: "var(--lx-border)", color: "var(--lx-text)" }}
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

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LmpHealthSkeleton() {
  const bone = { background: "rgba(26,25,22,0.13)" };
  return (
    <div
      className="lx-grad-mu rounded-2xl border overflow-hidden animate-pulse"
      style={{ borderColor: "rgba(26,25,22,0.12)", boxShadow: "0 1px 3px rgba(26,25,22,0.08)" }}
    >
      <div className="relative px-5 pt-4 pb-5">
        {/* header skeleton */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-28 rounded" style={bone} />
            <div className="h-6 w-44 rounded" style={bone} />
            <div className="h-3 w-72 rounded" style={bone} />
          </div>
          <div className="h-7 w-16 rounded-full" style={bone} />
        </div>
        {/* metrics + donut skeleton */}
        <div className="flex items-center gap-6 mb-4">
          <div className="flex gap-8 items-stretch">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-20 rounded" style={bone} />
              <div className="h-12 w-14 rounded" style={bone} />
            </div>
            <div className="w-px self-stretch rounded" style={bone} />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-36 rounded" style={bone} />
              <div className="h-12 w-20 rounded" style={bone} />
              <div className="h-3 w-28 rounded" style={bone} />
            </div>
          </div>
          <div className="ml-auto h-[172px] w-[172px] rounded-full" style={bone} />
        </div>
        {/* status card skeletons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[62px] rounded-xl" style={{ background: "rgba(255,255,255,0.20)" }} />
          ))}
        </div>
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
  // ── Conversion formula (UNCHANGED) ─────────────────────────────────────────
  const closedProcesses    = lsc["other-reasons"];
  const eligibleProcesses  = total - closedProcesses;
  const processConversionPct: number | null =
    eligibleProcesses > 0 ? (lsc.converted / eligibleProcesses) * 100 : null;

  const fmtPct = (v: number | null) =>
    v === null ? "—" : `${v.toFixed(1)}%`;

  // ── Donut data (UNCHANGED) ──────────────────────────────────────────────────
  const donutData = useMemo(
    () =>
      STATUS_CONFIG.map(({ status, label }) => ({
        status,
        name: label,
        value: lsc[status as keyof LmpStatusCounts] ?? 0,
      })).filter((s) => s.value > 0),
    [lsc],
  );

  // Reconciliation check (dev-only, unchanged)
  const donutSum = donutData.reduce((s, x) => s + x.value, 0);
  if (process.env.NODE_ENV !== "production" && donutSum !== total && total > 0) {
    console.warn(
      `[LmpHealthSummaryCard] Donut total (${donutSum}) ≠ Total LMPs (${total}). ` +
      "Some records may have unmapped status values.",
    );
  }

  if (isLoading) return <LmpHealthSkeleton />;

  if (isError) {
    return (
      <div
        className="lx-grad-mu rounded-2xl border px-6 py-10 text-center"
        style={{ borderColor: "rgba(26,25,22,0.12)" }}
      >
        <p className="text-[14px] font-semibold" style={{ color: TXT }}>
          Failed to load LMP health summary.
        </p>
        <p className="text-[12.5px] mt-1" style={{ color: MUTED }}>
          Refresh the page to retry.
        </p>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      className="lx-grad-mu rounded-2xl border overflow-hidden relative"
      style={{
        borderColor: "rgba(26,25,22,0.12)",
        boxShadow: "0 1px 4px rgba(26,25,22,0.10)",
      }}
    >
      {/* Radial sheen — top-right highlight (hidden in dark mode via lx-hero-sheen) */}
      <div
        className="absolute inset-0 pointer-events-none lx-hero-sheen"
        style={{
          background:
            "radial-gradient(110% 70% at 100% 0%, rgba(255,255,255,0.45), transparent 50%)",
        }}
        aria-hidden
      />

      <div className="relative px-5 pt-4 pb-5">

        {/* ── Header row ── */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div
              className="text-[10px] font-semibold uppercase tracking-[1.4px]"
              style={{ color: MUTED }}
            >
              LMP HEALTH SUMMARY
            </div>
            <h2
              className="mt-0.5 text-[22px] font-bold tracking-tight"
              style={{ color: TXT }}
            >
              Live pipeline health
            </h2>
            <p className="mt-0.5 text-[12px]" style={{ color: MUTED }}>
              Status distribution and process conversion for the selected view.
            </p>
          </div>

          {/* Live pill */}
          <span
            className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-semibold"
            style={{
              background: "rgba(255,255,255,0.72)",
              border: "1px solid rgba(255,255,255,0.85)",
              color: TXT,
              boxShadow: "0 1px 2px rgba(26,25,22,0.06)",
            }}
            aria-label="Data is live"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: LX_HEX.success }}
            />
            Live
          </span>
        </div>

        {/* ── Metrics + Donut row ── */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center gap-4 lg:gap-6 mb-4">

          {/* Left: metrics */}
          <div className="flex flex-wrap items-stretch gap-0">
            {/* Total LMPs */}
            <div className="pr-6">
              <div
                className="text-[10px] font-semibold uppercase tracking-[1.1px] inline-flex items-center gap-1"
                style={{ color: MUTED }}
              >
                Total LMPs
                <LxInfo
                  text="Distinct LMP processes in the current filtered scope."
                  size={12}
                />
              </div>
              <div
                className="mt-1.5 text-[54px] leading-none font-bold tabular-nums"
                style={{ color: TXT }}
                aria-label={`Total LMPs: ${total}`}
              >
                {total}
              </div>
            </div>

            {/* Vertical divider */}
            <div
              className="w-px mx-1 self-stretch"
              style={{ background: DIVIDE }}
              aria-hidden
            />

            {/* Process-wise Conversion */}
            <div className="pl-6">
              <div
                className="text-[10px] font-semibold uppercase tracking-[1.1px] inline-flex items-center gap-1"
                style={{ color: MUTED }}
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
                className="mt-1.5 text-[54px] leading-none font-bold tabular-nums"
                style={{ color: TXT }}
                aria-label={`Process-wise Conversion: ${fmtPct(processConversionPct)}`}
              >
                {fmtPct(processConversionPct)}
              </div>
              <div className="mt-1 text-[12px]" style={{ color: MUTED }}>
                {lsc.converted} converted · {eligibleProcesses} eligible
              </div>
            </div>
          </div>

          {/* Right: donut chart */}
          <div className="lg:ml-auto shrink-0">
            {total === 0 ? (
              <div
                className="relative flex items-center justify-center rounded-full"
                style={{
                  width: 172,
                  height: 172,
                  background: "rgba(255,255,255,0.22)",
                  border: "1px solid rgba(255,255,255,0.60)",
                }}
                role="img"
                aria-label="No LMPs in current filter scope"
              >
                <span className="text-[13px] font-medium" style={{ color: MUTED }}>
                  No LMPs
                </span>
              </div>
            ) : (
              <div
                className="relative"
                style={{ width: 172, height: 172 }}
                role="img"
                aria-label={`LMP status distribution: ${STATUS_CONFIG
                  .map((s) => `${s.label} ${lsc[s.status as keyof LmpStatusCounts]}`)
                  .join(", ")}`}
                title="Distribution of LMPs by current status"
              >
                <PieChart width={172} height={172}>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={82}
                    paddingAngle={donutData.length > 1 ? 1.5 : 0}
                    strokeWidth={2.5}
                    stroke="rgba(255,255,255,0.85)"
                    startAngle={90}
                    endAngle={-270}
                    isAnimationActive={false}
                  >
                    {donutData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_HEX[entry.status] ?? LX_HEX.neutral}
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<DonutTooltip />} />
                </PieChart>

                {/* Center label */}
                <div
                  className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
                  style={{ top: "17%", bottom: "17%", left: "17%", right: "17%" }}
                  aria-hidden
                >
                  <div
                    className="w-full h-full rounded-full flex flex-col items-center justify-center"
                    style={{
                      background: "rgba(255,255,255,0.90)",
                      boxShadow: "0 0 0 1.5px rgba(26,25,22,0.06)",
                    }}
                  >
                    <div
                      className="text-[28px] font-bold leading-none tabular-nums"
                      style={{ color: "var(--lx-text)" }}
                    >
                      {total}
                    </div>
                    <div
                      className="text-[9px] font-bold uppercase tracking-[1px] mt-1"
                      style={{ color: "rgba(26,25,22,0.50)" }}
                    >
                      LMPS
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Status cards ── */}
        {total === 0 ? (
          <div
            className="rounded-xl px-4 py-5 text-center text-[12.5px]"
            style={{
              background: "rgba(255,255,255,0.22)",
              border: "1px solid rgba(255,255,255,0.55)",
              color: MUTED,
            }}
          >
            No LMPs are available for the selected filters.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {STATUS_CONFIG.map(({ status, label }) => {
              const value = lsc[status as keyof LmpStatusCounts] ?? 0;
              const pct   = total > 0 ? (value / total) * 100 : 0;
              const color = STATUS_HEX[status];
              const clickable = !!onStatusClick;
              return (
                <div
                  key={status}
                  className="rounded-xl flex flex-col gap-1.5 transition-all select-none"
                  style={{
                    background: "rgba(255,255,255,0.22)",
                    border: "1px solid rgba(255,255,255,0.60)",
                    borderLeft: `3px solid ${color}`,
                    padding: "8px 10px 9px",
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
                  {/* Label row */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <div
                      className="text-[9px] font-bold uppercase tracking-[0.55px] truncate leading-none"
                      style={{ color: MUTED }}
                    >
                      {label}
                    </div>
                  </div>

                  {/* Count + Percentage row */}
                  <div className="flex items-baseline justify-between gap-1">
                    <div
                      className="text-[22px] font-bold leading-none tabular-nums"
                      style={{ color: TXT }}
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
