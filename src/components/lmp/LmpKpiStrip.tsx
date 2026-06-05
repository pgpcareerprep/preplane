import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { STATUSES, STATUS_META } from "@/lib/lmpTypes";
import { CountUp } from "@/components/dashboard/CountUp";
import { Skeleton } from "@/components/ui/skeleton";
import type { LmpRecord, LmpStatus } from "@/lib/lmpTypes";

/** Stage colour map (background, text) for the funnel pills — Lumina tokens. */
const FUNNEL_COLORS: Record<LmpStatus, { bg: string; fg: string; ring: string }> = {
  // Active (sheet) statuses
  "not-started":   { bg: "hsl(var(--n100))",      fg: "hsl(var(--n500))",       ring: "hsl(var(--n300))" },
  "prep-ongoing":  { bg: "hsl(var(--sage-50))",   fg: "hsl(var(--sage-600))",   ring: "hsl(var(--sage-400))" },
  "prep-done":     { bg: "hsl(var(--sky-50))",    fg: "hsl(var(--sky-600))",    ring: "hsl(var(--sky-400))" },
  hold:            { bg: "hsl(var(--coral-50))",  fg: "hsl(var(--coral-600))",  ring: "hsl(var(--coral-400))" },
  converted:       { bg: "hsl(var(--sage-50))",   fg: "hsl(var(--sage-600))",   ring: "hsl(var(--sage-600))" },
  "not-converted": { bg: "hsl(var(--n100))",      fg: "hsl(var(--n600))",       ring: "hsl(var(--n400))" },
  "other-reasons": { bg: "hsl(var(--n100))",      fg: "hsl(var(--n600))",       ring: "hsl(var(--n400))" },
  // Legacy
  ongoing:         { bg: "hsl(var(--sage-50))",   fg: "hsl(var(--sage-600))",   ring: "hsl(var(--sage-400))" },
  dormant:         { bg: "hsl(var(--n100))",      fg: "hsl(var(--n600))",       ring: "hsl(var(--n400))" },
  closed:          { bg: "hsl(var(--n200))",      fg: "hsl(var(--n700))",       ring: "hsl(var(--n500))" },
  "converted-na":  { bg: "hsl(var(--n100))",      fg: "hsl(var(--n600))",       ring: "hsl(var(--n400))" },
  "offer-received":{ bg: "hsl(var(--plum-100))",  fg: "hsl(var(--plum-400))",   ring: "hsl(var(--plum-400))" },
};

export function LmpKpiStrip({
  records = [],
  isLoading = false,
  totalRecords,
  target,
  onOverdueClick,
  overdueActive = false,
}: {
  records?: LmpRecord[];
  isLoading?: boolean;
  totalRecords?: number;
  target?: string;
  onOverdueClick?: () => void;
  overdueActive?: boolean;
}) {

  const isScopedToPoc =
    target !== undefined &&
    target !== "me" &&
    target !== "all" &&
    typeof totalRecords === "number" &&
    totalRecords > records.length;
  const total = records.length;
  const today = new Date(new Date().toDateString());
  const overdueCount = records.filter((r) => {
    if (!r.nextExpectedProgress) return false;
    const d = new Date(r.nextExpectedProgress);
    return !isNaN(d.getTime()) && d < today;
  }).length;
  const counts = STATUSES.map((s) => ({
    status: s,
    count: records.filter((r) => r.status === s).length,
  }));

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const funnelRows = [...counts].sort((a, b) => b.count - a.count);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 auto-rows-min">
        <div className="rounded-xl p-3.5 lg:col-span-3 h-[108px] flex flex-col justify-center" style={{ background: "var(--grad-mu)" }}>
          <Skeleton className="h-2.5 w-20 bg-card/30" />
          <Skeleton className="mt-2 h-7 w-20 bg-card/30" />
        </div>
        <div className="rounded-xl bg-card border border-n200 shadow-sm p-3.5 lg:col-span-7 h-[108px] flex flex-col">
          <Skeleton className="h-2.5 w-24" />
          <Skeleton className="mt-2 h-2 w-full rounded-full" />
          <div className="mt-3 flex gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-2.5 w-16" />
            ))}
          </div>
        </div>
        <div className="rounded-xl bg-card border border-n200 shadow-sm p-3.5 lg:col-span-2 h-[108px]">
          <Skeleton className="h-2.5 w-12" />
          <Skeleton className="mt-2 h-7 w-10" />
        </div>
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 auto-rows-min">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="relative overflow-hidden rounded-xl p-3.5 lg:col-span-3 h-[108px] shadow-sm flex flex-col justify-center"
          style={{ background: "var(--grad-mu)" }}
        >
          <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-n900/70">Total LMPs</div>
          <span className="mt-1 block text-[28px] leading-none font-bold text-n900 tabular-nums">0</span>
          <p className="mt-1 text-[10.5px] text-n900/65 leading-snug">No data available</p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.08 }}
          className="rounded-xl bg-card border border-n200 shadow-sm p-3.5 lg:col-span-9 h-[108px] flex items-center justify-center"
        >
          <p className="text-[12px] text-n400 italic">No status data to display</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 auto-rows-min">
      {/* ─── Total LMPs hero ─── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="relative overflow-hidden rounded-xl p-3.5 lg:col-span-3 h-[108px] shadow-sm flex flex-col justify-center"
        style={{ background: "var(--grad-mu)" }}
      >
        <div className="pointer-events-none absolute -top-8 -right-6 h-24 w-24 rounded-full bg-card/25 blur-2xl" />
        <div className="relative">
          <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-n900/70">
            {isScopedToPoc ? `${target}'s LMPs` : "Total LMPs"}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <CountUp to={total} className="text-[30px] leading-none font-bold text-n900 tabular-nums" />
            {isScopedToPoc && (
              <span className="text-[10.5px] text-n900/65 tabular-nums">/ {totalRecords}</span>
            )}
          </div>
          <p className="mt-1 text-[10.5px] text-n900/65 leading-snug truncate">
            {isScopedToPoc ? "across all POCs" : "All LMP records in filter"}
          </p>
        </div>
      </motion.div>

      {/* ─── LMP Status Funnel ─── */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.08 }}
        className="rounded-xl bg-card border border-n200 shadow-sm px-4 py-3 lg:col-span-7 h-[108px] flex flex-col justify-between"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
            <h3 className="text-[12.5px] font-semibold text-n900">LMP Status Funnel</h3>
          </div>
          <span className="text-[10.5px] text-n500 tabular-nums">
            {total} total{isScopedToPoc ? <span className="text-n400"> · of {totalRecords}</span> : null}
          </span>
        </div>

        {/* Segmented horizontal bar */}
        <div className="flex w-full h-2 rounded-full overflow-hidden bg-n100">
          {funnelRows.filter((r) => r.count > 0).map((row, idx) => {
            const widthPct = (row.count / total) * 100;
            const colors = FUNNEL_COLORS[row.status];
            return (
              <motion.div
                key={row.status}
                initial={{ width: 0 }}
                animate={{ width: `${widthPct}%` }}
                transition={{ duration: 0.4, delay: 0.1 + idx * 0.04, ease: "easeOut" }}
                style={{ background: colors.ring }}
                title={`${STATUS_META[row.status].label}: ${row.count} (${pct(row.count)}%)`}
              />
            );
          })}
        </div>

        {/* Inline single-line legend */}
        <div className="flex items-center gap-x-3 flex-nowrap overflow-x-auto whitespace-nowrap [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {funnelRows.map((row) => {
            const colors = FUNNEL_COLORS[row.status];
            const label = STATUS_META[row.status].label;
            return (
              <div key={row.status} className="inline-flex items-center gap-1 shrink-0">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.ring }} />
                <span className="text-[10.5px] text-n600">{label}</span>
                <span className="text-[10.5px] tabular-nums font-semibold text-n900">{row.count}</span>
                <span className="text-[10px] tabular-nums text-n400">·{pct(row.count)}%</span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* ─── Overdue KPI ─── */}
      <motion.button
        type="button"
        onClick={() => overdueCount > 0 && onOverdueClick?.()}
        disabled={overdueCount === 0}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.16 }}
        className={`text-left rounded-xl border shadow-sm px-3.5 py-3 lg:col-span-2 h-[108px] flex flex-col justify-center transition-all ${
          overdueCount > 0
            ? `bg-red-50 border-red-200 cursor-pointer hover:shadow-md hover:-translate-y-0.5 ${overdueActive ? "ring-2 ring-red-400" : ""}`
            : "bg-card border-n200 cursor-default"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <AlertTriangle className={`h-3 w-3 ${overdueCount > 0 ? "text-red-500" : "text-n300"}`} />
          <div className="text-[10px] font-semibold uppercase tracking-[0.6px] text-n500">Overdue</div>
        </div>
        <CountUp
          to={overdueCount}
          className={`mt-0.5 block text-[28px] leading-none font-bold tabular-nums ${
            overdueCount > 0 ? "text-red-600" : "text-n400"
          }`}
        />
        <p className="mt-1 text-[10px] text-n500 leading-snug truncate">
          {overdueCount > 0 ? (overdueActive ? "Showing · click to clear" : "Click to view") : "Past next update"}
        </p>
      </motion.button>

    </div>
  );
}
