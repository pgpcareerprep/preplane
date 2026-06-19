/**
 * Compact Lumina status distribution card — UI only.
 * Consumes pre-aggregated lmpStatusCounts; no data logic here.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  STATUS_HEX,
  type ActiveLmpStatus,
  type LmpStatusCounts,
} from "@/components/dashboard/LmpHealthSummaryCard";

const STATUS_ROWS: Array<{ status: ActiveLmpStatus; label: string }> = [
  { status: "not-started",   label: "Not Started"    },
  { status: "prep-ongoing",  label: "Prep Ongoing"   },
  { status: "prep-done",     label: "Prep Done"      },
  { status: "hold",          label: "On Hold"          },
  { status: "converted",     label: "Converted"      },
  { status: "not-converted", label: "Not Converted"  },
  { status: "other-reasons", label: "Other Reasons"  },
];

export function LmpStatusDistributionCard({
  total,
  lsc,
  onStatusClick,
}: {
  total: number;
  lsc: LmpStatusCounts;
  onStatusClick?: (status: ActiveLmpStatus) => void;
}) {
  const safeTotal = total || 0;
  const hasData = safeTotal > 0;

  const segments = useMemo(
    () =>
      STATUS_ROWS.map(({ status, label }) => ({
        status,
        label,
        value: lsc[status] ?? 0,
        hex: STATUS_HEX[status] ?? "var(--lx-text-3)",
        pct: safeTotal > 0 ? ((lsc[status] ?? 0) / safeTotal) * 100 : 0,
      })),
    [lsc, safeTotal],
  );

  return (
    <div
      className="col-span-12 rounded-2xl border p-4"
      style={{
        background: "var(--lx-surface)",
        borderColor: "var(--lx-border)",
        borderWidth: 0.5,
        boxShadow: "0 1px 2px rgba(26,25,22,0.04)",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h3 className="text-[18px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: "var(--lx-text)" }}>
            LMP Status Distribution
          </h3>
          <p className="text-[12.5px] mt-0.5" style={{ color: "var(--lx-text-2)" }}>
            Live split of preparation and outcome stages
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[12px]" style={{ color: "var(--lx-text-2)" }}>Total LMPs</div>
          <div className="text-[24px] font-semibold tabular-nums leading-none mt-0.5" style={{ color: "var(--lx-text)" }}>
            {safeTotal}
          </div>
        </div>
      </div>

      {/* Segmented progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--lx-soft)" }}
        role="img"
        aria-label="LMP status distribution"
      >
        {hasData ? (
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
        ) : null}
      </div>

      {!hasData && (
        <p className="text-[11.5px] mt-1.5" style={{ color: "var(--lx-text-3)" }}>
          No active status data in selected view
        </p>
      )}

      {/* Status grid */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-gutter">
        {segments.map((s) => {
          const click = onStatusClick ? () => onStatusClick(s.status) : undefined;
          return (
            <div
              key={s.status}
              className={cn(
                "flex items-center justify-between gap-2 h-8 px-2.5 rounded-[10px] border",
                click && "cursor-pointer hover:opacity-90 transition-opacity",
              )}
              style={{
                background: "var(--lx-soft)",
                borderColor: "var(--lx-border)",
                borderWidth: 0.5,
              }}
              onClick={click}
              role={click ? "button" : undefined}
              tabIndex={click ? 0 : undefined}
              onKeyDown={(e) => {
                if (click && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  click();
                }
              }}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{ background: s.hex }}
                  aria-hidden
                />
                <span className="text-[12px] truncate" style={{ color: "var(--lx-text-2)" }}>
                  {s.label}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-[12px] flex items-center gap-2">
                <span className="font-semibold" style={{ color: "var(--lx-text)" }}>{s.value}</span>
                <span style={{ color: "var(--lx-text-3)" }}>{s.pct.toFixed(0)}%</span>
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <p
        className="text-[12px] mt-3 px-2.5 py-2 rounded-[10px]"
        style={{ color: "var(--lx-text-2)", background: "var(--lx-soft)" }}
      >
        Percentages are calculated based on total LMPs in the selected scope.
      </p>
    </div>
  );
}
