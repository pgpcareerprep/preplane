/**
 * LmpHealthSummaryCard — Lumina v1.2 (segmented bar layout)
 *
 * UI-ONLY redesign. Queries, filters, realtime subscriptions, and status
 * mappings are unchanged. Process-wise conversion uses terminal outcomes only.
 *
 * Closed definition (canonical, from lmpStatusCounts):
 *   lsc["other-reasons"] = records with status in
 *   { "other-reasons", "dormant", "closed", "converted-na" }
 */

import { useMemo } from "react";
import { LX_HEX } from "@/components/insights/primitives";
import { LxInfo } from "@/components/insights/LxInfo";
import type { LmpStatus } from "@/types/lmp";
import { computeProcessWiseConversion } from "@/lib/lmpProcessQueries";

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

export const STATUS_HEX: Record<string, string> = {
  "not-started":   LX_HEX.neutral,
  "prep-ongoing":  LX_HEX.info,
  "prep-done":     LX_HEX.yellow,
  hold:            LX_HEX.ai,
  converted:       LX_HEX.success,
  "not-converted": LX_HEX.risk,
  "other-reasons": LX_HEX.orange,
};

const STATUS_CONFIG: Array<{ status: ActiveLmpStatus; label: string }> = [
  { status: "not-started",   label: "Not Started"   },
  { status: "prep-ongoing",  label: "Prep Ongoing"  },
  { status: "prep-done",     label: "Prep Done"     },
  { status: "hold",          label: "On Hold"       },
  { status: "converted",     label: "Converted"     },
  { status: "not-converted", label: "Not Converted" },
  { status: "other-reasons", label: "Other Reasons" },
];

const TXT    = "var(--lx-hero-text,  #1A1916)";
const MUTED  = "var(--lx-hero-muted, rgba(26,25,22,0.66))";
const DIVIDE = "var(--lx-hero-divider, rgba(26,25,22,0.16))";

const CARD_SURFACE = {
  border: "0.5px solid var(--lx-border)",
  borderRadius: 16,
  boxShadow: "var(--shadow-sm)",
  background: "var(--lmp-health-card-bg)",
  minHeight: 260,
} as const;

const MINI_CARD = {
  background: "var(--lmp-health-mini-bg)",
  border: "0.5px solid var(--lmp-health-mini-border)",
  borderRadius: 10,
  padding: 12,
} as const;

function statusPct(value: number, total: number): number {
  if (total <= 0 || !Number.isFinite(value)) return 0;
  const pct = (value / total) * 100;
  return Number.isFinite(pct) ? pct : 0;
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function LmpHealthSkeleton() {
  const bone = { background: "rgba(26,25,22,0.13)" };
  return (
    <div
      className="lx-grad-yellow rounded-2xl overflow-hidden animate-pulse"
      style={CARD_SURFACE}
    >
      <div className="relative p-6">
        <div className="flex items-start justify-between mb-5">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-28 rounded" style={bone} />
            <div className="h-8 w-52 rounded" style={bone} />
            <div className="h-3.5 w-80 max-w-full rounded" style={bone} />
          </div>
          <div className="h-7 w-16 rounded-full" style={bone} />
        </div>
        <div className="flex flex-col lg:flex-row gap-6 mb-5">
          <div className="flex gap-8 items-stretch lg:w-[34%]">
            <div className="flex flex-col gap-2">
              <div className="h-3 w-20 rounded" style={bone} />
              <div className="h-10 w-14 rounded" style={bone} />
            </div>
            <div className="w-px self-stretch rounded" style={bone} />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-36 rounded" style={bone} />
              <div className="h-10 w-20 rounded" style={bone} />
              <div className="h-3 w-28 rounded" style={bone} />
            </div>
          </div>
          <div className="flex-1 flex flex-col gap-2">
            <div className="h-3 w-full rounded-full" style={bone} />
            <div className="flex gap-2">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-3 flex-1 rounded" style={bone} />
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-[72px] rounded-[10px]" style={{ ...MINI_CARD, background: "rgba(255,255,255,0.20)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Segmented status bar ──────────────────────────────────────────────────────

function SegmentedStatusBar({
  total,
  lsc,
}: {
  total: number;
  lsc: LmpStatusCounts;
}) {
  const segments = useMemo(
    () =>
      STATUS_CONFIG.map(({ status, label }) => {
        const value = lsc[status as keyof LmpStatusCounts] ?? 0;
        const pct = statusPct(value, total);
        return { status, label, value, pct, color: STATUS_HEX[status] };
      }),
    [lsc, total],
  );

  if (total === 0) {
    return (
      <div className="w-full">
        <div
          className="h-3 w-full rounded-full"
          style={{ background: "rgba(26,25,22,0.10)" }}
          role="img"
          aria-label="No LMP status distribution — empty scope"
        />
        <div className="mt-2 grid grid-cols-7 gap-1">
          {segments.map((s) => (
            <span
              key={s.status}
              className="text-center text-[13px] font-semibold tabular-nums"
              style={{ color: MUTED }}
            >
              0%
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div
        className="flex h-3 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`LMP status distribution: ${segments
          .map((s) => `${s.label} ${s.value}`)
          .join(", ")}`}
      >
        {segments.map((s) =>
          s.pct > 0 ? (
            <div
              key={s.status}
              style={{
                width: `${s.pct}%`,
                background: s.color,
                minWidth: s.pct > 0 ? 2 : 0,
              }}
              title={`${s.label}: ${s.value} (${s.pct.toFixed(0)}%)`}
            />
          ) : null,
        )}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {segments.map((s) => (
          <span
            key={s.status}
            className="text-center text-[13px] font-semibold tabular-nums leading-none"
            style={{ color: s.pct > 0 ? s.color : MUTED }}
          >
            {s.pct.toFixed(0)}%
          </span>
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
  // ── Conversion: Converted ÷ (Total LMPs − Other Reasons) ──
  const { closedProcesses, notConverted, eligibleProcesses, processConversionPct } =
    computeProcessWiseConversion(lsc);

  const fmtPct = (v: number | null) =>
    v === null ? "—" : `${v.toFixed(1)}%`;

  const statusSum = STATUS_CONFIG.reduce(
    (s, { status }) => s + (lsc[status as keyof LmpStatusCounts] ?? 0),
    0,
  );
  if (process.env.NODE_ENV !== "production" && statusSum !== total && total > 0) {
    console.warn(
      `[LmpHealthSummaryCard] Status total (${statusSum}) ≠ Total LMPs (${total}). ` +
      "Some records may have unmapped status values.",
    );
  }

  if (isLoading) return <LmpHealthSkeleton />;

  if (isError) {
    return (
      <div
        className="lx-grad-yellow rounded-2xl px-6 py-10 text-center"
        style={CARD_SURFACE}
      >
        <p className="text-[14px] font-semibold" style={{ color: TXT }}>
          Failed to load LMP health summary.
        </p>
        <p className="text-[13px] mt-1" style={{ color: MUTED }}>
          Refresh the page to retry.
        </p>
      </div>
    );
  }

  return (
    <div
      className="lx-grad-yellow rounded-2xl relative"
      style={CARD_SURFACE}
    >
      <div className="relative p-6 flex flex-col gap-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div
              className="text-[11px] font-semibold uppercase tracking-[0.08em]"
              style={{ color: LX_HEX.orange }}
            >
              LMP HEALTH SUMMARY
            </div>
            <h2
              className="mt-1 text-[30px] font-bold tracking-tight leading-tight"
              style={{ color: TXT }}
            >
              Live pipeline health
            </h2>
            <p className="mt-1 text-[13px]" style={{ color: MUTED }}>
              Status distribution and process conversion for the selected view.
            </p>
          </div>

          <span
            className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-full text-[12px] font-medium bg-card/90 border border-border"
            style={{
              color: TXT,
              boxShadow: "var(--shadow-sm)",
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

        {/* ── Metrics + segmented bar ── */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-6 lg:gap-8">
          {/* Left metrics (~32%) */}
          <div className="flex items-stretch shrink-0 lg:w-[34%]">
            <div className="pr-6">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.06em] inline-flex items-center gap-1"
                style={{ color: MUTED }}
              >
                Total LMPs
                <LxInfo
                  text="Distinct LMP processes in the current filtered scope."
                  size={12}
                  side="bottom"
                />
              </div>
              <div
                className="mt-1.5 text-[40px] leading-none font-bold tabular-nums"
                style={{ color: TXT }}
                aria-label={`Total LMPs: ${total}`}
              >
                {total}
              </div>
            </div>

            <div
              className="w-px self-stretch"
              style={{ background: DIVIDE }}
              aria-hidden
            />

            <div className="pl-6">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.06em] inline-flex items-center gap-1"
                style={{ color: MUTED }}
              >
                Process-wise Conversion
                <LxInfo
                  text="Converted ÷ (Converted + Not Converted + Closed) × 100. Excludes active pipeline and on-hold."
                  size={12}
                  side="bottom"
                />
              </div>
              <div
                className="mt-1.5 text-[40px] leading-none font-bold tabular-nums"
                style={{ color: TXT }}
                aria-label={`Process-wise Conversion: ${fmtPct(processConversionPct)}`}
              >
                {fmtPct(processConversionPct)}
              </div>
              <div className="mt-1 text-[13px]" style={{ color: MUTED }}>
                {lsc.converted} converted · {notConverted + closedProcesses} not converted + closed · {eligibleProcesses} eligible
              </div>
            </div>
          </div>

          {/* Right distribution (~66%) */}
          <div className="flex-1 min-w-0">
            <SegmentedStatusBar total={total} lsc={lsc} />
          </div>
        </div>

        {/* ── Status mini-cards ── */}
        {total === 0 ? (
          <div
            className="rounded-[10px] px-4 py-4 text-center text-[13px]"
            style={{
              ...MINI_CARD,
              color: MUTED,
            }}
          >
            No LMPs are available for the selected filters.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
            {STATUS_CONFIG.map(({ status, label }) => {
              const value = lsc[status as keyof LmpStatusCounts] ?? 0;
              const pct   = statusPct(value, total);
              const color = STATUS_HEX[status];
              const clickable = !!onStatusClick;
              return (
                <div
                  key={status}
                  className="flex flex-col gap-2 transition-all select-none"
                  style={{
                    ...MINI_CARD,
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
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <div
                      className="text-[12px] font-medium truncate leading-snug"
                      style={{ color: TXT }}
                    >
                      {label}
                    </div>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div
                      className="text-[22px] font-bold leading-none tabular-nums"
                      style={{ color: TXT }}
                    >
                      {value}
                    </div>
                    <div
                      className="text-[14px] font-semibold tabular-nums"
                      style={{ color: pct > 0 ? color : MUTED }}
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
