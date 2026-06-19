/**
 * Compact Lumina cohort summary card — presentation only.
 * Parent supplies pre-aggregated cohort counts and handlers.
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { LX_HEX } from "@/components/insights/primitives";

export type CohortBucket = "single" | "multiple" | "no-active" | "opted-out";

const SEGMENTS: Array<{
  bucket: CohortBucket;
  label: string;
  hex: string;
  valueKey: "single" | "multiple" | "inactive" | "optedOut";
}> = [
  { bucket: "single",    label: "In 1 Active Process",    hex: LX_HEX.success, valueKey: "single"   },
  { bucket: "multiple",  label: "In 2+ Active Processes", hex: LX_HEX.info,    valueKey: "multiple" },
  { bucket: "no-active", label: "No Active Process",      hex: LX_HEX.risk,    valueKey: "inactive" },
  { bucket: "opted-out", label: "Opted Out",              hex: LX_HEX.orange,  valueKey: "optedOut" },
];

export type CohortSummaryCardProps = {
  cohort: string;
  total: number;
  eligible: number;
  active: number;
  converted: number;
  cohortConverted: number;
  convPct: number | null;
  single: number;
  multiple: number;
  inactive: number;
  optedOut: number;
  onSegmentClick?: (bucket: CohortBucket) => void;
  onExport?: () => void;
};

export function CohortSummaryCard({
  cohort,
  total,
  eligible,
  active,
  converted,
  cohortConverted,
  convPct,
  single,
  multiple,
  inactive,
  optedOut,
  onSegmentClick,
  onExport,
}: CohortSummaryCardProps) {
  const counts = { single, multiple, inactive, optedOut };
  const safeTotal = total || 0;
  const hasData = safeTotal > 0;

  const segments = useMemo(
    () =>
      SEGMENTS.map((s) => ({
        ...s,
        value: counts[s.valueKey],
        pct: safeTotal > 0 ? (counts[s.valueKey] / safeTotal) * 100 : 0,
      })),
    [single, multiple, inactive, optedOut, safeTotal],
  );

  return (
    <div
      className="col-span-12 md:col-span-6 rounded-2xl border"
      style={{
        background: "var(--lx-surface)",
        borderColor: "var(--lx-border)",
        borderWidth: 0.5,
        boxShadow: "0 1px 2px rgba(26,25,22,0.04)",
        padding: "14px 16px",
      }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div
            className="text-[10px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: "var(--lx-text-3)" }}
          >
            Cohort
          </div>
          <h3
            className="text-[18px] font-semibold leading-tight tracking-[-0.01em] truncate"
            style={{ color: "var(--lx-text)" }}
          >
            {cohort}
          </h3>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {convPct !== null && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border whitespace-nowrap"
              style={{
                background: `${LX_HEX.success}18`,
                color: LX_HEX.success,
                borderColor: `${LX_HEX.success}40`,
              }}
            >
              {cohortConverted}/{eligible} conv · {convPct.toFixed(0)}%
            </span>
          )}
          {onExport && (
            <button
              type="button"
              onClick={onExport}
              title="Export CSV"
              className="inline-flex items-center justify-center h-6 w-6 rounded-md border hover:bg-[var(--lx-soft)] transition-colors"
              style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-3)" }}
            >
              <Download size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Metadata */}
      <p className="text-[12px] mb-2.5 truncate" style={{ color: "var(--lx-text-2)" }}>
        {total} total · {eligible} eligible · {active} active · {converted} converted
      </p>

      {/* Progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full mb-2.5"
        style={{ background: "var(--lx-soft)" }}
        role="img"
        aria-label={`${cohort} student distribution`}
      >
        {hasData && (
          <div className="flex h-full w-full">
            {segments.map((s) => {
              if (s.pct <= 0) return null;
              const click = onSegmentClick ? () => onSegmentClick(s.bucket) : undefined;
              return (
                <motion.div
                  key={s.bucket}
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
        )}
      </div>

      {/* Metrics grid — 2 columns desktop, 1 on narrow */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {segments.map((s) => {
          const click = onSegmentClick ? () => onSegmentClick(s.bucket) : undefined;
          return (
            <div
              key={s.bucket}
              className={cn(
                "flex items-center justify-between gap-2 h-8 px-2.5 rounded-[10px] border min-w-0",
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
                <span className="text-[11.5px] truncate" style={{ color: "var(--lx-text-2)" }}>
                  {s.label}
                </span>
              </span>
              <span className="shrink-0 font-mono tabular-nums text-[11.5px] flex items-center gap-2">
                <span className="font-semibold" style={{ color: "var(--lx-text)" }}>{s.value}</span>
                <span style={{ color: "var(--lx-text-3)" }}>{s.pct.toFixed(0)}%</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
