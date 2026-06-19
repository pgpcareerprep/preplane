import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { LxInfo } from "./LxInfo";

/* ─────────────────────────────────────────────────────────────
   Lumina primitives — scoped to the .lumina design wrapper.
   Use ONLY inside <LuminaShell>.  Tokens live in index.css under .lumina.
   ───────────────────────────────────────────────────────────── */

export type LxAccent = "orange" | "yellow" | "success" | "risk" | "info" | "ai" | "teal" | "neutral";

export const LX_HEX: Record<LxAccent, string> = {
  orange:  "#E38330",
  yellow:  "#F7D344",
  success: "#6A9E62",
  risk:    "#F07040",
  info:    "#4A8EE8",
  ai:      "#8B5CF6",
  teal:    "#39B6D8",
  neutral: "#7A756C",
};

const SOFT_BG: Record<LxAccent, string> = {
  orange:  "rgba(227,131,48,0.10)",
  yellow:  "rgba(247,211,68,0.18)",
  success: "rgba(106,158,98,0.12)",
  risk:    "rgba(240,112,64,0.12)",
  info:    "rgba(74,142,232,0.12)",
  ai:      "rgba(109,40,217,0.14)",
  teal:    "rgba(57,182,216,0.12)",
  neutral: "rgba(122,117,108,0.10)",
};

/* ─────────────── Shell ─────────────── */
export function LuminaShell({ children }: { children: ReactNode }) {
  return (
    <div className="w-full flex flex-col gap-6">
      {children}
    </div>
  );
}

/* ─────────────── Page Header ─────────────── */
export function LxPageHeader({
  crumb, title, subtitle, right,
}: { crumb: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <div className="h-[3px] w-full rounded-full lx-grad-main opacity-90" aria-hidden />
      <div className="flex items-end justify-between gap-4 mt-2">
        <div className="min-w-0">
          <div className="lx-eyebrow">{crumb}</div>
          <h1 className="text-[28px] font-semibold tracking-tight mt-1" style={{ color: "var(--lx-text)" }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] mt-1" style={{ color: "var(--lx-text-2)" }}>{subtitle}</p>
          )}
        </div>
        {right}
      </div>
    </header>
  );
}

export function LxLivePill() {
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium"
      style={{ background: "var(--lx-surface)", border: "1px solid var(--lx-border)", color: "var(--lx-text-2)" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lx-success)" }} />
      Live
    </span>
  );
}

/* ─────────────── Bento Grid (12-col) ─────────────── */
export function LxGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-12 gap-4", className)}>{children}</div>
  );
}

/* ─────────────── Card ─────────────── */
export function LxCard({
  children, className, span = 12, padded = true, soft = false, style, delay = 0,
}: {
  children: ReactNode; className?: string;
  span?: 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12;
  padded?: boolean; soft?: boolean; style?: CSSProperties; delay?: number;
}) {
  const reduce = useReducedMotion();
  const SPAN_MAP: Record<2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 12, string> = {
    2:  "col-span-6 sm:col-span-4 md:col-span-2",
    3:  "col-span-6 sm:col-span-4 md:col-span-3",
    4:  "col-span-12 sm:col-span-6 md:col-span-4",
    5:  "col-span-12 md:col-span-5",
    6:  "col-span-12 md:col-span-6",
    7:  "col-span-12 md:col-span-7",
    8:  "col-span-12 md:col-span-8",
    9:  "col-span-12 md:col-span-9",
    12: "col-span-12",
  };
  const spanCls = SPAN_MAP[span];
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, delay, ease: [0, 0, 0.2, 1] }}
      className={cn(soft ? "lx-card-soft" : "lx-card", spanCls, padded && "p-5", className)}
      style={style}
    >
      {children}
    </motion.div>
  );
}

export function LxCardHeader({ eyebrow, title, hint, right, info }:{
  eyebrow?: string; title: string; hint?: string; right?: ReactNode; info?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 mb-4">
      <div className="min-w-0">
        {eyebrow && <div className="lx-eyebrow">{eyebrow}</div>}
        <h3 className="text-[15px] font-semibold mt-1 inline-flex items-center gap-1.5" style={{ color: "var(--lx-text)" }}>
          <span>{title}</span>
          {info && <LxInfo text={info} />}
        </h3>
        {hint && <p className="text-[12px] mt-0.5" style={{ color: "var(--lx-text-3)" }}>{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function LxSection({ eyebrow, title, hint, info }: { eyebrow: string; title: string; hint?: string; info?: string }) {
  return (
    <div className="flex flex-col gap-0.5 mt-2">
      <div className="lx-eyebrow">{eyebrow}</div>
      <h2 className="text-[19px] font-semibold tracking-tight inline-flex items-center gap-1.5" style={{ color: "var(--lx-text)" }}>
        <span>{title}</span>
        {info && <LxInfo text={info} />}
      </h2>
      {hint && <p className="text-[12.5px]" style={{ color: "var(--lx-text-3)" }}>{hint}</p>}
    </div>
  );
}

/* ─────────────── Hero KPI (large gradient) ─────────────── */
export function LxHero({
  eyebrow, title, primaryValue, primaryLabel, statement, ringPct, span = 7,
  variant = "mu", footer, rightSlot, stats, info, onPrimaryClick,
}: {
  eyebrow: string; title: string;
  primaryValue: string; primaryLabel: string;
  statement?: string;
  ringPct?: number; // 0..100
  span?: 6 | 7 | 8 | 12;
  variant?: "mu" | "green" | "blue" | "yellow";
  footer?: ReactNode;
  rightSlot?: ReactNode;
  /** Section-level info tooltip shown next to the title. */
  info?: string;
  /** Click handler for the big primary number (when not using `stats`). */
  onPrimaryClick?: () => void;
  /** Optional multi-stat row. When provided, replaces the single big number with a clean stat trio. */
  stats?: { label: string; value: string; sub?: string; accent?: LxAccent; info?: string; onClick?: () => void }[];
}) {
  const gradClass =
    variant === "green"  ? "lx-grad-green"  :
    variant === "blue"   ? "lx-grad-blue"   :
    variant === "yellow" ? "lx-grad-yellow" : "lx-grad-mu";
  const text = "var(--lx-hero-text, #1A1916)";
  const muted = "var(--lx-hero-muted, rgba(26,25,22,0.66))";
  const divider = "var(--lx-hero-divider, rgba(26,25,22,0.14))";

  return (
    <LxCard span={span} padded={false} className="overflow-hidden h-full">
      <div className={cn("relative p-6 h-full", gradClass)}>
        {/* watermark sheen — hidden in dark mode for a matte look */}
        <div className="absolute inset-0 pointer-events-none lx-hero-sheen"
          style={{ background: "radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.45), transparent 55%)" }} />

        <div className="relative flex flex-col md:flex-row items-start md:justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[1.2px]" style={{ color: muted }}>{eyebrow}</div>
            <h2 className="text-[17px] font-semibold mt-1 inline-flex items-center gap-1.5" style={{ color: text }}>
              <span>{title}</span>
              {info && <LxInfo text={info} />}
            </h2>

            {stats && stats.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-stretch gap-x-8 gap-y-4">
                {stats.map((s, i) => {
                  const clickable = !!s.onClick;
                  return (
                    <div
                      key={s.label}
                      className={cn("min-w-0 group", clickable && "cursor-pointer")}
                      onClick={clickable ? s.onClick : undefined}
                      role={clickable ? "button" : undefined}
                      tabIndex={clickable ? 0 : undefined}
                      onKeyDown={(e) => {
                        if (clickable && (e.key === "Enter" || e.key === " ")) {
                          e.preventDefault(); s.onClick?.();
                        }
                      }}
                      style={{
                        paddingLeft: i === 0 ? 0 : 24,
                        borderLeft: i === 0 ? "none" : `1px solid ${divider}`,
                      }}
                    >
                      <div className="text-[10.5px] font-semibold uppercase tracking-[1.1px] inline-flex items-center gap-1" style={{ color: muted }}>
                        <span>{s.label}</span>
                        {s.info && <LxInfo text={s.info} size={12} />}
                      </div>
                      <div
                        className={cn("mt-1 text-[34px] sm:text-[40px] leading-none font-semibold tracking-tight tabular-nums",
                          clickable && "underline-offset-4 group-hover:underline")}
                        style={{ color: s.accent ? LX_HEX[s.accent] : text }}
                      >
                        {s.value}
                      </div>
                      {s.sub && (
                        <div className="mt-1.5 text-[11.5px] font-medium" style={{ color: muted }}>{s.sub}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className="mt-5 flex items-baseline gap-3 flex-wrap">
                  <div
                    className={cn("text-[48px] sm:text-[56px] leading-none font-semibold tracking-tight",
                      onPrimaryClick && "cursor-pointer hover:underline underline-offset-4")}
                    style={{ color: text }}
                    onClick={onPrimaryClick}
                    role={onPrimaryClick ? "button" : undefined}
                    tabIndex={onPrimaryClick ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (onPrimaryClick && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault(); onPrimaryClick();
                      }
                    }}
                  >
                    {primaryValue}
                  </div>
                  <div className="text-[12.5px] font-medium" style={{ color: muted }}>{primaryLabel}</div>
                </div>
                {statement && (
                  <div className="mt-2 text-[13px]" style={{ color: text }}>{statement}</div>
                )}
              </>
            )}
          </div>
          <div className="shrink-0 self-center md:self-start">
            {rightSlot ?? (typeof ringPct === "number" ? <LxRing pct={ringPct} /> : null)}
          </div>
        </div>
        {footer && <div className="relative mt-5">{footer}</div>}
      </div>
    </LxCard>
  );
}


function LxRing({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  const r = 38, c = 2 * Math.PI * r;
  const dash = (safe / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: 96, height: 96 }} aria-hidden>
      <svg viewBox="0 0 100 100" width="96" height="96">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(26,25,22,0.15)" strokeWidth="9" />
        <motion.circle
          cx="50" cy="50" r={r} fill="none" stroke="#1A1916" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform="rotate(-90 50 50)"
          initial={{ strokeDasharray: `0 ${c}` }}
          animate={{ strokeDasharray: `${dash} ${c}` }}
          transition={{ duration: 0.8, ease: [0, 0, 0.2, 1] }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-[14px] font-semibold" style={{ color: "#1A1916" }}>
        {safe.toFixed(0)}%
      </div>
    </div>
  );
}

/* ─────────────── Compact KPI ─────────────── */
export function LxKpi({
  label, value, sub, accent = "neutral", span = 3, delay = 0, info, onClick, className: outerClassName,
  compact = false,
}: {
  label: string; value: ReactNode; sub?: string;
  accent?: LxAccent; span?: 2 | 3 | 4 | 6; delay?: number;
  info?: string;
  onClick?: () => void;
  /** Extra classes applied to the card root — use for grid-span overrides (e.g. "!col-span-1"). */
  className?: string;
  /** Denser layout for multi-column KPI rows. */
  compact?: boolean;
}) {
  const dotColor = LX_HEX[accent];
  const clickable = !!onClick;
  return (
    <LxCard
      span={span}
      delay={delay}
      padded={!compact}
      className={cn(
        "flex flex-col relative overflow-hidden group",
        compact ? "gap-1.5 p-3 !col-span-1" : "gap-3",
        clickable && "cursor-pointer transition-shadow hover:shadow-md focus-within:shadow-md",
        outerClassName,
      )}
    >
      <span
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ background: dotColor }}
        aria-hidden
      />
      <div
        className={cn("flex items-center justify-between", clickable && "outline-none")}
        onClick={onClick}
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onKeyDown={(e) => {
          if (clickable && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault(); onClick();
          }
        }}
      >
        <div className={cn(
          "text-[11px] font-medium uppercase tracking-[0.7px] truncate inline-flex items-center gap-1.5",
          compact && "text-[10px] tracking-[0.5px]",
        )} style={{ color: "var(--lx-text-3)" }}>
          <span className="truncate">{label}</span>
          {info && <LxInfo text={info} size={compact ? 11 : 12} />}
        </div>
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: dotColor }} />
      </div>
      <div
        onClick={onClick}
        className={cn(
          "leading-none font-semibold tracking-tight tabular-nums",
          compact ? "text-[22px]" : "text-[28px]",
          clickable && "group-hover:underline underline-offset-4",
        )}
        style={{ color: "var(--lx-text)" }}
      >
        {value}
      </div>
      {sub && (
        <div className={cn("truncate", compact ? "text-[10.5px]" : "text-[11.5px]")} style={{ color: "var(--lx-text-3)" }}>
          {sub}
        </div>
      )}
    </LxCard>
  );
}


/* ─────────────── Stacked status bar ─────────────── */
export function LxStackedBar({
  segments, total, onSegmentClick,
}: {
  segments: { label: string; value: number; accent: LxAccent; info?: string; onClick?: () => void }[];
  total?: number;
  onSegmentClick?: (segment: { label: string; value: number; accent: LxAccent }) => void;
}) {
  const sum = total ?? segments.reduce((s, x) => s + x.value, 0);
  const safe = sum || 1;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--lx-soft)" }}>
        {segments.map((s) => {
          const pct = (s.value / safe) * 100;
          if (pct <= 0) return null;
          const click = s.onClick ?? (onSegmentClick ? () => onSegmentClick(s) : undefined);
          return (
            <motion.div
              key={s.label}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
              style={{ background: LX_HEX[s.accent], cursor: click ? "pointer" : undefined }}
              title={`${s.label}: ${s.value}`}
              onClick={click}
              role={click ? "button" : undefined}
            />
          );
        })}
      </div>
      <ul className="mt-4 grid grid-cols-4 gap-x-3 gap-y-2 text-[12px]">
        {segments.map((s) => {
          const pct = (s.value / safe) * 100;
          const click = s.onClick ?? (onSegmentClick ? () => onSegmentClick(s) : undefined);
          return (
            <li
              key={s.label}
              className={cn(
                "flex items-start gap-2 min-w-0 rounded-md -mx-1 px-1 py-0.5",
                click && "cursor-pointer hover:bg-[var(--lx-soft)] transition-colors",
              )}
              onClick={click}
              role={click ? "button" : undefined}
              tabIndex={click ? 0 : undefined}
              onKeyDown={(e) => {
                if (click && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); click(); }
              }}
            >
              <span className="h-2 w-2 rounded-sm shrink-0 mt-1" style={{ background: LX_HEX[s.accent] }} />
              <span className="flex-1 min-w-0 truncate inline-flex items-center gap-1" style={{ color: "var(--lx-text-2)" }}>
                <span className="truncate">{s.label}</span>
                {s.info && <LxInfo text={s.info} size={11} />}
              </span>
              <span className="ml-auto shrink-0 text-right font-mono tabular-nums leading-tight">
                <span className="block text-[12px] font-semibold" style={{ color: "var(--lx-text)" }}>
                  {pct.toFixed(0)}%
                </span>
                <span className="block text-[11px]" style={{ color: "var(--lx-text-3)" }}>
                  {s.value}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────── Donut ─────────────── */
export function LxDonut({
  segments, label,
}: {
  segments: { label: string; value: number; accent: LxAccent }[];
  label?: string;
}) {
  const sum = segments.reduce((s, x) => s + x.value, 0);
  const safe = sum || 1;
  let cursor = 0;
  const stops = segments.map((s) => {
    const pct = (s.value / safe) * 100;
    const start = cursor; cursor += pct;
    return `${LX_HEX[s.accent]} ${start}% ${cursor}%`;
  });
  return (
    <div className="flex flex-col md:flex-row items-center gap-6">
      <div className="relative h-[148px] w-[148px] shrink-0">
        <div className="h-full w-full rounded-full"
          style={{ background: stops.length ? `conic-gradient(${stops.join(", ")})` : "var(--lx-soft)" }}
          aria-hidden />
        <div className="absolute inset-[18px] rounded-full grid place-items-center text-center"
          style={{ background: "var(--lx-surface)", border: "1px solid var(--lx-border)" }}>
          <div>
            <div className="text-[22px] font-semibold leading-none" style={{ color: "var(--lx-text)" }}>{sum}</div>
            {label && <div className="lx-eyebrow mt-1.5">{label}</div>}
          </div>
        </div>
      </div>
      <ul className="flex-1 w-full space-y-2.5">
        {segments.map((s) => {
          const pct = (s.value / safe) * 100;
          return (
            <li key={s.label} className="flex items-center gap-3 text-[12.5px]">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: LX_HEX[s.accent] }} />
              <span className="flex-1 truncate" style={{ color: "var(--lx-text-2)" }}>{s.label}</span>
              <span className="font-mono tabular-nums" style={{ color: "var(--lx-text-3)" }}>{s.value}</span>
              <span className="font-mono tabular-nums w-10 text-right font-semibold" style={{ color: LX_HEX[s.accent] }}>
                {pct.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────── Ranked bar list ─────────────── */
export function LxRankedBar({
  rows, accent = "info", maxItems = 8, valueSuffix = "", chips, onRowClick, rowInfo,
}: {
  rows: { label: string; value: number; sub?: string }[];
  accent?: LxAccent; maxItems?: number; valueSuffix?: string;
  chips?: (row: { label: string; value: number }) => ReactNode;
  onRowClick?: (row: { label: string; value: number }) => void;
  rowInfo?: (row: { label: string; value: number }) => string | undefined;
}) {
  const sliced = [...rows].sort((a, b) => b.value - a.value).slice(0, maxItems);
  const max = Math.max(1, ...sliced.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {sliced.map((r, i) => {
        const pct = (r.value / max) * 100;
        const clickable = !!onRowClick;
        const tip = rowInfo?.({ label: r.label, value: r.value });
        return (
          <li
            key={r.label}
            className={cn(
              "grid grid-cols-[140px_1fr_auto] items-center gap-3 text-[12.5px] rounded-md px-1 -mx-1 py-0.5",
              clickable && "cursor-pointer hover:bg-[var(--lx-soft)] transition-colors",
            )}
            onClick={clickable ? () => onRowClick!({ label: r.label, value: r.value }) : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault(); onRowClick!({ label: r.label, value: r.value });
              }
            }}
          >
            <span className="truncate inline-flex items-center gap-1" style={{ color: "var(--lx-text-2)" }} title={r.label}>
              <span className="truncate">{r.label}</span>
              {tip && <LxInfo text={tip} size={11} />}
            </span>
            <span className="relative h-2.5 rounded-full overflow-hidden" style={{ background: SOFT_BG[accent] }}>
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.55, delay: i * 0.04, ease: [0, 0, 0.2, 1] }}
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ background: LX_HEX[accent] }}
              />
            </span>
            <span className="flex items-center gap-2 font-mono tabular-nums text-right" style={{ color: "var(--lx-text)" }}>
              {chips?.({ label: r.label, value: r.value })}
              <span className="min-w-[44px] text-right">{r.value}{valueSuffix}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}


/* ─────────────── Funnel (stepped) ─────────────── */
export function LxFunnel({
  stages,
}: {
  stages: { stage: string; count: number }[];
}) {
  const top = stages[0]?.count || 1;
  // find biggest absolute drop index
  let dropIdx = -1, dropMax = -1;
  for (let i = 1; i < stages.length; i++) {
    const d = stages[i - 1].count - stages[i].count;
    if (d > dropMax) { dropMax = d; dropIdx = i; }
  }
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => {
        const fromTop = (s.count / top) * 100;
        const stepConv = i > 0 ? (s.count / Math.max(1, stages[i - 1].count)) * 100 : 100;
        const isDrop = i === dropIdx;
        const accent: LxAccent = isDrop ? "risk" : "info";
        return (
          <li key={s.stage} className="grid grid-cols-[160px_1fr_120px] items-center gap-3 text-[12.5px]">
            <span className="truncate" style={{ color: "var(--lx-text-2)" }}>{s.stage}</span>
            <span className="relative h-9 rounded-lg overflow-hidden"
              style={{ background: "var(--lx-soft)" }}>
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${fromTop}%` }}
                transition={{ duration: 0.6, delay: i * 0.04, ease: [0, 0, 0.2, 1] }}
                className="absolute inset-y-0 left-0 flex items-center px-3 text-[12px] font-semibold rounded-lg"
                style={{
                  background: isDrop
                    ? "linear-gradient(90deg, rgba(240,112,64,0.85), rgba(240,112,64,0.55))"
                    : "linear-gradient(90deg, rgba(74,142,232,0.95), rgba(57,182,216,0.75))",
                  color: "#FFFFFF",
                }}
              >
                {s.count}
              </motion.span>
            </span>
            <span className="text-right font-mono tabular-nums text-[11.5px]" style={{ color: isDrop ? LX_HEX.risk : "var(--lx-text-3)" }}>
              {fromTop.toFixed(0)}% · step {stepConv.toFixed(0)}%
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* ─────────────── Heatmap (semantic, compressed) ─────────────── */
export function LxHeatmap({
  rowLabels, columns, values, loadTrends, loadTotals, primaryIndex = 0, onCellClick, rowKeys,
}: {
  rowLabels: string[];
  /** columns describe semantic accent for each col */
  columns: { label: string; accent: LxAccent; info?: string }[];
  /** values[row][col] — raw count */
  values: number[][];
  /** optional per-row mini timeline (length 8-16) for the primary column */
  loadTrends?: number[][];
  /** optional per-row totals (overrides primary column value display) */
  loadTotals?: number[];
  /** which column index is the primary one (gets timeline + wider cell) */
  primaryIndex?: number;
  /** click handler — receives row label, row index, col index, value */
  onCellClick?: (cell: { row: string; rowIndex: number; col: string; colIndex: number; value: number; rowKey?: string }) => void;
  /** optional stable row identifiers (mirrors rowLabels) */
  rowKeys?: string[];
}) {
  // per-column max for relative intensity
  const colMax = columns.map((ci_, ci) =>
    Math.max(
      1,
      ...values.map((r, ri) =>
        ci === primaryIndex && loadTotals ? loadTotals[ri] ?? 0 : r[ci] ?? 0,
      ),
    ),
  );
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full text-[12px] border-separate border-spacing-y-1.5 border-spacing-x-1.5" style={{ tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: "140px" }} />
          {columns.map((_, ci) => (
            <col key={ci} style={{ width: "64px" }} />
          ))}
        </colgroup>

        <thead>
          <tr>
            <th className="text-left font-medium px-2 py-1.5 text-[10px] uppercase tracking-[0.5px]" style={{ color: "var(--lx-text-3)" }}>POC</th>
            {columns.map((c, ci) => (
              <th key={c.label}
                className="text-center font-medium px-1 py-1.5 text-[10px] uppercase tracking-[0.5px]"
                style={{
                  color: ci === primaryIndex ? "var(--lx-text)" : "var(--lx-text-3)",
                }}>
                <span className="inline-flex flex-col items-center gap-0.5">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: LX_HEX[c.accent] }} />
                    {c.info && <LxInfo text={c.info} size={10} />}
                  </span>
                  <span className="leading-tight">{c.label}</span>
                  {ci === primaryIndex && (
                    <span className="text-[8px] font-semibold tracking-[0.8px] px-1 py-0.5 rounded"
                      style={{ background: SOFT_BG[c.accent], color: LX_HEX[c.accent] }}>
                      PRIMARY
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowLabels.map((r, ri) => (
            <tr key={r}>
              <td className="px-2 py-2 whitespace-nowrap font-medium text-[12px]" style={{ color: "var(--lx-text)" }}>{r}</td>
              {columns.map((c, ci) => {
                const isPrimary = ci === primaryIndex;
                const v = isPrimary && loadTotals ? loadTotals[ri] ?? 0 : values[ri]?.[ci] ?? 0;
                const intensity = Math.min(1, v / colMax[ci]);
                const hex = LX_HEX[c.accent];
                const alpha = v === 0 ? 0 : 0.12 + intensity * 0.83;
                const toHex2 = (n: number) =>
                  Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
                const bg = v === 0 ? "rgba(0,0,0,0.025)" : `${hex}${toHex2(alpha)}`;
                const dark = v > 0 && intensity > 0.45;
                const clickable = !!onCellClick && v > 0;
                return (
                  <td key={ci}
                    title={`${c.label}: ${v}`}
                    onClick={clickable ? () => onCellClick!({ row: r, rowIndex: ri, col: c.label, colIndex: ci, value: v, rowKey: rowKeys?.[ri] }) : undefined}
                    role={clickable ? "button" : undefined}
                    tabIndex={clickable ? 0 : undefined}
                    onKeyDown={(e) => {
                      if (clickable && (e.key === "Enter" || e.key === " ")) {
                        e.preventDefault();
                        onCellClick!({ row: r, rowIndex: ri, col: c.label, colIndex: ci, value: v, rowKey: rowKeys?.[ri] });
                      }
                    }}
                    className={cn(
                      "py-2.5 rounded-md font-mono tabular-nums text-center text-[13px]",
                      isPrimary ? "font-bold" : "font-semibold",
                      clickable && "cursor-pointer hover:ring-2 hover:ring-offset-1 transition-shadow",
                    )}
                    style={{
                      background: bg,
                      color: v === 0 ? "var(--lx-text-3)" : dark ? "#fff" : "var(--lx-text)",
                    }}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────── Attention strip ─────────────── */
export function LxAttentionStrip({
  items,
}: {
  items: {
    label: string;
    value: ReactNode;
    /** Optional supporting text rendered below the primary value in a smaller muted style. */
    sub?: ReactNode;
    accent?: LxAccent;
    info?: string;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="lx-card p-3 flex flex-wrap items-stretch gap-x-6 gap-y-2">
      {items.map((it, i) => {
        const clickable = !!it.onClick;
        return (
          <div
            key={i}
            className={cn(
              "flex items-center gap-3 min-w-0 pr-6 border-r last:border-0 rounded-md",
              clickable && "cursor-pointer hover:bg-[var(--lx-soft)] transition-colors -mx-1 px-1",
            )}
            style={{ borderColor: "var(--lx-border)" }}
            onClick={it.onClick}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); it.onClick!(); }
            }}
          >
            <span className="h-8 w-8 rounded-lg grid place-items-center shrink-0"
              style={{ background: SOFT_BG[it.accent ?? "neutral"] }}>
              <span className="h-2 w-2 rounded-full" style={{ background: LX_HEX[it.accent ?? "neutral"] }} />
            </span>
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-[0.6px] inline-flex items-center gap-1" style={{ color: "var(--lx-text-3)" }}>
                <span>{it.label}</span>
                {it.info && <LxInfo text={it.info} size={11} />}
              </div>
              <div className={cn("text-[13px] font-semibold truncate", clickable && "group-hover:underline")} style={{ color: "var(--lx-text)" }}>{it.value}</div>
              {it.sub !== undefined && (
                <div className="text-[10.5px] tabular-nums truncate mt-0.5" style={{ color: "var(--lx-text-3)" }}>
                  {it.sub}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────── Filter pills row ─────────────── */
export type LxFilterOption = string | { value: string; label: string };

function normalizeFilterOption(option: LxFilterOption): { value: string; label: string } {
  return typeof option === "string" ? { value: option, label: option } : option;
}

export function LxFilterRow({
  filters, right,
}: {
  filters: {
    label: string;
    value: string;
    options: LxFilterOption[];
    onChange: (v: string) => void;
  }[];
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto">
      {filters.map((f) => {
        const normalized = f.options.map(normalizeFilterOption);
        return (
          <label key={f.label} className="lx-pill">
            <span className="text-[10.5px] uppercase tracking-[0.6px] font-medium" style={{ color: "var(--lx-text-3)" }}>
              {f.label}
            </span>
            <select value={f.value} onChange={(e) => f.onChange(e.target.value)}>
              {normalized.map((o) => (
                <option key={`${f.label}-${o.value}`} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
        );
      })}
      {right && <div className="ml-auto flex items-center gap-2 shrink-0">{right}</div>}
    </div>
  );
}

/* ─────────────── Insight tile (compact) ─────────────── */
export function LxInsightTile({
  eyebrow, title, value, accent = "neutral", span = 4,
}: {
  eyebrow: string; title: string; value: ReactNode; accent?: LxAccent; span?: 3 | 4 | 6 | 12;
}) {
  return (
    <LxCard span={span}>
      <div className="lx-eyebrow">{eyebrow}</div>
      <div className="mt-2 flex items-baseline justify-between gap-3">
        <div className="text-[15px] font-semibold truncate" style={{ color: "var(--lx-text)" }}>{title}</div>
        <div className="text-[16px] font-semibold font-mono tabular-nums" style={{ color: LX_HEX[accent] }}>{value}</div>
      </div>
    </LxCard>
  );
}

/* ─────────────── Scatter plot (Load vs Conversion) ─────────────── */
export function LxScatter({
  points, xLabel = "Ongoing load", yLabel = "Conversion %",
  height = 280,
}: {
  points: { name: string; x: number; y: number; r?: number }[];
  xLabel?: string; yLabel?: string; height?: number;
}) {
  const xMax = Math.max(1, ...points.map((p) => p.x));
  const yMax = Math.max(1, ...points.map((p) => p.y), 100);
  const rMax = Math.max(1, ...points.map((p) => p.r ?? 1));
  const W = 600, H = height, P = 32;
  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Load vs conversion scatter">
        {/* axes */}
        <line x1={P} y1={H - P} x2={W - P} y2={H - P} stroke="var(--lx-border)" />
        <line x1={P} y1={P} x2={P} y2={H - P} stroke="var(--lx-border)" />
        {/* grid */}
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={P} y1={P + g * (H - 2 * P)} x2={W - P} y2={P + g * (H - 2 * P)}
            stroke="var(--lx-border)" strokeDasharray="3 4" opacity="0.6" />
        ))}
        {/* labels */}
        <text x={W - P} y={H - 10} textAnchor="end" fontSize="10" fill="var(--lx-text-3)">{xLabel}</text>
        <text x={6} y={P - 10} fontSize="10" fill="var(--lx-text-3)">{yLabel}</text>
        {/* points */}
        {points.map((p, i) => {
          const cx = P + (p.x / xMax) * (W - 2 * P);
          const cy = H - P - (p.y / yMax) * (H - 2 * P);
          const r = 6 + ((p.r ?? 1) / rMax) * 14;
          const high = p.y >= 60 && p.x >= xMax * 0.5;
          const accent: LxAccent = high ? "success" : p.y < 30 && p.x >= xMax * 0.5 ? "risk" : "info";
          return (
            <g key={i}>
              <motion.circle
                cx={cx} cy={cy} r={r}
                fill={LX_HEX[accent]} fillOpacity={0.18}
                stroke={LX_HEX[accent]} strokeWidth="1.5"
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: i * 0.02, ease: [0, 0, 0.2, 1] }}
              >
                <title>{`${p.name}: load ${p.x}, conv ${p.y.toFixed(1)}%`}</title>
              </motion.circle>
              <text x={cx + r + 4} y={cy + 3} fontSize="10" fill="var(--lx-text-2)">{p.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}