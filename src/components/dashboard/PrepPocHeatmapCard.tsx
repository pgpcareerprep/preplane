/**
 * PrepPocHeatmapCard — Lumina v1 redesign
 *
 * Presentation layer only. All Supabase queries, realtime, aggregation
 * formulas, drilldown data and export data are unchanged.
 *
 * Key visual changes:
 *  - On Hold moved from Closed Outcomes → Active Prep (visual only)
 *  - Single SECTION_CONFIG drives colgroup / headers / body / totals
 *  - 5-level column-relative heat scale (0 / 1-25% / 26-50% / 51-75% / 76-100%)
 *  - Section visibility controls (Columns popover, EyeOff per group)
 *  - Lumina design tokens throughout (var(--lx-*))
 *  - Dark-mode compatible structural styling
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import type { ComponentType, ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { downloadCsv, dateStamp } from "@/lib/exportCsv";
import {
  buildHeatmapData,
  filterHeatmapMetricRecords,
  fmtConversion,
  HEATMAP_METRIC_LABELS,
  type HeatmapDrilldownLmpRecord,
  type HeatmapDrilldownStudentRecord,
  type HeatmapMetricKey,
  type PrepPocHeatmapRow,
  type PrepPocHeatmapResponse,
} from "@/lib/prepPocHeatmapAgg";
import { LxInfo } from "@/components/insights/LxInfo";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, Briefcase, GraduationCap, TrendingUp,
  Download, RefreshCw, WifiOff, ClipboardList, Search,
  ArrowUpDown, EyeOff, Columns3, BarChart3,
} from "lucide-react";

// ── Query types ───────────────────────────────────────────────────────────────

type HeatmapLinkQueryRow = {
  poc_id: string;
  role: string;
  lmp_id: string;
  lmp_processes: {
    id: string | null;
    lmp_code: string | null;
    company: string;
    role: string;
    status: string;
    domain_id: string | null;
    domain_raw: string | null;
    daily_progress: string | null;
    created_at: string;
    updated_at: string;
    domains: { name: string | null } | null;
  } | null;
};

type HeatmapCandidateQueryRow = {
  lmp_id: string;
  student_id: string | null;
  student_name: string;
  roll_no: string | null;
  pipeline_stage: string | null;
  students: {
    id: string;
    name: string;
    roll_no: string | null;
    student_code: string | null;
    email: string | null;
    phone: string | null;
    cohort: string | null;
    primary_domain: string | null;
    secondary_domain: string | null;
    placement_status: string | null;
  } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const QUERY_KEY = ["prep_poc_heatmap_v3"] as const;

const STORAGE_KEY = "heatmap_visible_sections_v1";

// ── Heat palette — 5 levels, soft Tailwind-based tints ───────────────────────
// L0=zero  L1=1-25%  L2=26-50%  L3=51-75%  L4=76-100%
// Max fill = color-300; never use color-400/500/600 in heat cells.
// Dark text throughout (color-800/700 for filled cells); muted for empty.

type ColorPalette = {
  bg: [string, string, string, string, string];
  text: [string, string, string, string, string];
};

const MUTED_TEXT = "#a8a29e"; // stone-400 — zero-value / empty cell text

// Amber / LMP Load (warm neutral — workload/volume)
const P_NEUTRAL: ColorPalette = {
  bg:   ["#fafaf9", "#fffbeb", "#fef3c7", "#fde68a", "#fcd34d"], // stone-50 · amber-50/100/200/300
  text: [MUTED_TEXT, "#92400e", "#78350f", "#451a03", "#292524"],
};
// Soft blue / Active Prep (Not Started · Prep Ongoing · Prep Done)
const P_SKY: ColorPalette = {
  bg:   ["#f8faff", "#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd"], // blue-50/100/200/300
  text: [MUTED_TEXT, "#1e40af", "#1d4ed8", "#1e3a8a", "#1e3a8a"],
};
// On Hold lives in Active Prep — use same soft blue family for visual consistency
const P_YELLOW: ColorPalette = {
  bg:   ["#f8faff", "#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd"],
  text: [MUTED_TEXT, "#1e40af", "#1d4ed8", "#1e3a8a", "#1e3a8a"],
};
// Emerald / Converted (positive outcome)
const P_SAGE: ColorPalette = {
  bg:   ["#f7fffe", "#ecfdf5", "#d1fae5", "#a7f3d0", "#6ee7b7"], // emerald-50/100/200/300
  text: [MUTED_TEXT, "#065f46", "#047857", "#065f46", "#064e3b"],
};
// Rose / Not Converted (negative outcome — very soft; max rose-200)
const P_CORAL: ColorPalette = {
  bg:   ["#fdf8f8", "#fff1f2", "#ffe4e6", "#fecdd3", "#fecdd3"], // rose-50/100/200/200 (cap at 200)
  text: [MUTED_TEXT, "#9f1239", "#be123c", "#881337", "#881337"],
};
// Orange / Other Reasons (neutral exception — max orange-200)
const P_ORANGE: ColorPalette = {
  bg:   ["#fffaf8", "#fff7ed", "#ffedd5", "#fed7aa", "#fed7aa"], // orange-50/100/200/200 (cap at 200)
  text: [MUTED_TEXT, "#9a3412", "#c2410c", "#7c2d12", "#7c2d12"],
};
// Indigo / Responsibility (distinct from violet/performance)
const P_PLUM: ColorPalette = {
  bg:   ["#f8f9ff", "#eef2ff", "#e0e7ff", "#c7d2fe", "#a5b4fc"], // indigo-50/100/200/300
  text: [MUTED_TEXT, "#3730a3", "#4338ca", "#3730a3", "#312e81"],
};
// Cyan / Domain Load (in-domain · cross-domain)
const P_TEAL: ColorPalette = {
  bg:   ["#f6feff", "#ecfeff", "#cffafe", "#a5f3fc", "#67e8f9"], // cyan-50/100/200/300
  text: [MUTED_TEXT, "#155e75", "#0e7490", "#164e63", "#164e63"],
};
// Violet / Performance (LMP Conversion · Students Placed — final scorecard)
const P_PERF: ColorPalette = {
  bg:   ["#fdfcff", "#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd"], // violet-50/100/200/300
  text: [MUTED_TEXT, "#5b21b6", "#6d28d9", "#4c1d95", "#4c1d95"],
};

function intensityLevel(value: number, colMax: number): 0 | 1 | 2 | 3 | 4 {
  if (value === 0 || colMax === 0) return 0;
  const r = value / colMax;
  if (r <= 0.25) return 1;
  if (r <= 0.50) return 2;
  if (r <= 0.75) return 3;
  return 4;
}

function cellStyle(value: number, colMax: number, palette: ColorPalette) {
  const lvl = intensityLevel(value, colMax);
  return { background: palette.bg[lvl], color: palette.text[lvl] };
}

// ── Section / column schema ───────────────────────────────────────────────────

export type SectionKey =
  | "lmpLoad"
  | "activePrep"
  | "closedOutcomes"
  | "responsibility"
  | "domainLoad"
  | "performance";

const ALL_SECTION_KEYS: SectionKey[] = [
  "lmpLoad", "activePrep", "closedOutcomes", "responsibility", "domainLoad", "performance",
];

type ColType = "heat" | "conversion"; // "conversion" = lmpConversion custom cell

type ColDef = {
  dataKey: keyof PrepPocHeatmapRow; // row field (for heat cells)
  metricKey: HeatmapMetricKey;
  label: string;
  subLabel?: string;
  tooltip: string;
  minWidth: number;
  palette: ColorPalette;
  totalAccent: string; // bold text colour in TOTAL row
  colType: ColType;
};

type SectionDef = {
  key: SectionKey;
  label: string;
  icon: ComponentType<{ size?: number }>;
  // CSS-compatible colour (can use var(--lx-*) or explicit hex)
  accent: string;
  headerBg: string;
  subheaderBg: string;
  cols: ColDef[];
};

const SECTION_CONFIG: SectionDef[] = [
  {
    key: "lmpLoad",
    label: "LMP LOAD",
    icon: ClipboardList,
    accent: "#b45309",          // amber-700
    headerBg: "#fffbeb",        // amber-50
    subheaderBg: "#fafaf9",     // stone-50
    cols: [
      {
        dataKey: "totalLmpLoad", metricKey: "total", colType: "heat",
        label: "Total", subLabel: "(Till Today)", minWidth: 68,
        palette: P_NEUTRAL, totalAccent: "#b45309",
        tooltip: "Distinct LMPs assigned to this POC as Primary or Support (all time).",
      },
      {
        dataKey: "currentLmpCount", metricKey: "current", colType: "heat",
        label: "Current", subLabel: "(Ongoing)", minWidth: 68,
        palette: P_NEUTRAL, totalAccent: "#b45309",
        tooltip: "LMPs currently in Not Started, Prep Ongoing or Prep Done.",
      },
      {
        dataKey: "closedLmpCount", metricKey: "closed", colType: "heat",
        label: "Closed", minWidth: 60,
        palette: P_NEUTRAL, totalAccent: "#b45309",
        tooltip: "LMPs with no remaining current Prep work (Converted + Not Converted + On Hold + Other Reasons).",
      },
    ],
  },
  {
    key: "activePrep",
    label: "ACTIVE PREP",
    icon: RefreshCw,
    accent: "#1d4ed8",          // blue-700
    headerBg: "#eff6ff",        // blue-50
    subheaderBg: "#dbeafe",     // blue-100
    cols: [
      {
        dataKey: "notStartedCount", metricKey: "notStarted", colType: "heat",
        label: "Not Started", minWidth: 78,
        palette: P_SKY, totalAccent: "#1d4ed8",
        tooltip: "LMPs assigned but preparation has not yet begun.",
      },
      {
        dataKey: "prepOngoingCount", metricKey: "prepOngoing", colType: "heat",
        label: "Prep Ongoing", minWidth: 90,
        palette: P_SKY, totalAccent: "#1d4ed8",
        tooltip: "Prep currently in progress.",
      },
      {
        dataKey: "prepDoneCount", metricKey: "prepDone", colType: "heat",
        label: "Prep Done", minWidth: 78,
        palette: P_SKY, totalAccent: "#1d4ed8",
        tooltip: "Prep marked complete, candidate handed to rounds.",
      },
      {
        dataKey: "onHoldCount", metricKey: "onHold", colType: "heat",
        label: "On Hold", minWidth: 72,
        palette: P_YELLOW, totalAccent: "#1d4ed8",
        tooltip: "LMPs currently mapped to On Hold status. Shown here for operational visibility — excluded from the conversion denominator and existing load calculations are unchanged.",
      },
    ],
  },
  {
    key: "closedOutcomes",
    label: "CLOSED OUTCOMES",
    icon: TrendingUp,
    accent: "#047857",          // emerald-700
    headerBg: "#ecfdf5",        // emerald-50
    subheaderBg: "#d1fae5",     // emerald-100
    cols: [
      {
        dataKey: "convertedCount", metricKey: "converted", colType: "heat",
        label: "Converted", minWidth: 80,
        palette: P_SAGE, totalAccent: "#047857",
        tooltip: "Successful conversions credited to this POC.",
      },
      {
        dataKey: "notConvertedCount", metricKey: "notConverted", colType: "heat",
        label: "Not Converted", minWidth: 96,
        palette: P_CORAL, totalAccent: "#be123c",
        tooltip: "LMPs that closed with a Not Converted outcome.",
      },
      {
        dataKey: "otherReasonsCount", metricKey: "otherReasons", colType: "heat",
        label: "Other Reasons", minWidth: 96,
        palette: P_ORANGE, totalAccent: "#c2410c",
        tooltip: "Closed for reasons other than Converted or Not Converted (e.g. role pulled, candidate withdrew).",
      },
    ],
  },
  {
    key: "responsibility",
    label: "RESPONSIBILITY",
    icon: Users,
    accent: "#4338ca",          // indigo-700
    headerBg: "#eef2ff",        // indigo-50
    subheaderBg: "#e0e7ff",     // indigo-100
    cols: [
      {
        dataKey: "primaryCount", metricKey: "primary", colType: "heat",
        label: "Primary", minWidth: 68,
        palette: P_PLUM, totalAccent: "#4338ca",
        tooltip: "Distinct LMPs where this POC is the Primary Prep owner.",
      },
      {
        dataKey: "supportCount", metricKey: "support", colType: "heat",
        label: "Support", minWidth: 68,
        palette: P_PLUM, totalAccent: "#4338ca",
        tooltip: "Distinct LMPs where this POC is a Support owner.",
      },
    ],
  },
  {
    key: "domainLoad",
    label: "DOMAIN LOAD",
    icon: Briefcase,
    accent: "#0e7490",          // cyan-700
    headerBg: "#ecfeff",        // cyan-50
    subheaderBg: "#cffafe",     // cyan-100
    cols: [
      {
        dataKey: "inDomainCount", metricKey: "inDomain", colType: "heat",
        label: "In-domain", minWidth: 80,
        palette: P_TEAL, totalAccent: "#0e7490",
        tooltip: "Primary LMPs matching at least one domain assigned to this POC.",
      },
      {
        dataKey: "crossDomainCount", metricKey: "crossDomain", colType: "heat",
        label: "Cross-domain", minWidth: 92,
        palette: P_TEAL, totalAccent: "#0e7490",
        tooltip: "Primary LMPs outside all domains assigned to this POC.",
      },
    ],
  },
  {
    key: "performance",
    label: "PERFORMANCE",
    icon: BarChart3,
    accent: "#6d28d9",          // violet-700
    headerBg: "#f5f3ff",        // violet-50
    subheaderBg: "#ede9fe",     // violet-100
    cols: [
      {
        // dataKey unused for "conversion" colType — special rendering
        dataKey: "eligibleClosedCount", metricKey: "lmpConversion", colType: "conversion",
        label: "LMP Conversion", minWidth: 108,
        palette: P_PERF, totalAccent: "#6d28d9",
        tooltip: "Converted ÷ eligible closed LMPs (excludes On Hold). Format: converted/eligible – %.",
      },
      {
        dataKey: "studentsPlaced", metricKey: "studentsPlaced", colType: "heat",
        label: "Students Placed", minWidth: 96,
        palette: P_PERF, totalAccent: "#6d28d9",
        tooltip: "Distinct students with a valid final placement outcome through LMPs attributed to this POC.",
      },
    ],
  },
];

// ── Visibility helpers ────────────────────────────────────────────────────────

function loadVisibleSections(): Set<SectionKey> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as SectionKey[];
      if (Array.isArray(arr) && arr.length > 0) return new Set(arr as SectionKey[]);
    }
  } catch {
    // ignore
  }
  return new Set(ALL_SECTION_KEYS);
}

function saveVisibleSections(set: Set<SectionKey>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

// ── Helper components ─────────────────────────────────────────────────────────

function LiveBadge({ isFetching, isError }: { isFetching: boolean; isError: boolean }) {
  if (isError) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium border"
        style={{ background: "color-mix(in srgb, var(--lx-risk) 10%, var(--lx-surface))", borderColor: "color-mix(in srgb, var(--lx-risk) 30%, transparent)", color: "var(--lx-risk)" }}>
        <WifiOff size={9} /> Error
      </span>
    );
  }
  if (isFetching) {
    return (
      <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium border"
        style={{ background: "color-mix(in srgb, var(--lx-yellow) 15%, var(--lx-surface))", borderColor: "color-mix(in srgb, var(--lx-yellow) 40%, transparent)", color: "#9A7408" }}>
        <RefreshCw size={9} className="animate-spin" /> Refreshing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full text-[11px] font-medium border"
      style={{ background: "color-mix(in srgb, var(--lx-success) 10%, var(--lx-surface))", borderColor: "color-mix(in srgb, var(--lx-success) 25%, transparent)", color: "var(--lx-success)" }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lx-success)" }} />
      Live
    </span>
  );
}

function KpiCard({
  icon: Icon, label, value, accentCss, tooltip,
}: {
  icon: ComponentType<{ size?: number }>;
  label: string;
  value: string | number;
  accentCss: string; // e.g. "var(--lx-orange)"
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-[130px] rounded-2xl border px-4 py-3"
      style={{ background: "var(--lx-surface)", borderColor: "var(--lx-border)", boxShadow: "0 1px 3px rgba(26,25,22,0.05)" }}>
      <span className="shrink-0 h-9 w-9 rounded-xl flex items-center justify-center"
        style={{ background: `color-mix(in srgb, ${accentCss} 12%, var(--lx-soft))` }}>
        <Icon size={17} style={{ color: accentCss }} />
      </span>
      <div className="min-w-0">
        <div className="text-[20px] font-bold leading-none tabular-nums" style={{ color: "var(--lx-text)" }}>
          {value}
        </div>
        <div className="mt-0.5 text-[11px] font-medium inline-flex items-center gap-1" style={{ color: "var(--lx-text-3)" }}>
          <span>{label}</span>
          <LxInfo text={tooltip} size={10} />
        </div>
      </div>
    </div>
  );
}

function HeatCell({
  value, palette, colMax, className, ariaLabel, onOpen,
}: {
  value: number;
  palette: ColorPalette;
  colMax: number;
  className?: string;
  ariaLabel?: string;
  onOpen?: () => void;
}) {
  const style = cellStyle(value, colMax, palette);
  const clickable = value > 0 && Boolean(onOpen);
  return (
    <td
      className={cn("text-center tabular-nums text-[12.5px] font-semibold transition-colors", className)}
      style={{ ...style, borderColor: "var(--lx-border)" }}
    >
      {clickable ? (
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={onOpen}
          className="h-full min-h-[38px] w-full px-1.5 py-2 font-semibold tabular-nums transition-all hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{ "--tw-ring-color": "var(--lx-orange)" } as React.CSSProperties}
        >
          {value}
        </button>
      ) : (
        <span className="inline-flex min-h-[38px] items-center justify-center px-1.5">
          {value}
        </span>
      )}
    </td>
  );
}

// ── Columns popover ───────────────────────────────────────────────────────────

function ColumnsPopover({
  visibleSections,
  onToggle,
  onShowAll,
}: {
  visibleSections: Set<SectionKey>;
  onToggle: (key: SectionKey) => void;
  onShowAll: () => void;
}) {
  const allVisible = ALL_SECTION_KEYS.every((k) => visibleSections.has(k));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12.5px] font-semibold transition-colors hover:brightness-97 focus-visible:outline-none focus-visible:ring-2"
          style={{
            background: "var(--lx-surface)",
            borderColor: "var(--lx-border)",
            color: "var(--lx-text-2)",
            "--tw-ring-color": "var(--lx-orange)",
          } as React.CSSProperties}
          aria-label="Toggle column section visibility"
        >
          <Columns3 size={13} />
          Columns
          {!allVisible && (
            <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold"
              style={{ background: "var(--lx-orange)", color: "#fff" }}>
              {ALL_SECTION_KEYS.length - visibleSections.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-56 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--lx-text-3)" }}>
          Visible sections
        </div>
        <div className="space-y-1">
          {SECTION_CONFIG.map((s) => {
            const checked = visibleSections.has(s.key);
            return (
              <label
                key={s.key}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer text-[12.5px] font-medium transition-colors hover:bg-slate-50"
                style={{ color: "var(--lx-text-2)" }}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => onToggle(s.key)}
                  aria-label={`${checked ? "Hide" : "Show"} ${s.label} columns`}
                />
                {s.label}
              </label>
            );
          })}
        </div>
        {!allVisible && (
          <button
            type="button"
            onClick={onShowAll}
            className="mt-2 w-full rounded-lg border py-1.5 text-[12px] font-semibold transition-colors hover:bg-slate-50"
            style={{ borderColor: "var(--lx-border)", color: "var(--lx-orange)" }}
          >
            Show all
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function HeatmapSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-14 flex-1 rounded-xl" style={{ background: "var(--lx-soft)" }} />
        ))}
      </div>
      <div className="h-8 rounded" style={{ background: "var(--lx-soft)" }} />
      <div className="h-7 rounded" style={{ background: "var(--lx-soft)" }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-10 rounded" style={{ background: "var(--lx-bg)" }} />
      ))}
    </div>
  );
}

// ── Totals type ───────────────────────────────────────────────────────────────

type TotalsShape = {
  totalLmpLoad: number; currentLmpCount: number; closedLmpCount: number;
  notStartedCount: number; prepOngoingCount: number; prepDoneCount: number; onHoldCount: number;
  convertedCount: number; notConvertedCount: number; otherReasonsCount: number;
  primaryCount: number; supportCount: number;
  inDomainCount: number; crossDomainCount: number;
  eligibleClosedCount: number; lmpConversionPercentage: number | null; studentsPlaced: number;
};

// ── Main component ────────────────────────────────────────────────────────────

export function PrepPocHeatmapCard() {
  const [activeView, setActiveView] = useState<"lmp" | "student" | "domain">("lmp");
  const [selection, setSelection] = useState<HeatmapDrilldownSelection | null>(null);
  const [visibleSections, setVisibleSections] = useState<Set<SectionKey>>(loadVisibleSections);

  // Persist visibility prefs
  useEffect(() => { saveVisibleSections(visibleSections); }, [visibleSections]);

  const toggleSection = useCallback((key: SectionKey) => {
    setVisibleSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const showAll = useCallback(() => setVisibleSections(new Set(ALL_SECTION_KEYS)), []);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError, refetch } = useQuery<PrepPocHeatmapResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [pocsRes, linksRes, candidatesRes] = await Promise.all([
        supabase
          .from("poc_profiles")
          .select("id, name, primary_domain, domain_tags, role_type")
          .eq("status", "active"),
        supabase
          .from("lmp_poc_links")
          .select("poc_id, role, lmp_id, lmp_processes(id, lmp_code, company, role, status, domain_id, domain_raw, daily_progress, created_at, updated_at, domains(name))")
          .in("role", ["prep", "support"]),
        supabase
          .from("lmp_candidates")
          .select("lmp_id, student_id, student_name, roll_no, pipeline_stage, students(id, name, roll_no, student_code, email, phone, cohort, primary_domain, secondary_domain, placement_status)")
          .not("student_id", "is", null),
      ]);

      if (pocsRes.error) { console.error("[PrepPocHeatmap] Query failed", pocsRes.error); throw new Error(pocsRes.error.message); }
      if (linksRes.error) { console.error("[PrepPocHeatmap] Query failed", linksRes.error); throw new Error(linksRes.error.message); }
      if (candidatesRes.error) { console.error("[PrepPocHeatmap] Query failed", candidatesRes.error); throw new Error(candidatesRes.error.message); }

      return buildHeatmapData(
        (pocsRes.data ?? []) as import("@/lib/prepPocHeatmapAgg").PocRaw[],
        (linksRes.data ?? []) as HeatmapLinkQueryRow[],
        (candidatesRes.data ?? []) as HeatmapCandidateQueryRow[],
      );
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  // ── Realtime ────────────────────────────────────────────────────────────────
  useRealtimeInvalidate("lmp_processes", [QUERY_KEY]);
  useRealtimeInvalidate("lmp_poc_links" as never, [QUERY_KEY]);
  useRealtimeInvalidate("poc_profiles" as never, [QUERY_KEY]);
  useRealtimeInvalidate("lmp_candidates", [QUERY_KEY]);

  // Only POCs with at least one LMP assignment
  const activeRows = useMemo(() => (data?.rows ?? []).filter((r) => r.totalLmpLoad > 0), [data]);

  // Per-column max values (heat only; conversion skipped)
  const colMaxValues = useMemo(() => {
    const maxFor = (key: keyof PrepPocHeatmapRow) =>
      Math.max(1, ...activeRows.map((r) => (r[key] as number) ?? 0));
    return {
      totalLmpLoad: maxFor("totalLmpLoad"),
      currentLmpCount: maxFor("currentLmpCount"),
      closedLmpCount: maxFor("closedLmpCount"),
      notStartedCount: maxFor("notStartedCount"),
      prepOngoingCount: maxFor("prepOngoingCount"),
      prepDoneCount: maxFor("prepDoneCount"),
      onHoldCount: maxFor("onHoldCount"),
      convertedCount: maxFor("convertedCount"),
      notConvertedCount: maxFor("notConvertedCount"),
      otherReasonsCount: maxFor("otherReasonsCount"),
      primaryCount: maxFor("primaryCount"),
      supportCount: maxFor("supportCount"),
      inDomainCount: maxFor("inDomainCount"),
      crossDomainCount: maxFor("crossDomainCount"),
      studentsPlaced: maxFor("studentsPlaced"),
    };
  }, [activeRows]);

  // CSV export — always exports full dataset regardless of visibility
  const handleExport = useCallback(() => {
    if (!data) return;
    const { rows, summary, generatedAt } = data;
    const csvRows = rows.map((r) => ({
      "POC Name": r.pocName,
      "Total LMPs": r.totalLmpLoad,
      "Current LMPs": r.currentLmpCount,
      "Closed LMPs": r.closedLmpCount,
      "Not Started": r.notStartedCount,
      "Prep Ongoing": r.prepOngoingCount,
      "Prep Done": r.prepDoneCount,
      "On Hold": r.onHoldCount,
      Converted: r.convertedCount,
      "Not Converted": r.notConvertedCount,
      "Other Reasons": r.otherReasonsCount,
      Primary: r.primaryCount,
      Support: r.supportCount,
      "In-domain": r.inDomainCount,
      "Cross-domain": r.crossDomainCount,
      "Converted Count": r.convertedCount,
      "Eligible Closed Count": r.eligibleClosedCount,
      "LMP Conversion %": r.lmpConversionPercentage !== null ? `${r.lmpConversionPercentage.toFixed(1)}%` : "—",
      "Students Placed": r.studentsPlaced,
    }));
    csvRows.push({} as never);
    csvRows.push({ "POC Name": `Exported At: ${generatedAt}` } as never);
    csvRows.push({ "POC Name": `Active POCs: ${summary.activePocCount} | Unique LMPs: ${summary.uniqueLmpCount} | Converted LMP %: ${summary.convertedLmpPercentage !== null ? `${summary.convertedLmpPercentage.toFixed(1)}%` : "—"}` } as never);
    downloadCsv(`prep-poc-heatmap-lmp-wise-${dateStamp()}.csv`, csvRows, [
      "POC Name", "Total LMPs", "Current LMPs", "Closed LMPs",
      "Not Started", "Prep Ongoing", "Prep Done", "On Hold",
      "Converted", "Not Converted", "Other Reasons",
      "Primary", "Support", "In-domain", "Cross-domain",
      "Converted Count", "Eligible Closed Count", "LMP Conversion %", "Students Placed",
    ]);
  }, [data]);

  // Totals row values
  const totals = useMemo((): TotalsShape | null => {
    if (!data) return null;
    const { rows, summary } = data;
    const sum = (key: keyof PrepPocHeatmapRow) => rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
    return {
      totalLmpLoad: summary.uniqueLmpCount,
      currentLmpCount: sum("currentLmpCount"),
      closedLmpCount: sum("closedLmpCount"),
      notStartedCount: sum("notStartedCount"),
      prepOngoingCount: sum("prepOngoingCount"),
      prepDoneCount: sum("prepDoneCount"),
      onHoldCount: sum("onHoldCount"),
      convertedCount: summary.convertedLmpCount,
      notConvertedCount: sum("notConvertedCount"),
      otherReasonsCount: sum("otherReasonsCount"),
      primaryCount: sum("primaryCount"),
      supportCount: sum("supportCount"),
      inDomainCount: sum("inDomainCount"),
      crossDomainCount: sum("crossDomainCount"),
      eligibleClosedCount: summary.eligibleClosedLmpCount,
      lmpConversionPercentage: summary.convertedLmpPercentage,
      studentsPlaced: summary.uniqueStudentsPlaced,
    };
  }, [data]);

  const openDrilldown = useCallback((
    row: PrepPocHeatmapRow,
    metricKey: HeatmapMetricKey,
    displayedValue: number | string,
    displayedCount: number | null,
  ) => {
    if (displayedCount !== null && displayedCount <= 0) return;
    setSelection({ pocId: row.pocId, pocName: row.pocName, metricKey, metricLabel: HEATMAP_METRIC_LABELS[metricKey], displayedValue, displayedCount });
  }, []);

  // Visible sections in order
  const visibleConfig = useMemo(
    () => SECTION_CONFIG.filter((s) => visibleSections.has(s.key)),
    [visibleSections],
  );
  const noSections = visibleConfig.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="lumina rounded-2xl border overflow-hidden"
      style={{ background: "var(--lx-surface)", borderColor: "var(--lx-border)", boxShadow: "0 1px 3px rgba(26,25,22,0.06)" }}>

      {/* ── Card header ── */}
      <div className="px-6 pt-5 pb-4 border-b" style={{ borderColor: "var(--lx-border)", background: "var(--lx-surface)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          {/* Title block */}
          <div>
            <p className="lx-eyebrow" style={{ color: "var(--lx-orange)" }}>POC ANALYTICS</p>
            <h2 className="text-[24px] font-bold mt-0.5 tracking-tight" style={{ color: "var(--lx-text)" }}>
              Prep POC Heatmap
            </h2>
            <p className="text-[13px] mt-1" style={{ color: "var(--lx-text-3)" }}>
              Live workload, preparation stage, outcomes and ownership by Prep POC.
            </p>
            <p className="text-[12px] mt-1.5 flex items-center gap-2" style={{ color: "var(--lx-text-3)" }}>
              Live from POC DB • LMP DB
              <LiveBadge isFetching={isFetching && !isLoading} isError={isError} />
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Segmented view control */}
            <div className="flex h-9 rounded-xl border overflow-hidden"
              style={{ borderColor: "var(--lx-border)", background: "var(--lx-soft)" }}>
              {([
                { id: "lmp", label: "LMP-wise" },
                { id: "student", label: "Student-wise" },
                { id: "domain", label: "Domain-wise" },
              ] as const).map((tab, i) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id)}
                  disabled={tab.id !== "lmp"}
                  className={cn(
                    "px-3.5 text-[12.5px] font-semibold transition-colors border-r last:border-r-0 focus-visible:outline-none focus-visible:ring-2",
                    tab.id !== "lmp" && "opacity-40 cursor-not-allowed",
                  )}
                  style={{
                    borderColor: "var(--lx-border)",
                    background: activeView === tab.id ? "var(--lx-surface)" : "transparent",
                    color: activeView === tab.id ? "var(--lx-orange)" : "var(--lx-text-2)",
                    boxShadow: activeView === tab.id ? "0 1px 3px rgba(26,25,22,0.08)" : undefined,
                    "--tw-ring-color": "var(--lx-orange)",
                  } as React.CSSProperties}
                  title={tab.id !== "lmp" ? "Not yet implemented" : undefined}
                  aria-pressed={activeView === tab.id}
                  role="tab"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Columns visibility */}
            <ColumnsPopover
              visibleSections={visibleSections}
              onToggle={toggleSection}
              onShowAll={showAll}
            />

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={!data || isLoading}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12.5px] font-semibold transition-colors hover:brightness-97 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2"
              style={{
                background: "var(--lx-surface)",
                borderColor: "var(--lx-border)",
                color: "var(--lx-text-2)",
                "--tw-ring-color": "var(--lx-orange)",
              } as React.CSSProperties}
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* KPI cards */}
        {!isLoading && data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <KpiCard icon={Users} label="Active POCs" value={data.summary.activePocCount}
              accentCss="var(--lx-orange)"
              tooltip="Distinct active POCs with at least one LMP assignment included in the heatmap." />
            <KpiCard icon={Briefcase} label="Unique LMPs" value={data.summary.uniqueLmpCount}
              accentCss="var(--lx-yellow)"
              tooltip="Distinct LMP processes counted once, even when multiple POCs are assigned." />
            <KpiCard icon={GraduationCap} label="Students Placed" value={data.summary.uniqueStudentsPlaced}
              accentCss="var(--lx-success)"
              tooltip="Distinct students with a valid final placement outcome, counted once globally." />
            <KpiCard icon={TrendingUp} label="Converted LMP %"
              value={data.summary.convertedLmpPercentage !== null ? `${data.summary.convertedLmpPercentage.toFixed(0)}%` : "—"}
              accentCss="var(--lx-info)"
              tooltip="Globally distinct converted LMPs ÷ eligible closed LMPs (excludes On Hold)." />
          </div>
        )}
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-14 rounded-2xl" style={{ background: "var(--lx-soft)" }} />)}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-4" style={{ background: "var(--lx-bg)" }}>
        {isLoading && <HeatmapSkeleton />}

        {isError && (
          <div className="py-10 text-center space-y-2">
            <p className="text-[14px] font-medium" style={{ color: "var(--lx-risk)" }}>
              Failed to load heatmap data
            </p>
            <p className="text-[12px]" style={{ color: "var(--lx-text-3)" }}>
              Check console for details.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-1.5 rounded-lg border text-[12.5px] font-medium"
              style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-2)", background: "var(--lx-surface)" }}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && data && activeRows.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[14px]" style={{ color: "var(--lx-text-3)" }}>
              No Prep POC workload data available.
            </p>
          </div>
        )}

        {!isLoading && !isError && data && activeRows.length > 0 && (
          <>
            <div className="overflow-x-auto rounded-xl border"
              style={{ borderColor: "var(--lx-border)", background: "var(--lx-surface)" }}>
              {noSections ? (
                <div className="py-10 px-6 text-center space-y-3">
                  <p className="text-[13px]" style={{ color: "var(--lx-text-3)" }}>
                    No metric sections are visible.
                  </p>
                  <button
                    type="button"
                    onClick={showAll}
                    className="px-4 py-1.5 rounded-lg border text-[12.5px] font-semibold transition-colors"
                    style={{ borderColor: "var(--lx-orange)", color: "var(--lx-orange)", background: "var(--lx-surface)" }}
                  >
                    Show all sections
                  </button>
                </div>
              ) : (
                <table
                  className="w-full border-separate text-[12px]"
                  style={{ borderSpacing: 0, minWidth: 900 }}
                >
                  {/* Colgroup — driven by visible sections */}
                  <colgroup>
                    <col style={{ minWidth: 148, width: 160 }} />
                    {visibleConfig.flatMap((s) =>
                      s.cols.map((c) => <col key={c.metricKey} style={{ minWidth: c.minWidth }} />),
                    )}
                  </colgroup>

                  <thead>
                    {/* Row 1: Group headers */}
                    <tr>
                      <th
                        rowSpan={2}
                        className="text-left align-bottom px-4 pb-3 pt-4 text-[10.5px] font-bold uppercase tracking-widest border-r border-b"
                        style={{
                          color: "var(--lx-text-3)",
                          position: "sticky", left: 0, zIndex: 3,
                          background: "var(--lx-surface)",
                          borderColor: "var(--lx-border)",
                        }}
                      >
                        POC
                      </th>

                      {visibleConfig.map((s) => {
                        const Icon = s.icon;
                        return (
                          <th
                            key={s.key}
                            colSpan={s.cols.length}
                            className="text-center px-2 py-2.5 text-[10px] font-bold uppercase tracking-wider border-b"
                            style={{
                              color: s.accent,
                              background: s.headerBg,
                              borderTop: `2.5px solid ${s.accent}`,
                              borderLeft: `1px solid color-mix(in srgb, ${s.accent} 20%, transparent)`,
                              borderRight: `1px solid color-mix(in srgb, ${s.accent} 20%, transparent)`,
                              borderBottom: `1px solid color-mix(in srgb, ${s.accent} 15%, transparent)`,
                              borderRadius: "6px 6px 0 0",
                            }}
                          >
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className="h-5 w-5 rounded-lg inline-flex items-center justify-center"
                                style={{ background: `color-mix(in srgb, ${s.accent} 12%, transparent)` }}>
                                <Icon size={11} />
                              </span>
                              {s.label}
                              <button
                                type="button"
                                onClick={() => toggleSection(s.key)}
                                aria-label={`Hide ${s.label} columns`}
                                className="ml-0.5 opacity-0 group-hover:opacity-100 inline-flex items-center justify-center h-4 w-4 rounded hover:opacity-70 focus-visible:outline-none focus-visible:ring-1 transition-opacity"
                                style={{ "--tw-ring-color": "var(--lx-orange)" } as React.CSSProperties}
                              >
                                <EyeOff size={9} />
                              </button>
                            </span>
                          </th>
                        );
                      })}
                    </tr>

                    {/* Row 2: Metric sub-headers */}
                    <tr>
                      {visibleConfig.flatMap((s) =>
                        s.cols.map((col) => (
                          <th
                            key={col.metricKey}
                            className="text-center px-1 pt-1.5 pb-2.5 text-[10px] font-semibold border-b"
                            style={{
                              color: "var(--lx-text-2)",
                              verticalAlign: "bottom",
                              background: s.subheaderBg,
                              borderColor: `color-mix(in srgb, ${s.accent} 12%, transparent)`,
                            }}
                          >
                            <span className="inline-flex flex-col items-center gap-0.5">
                              <span className="leading-tight text-center whitespace-nowrap">{col.label}</span>
                              {col.subLabel && (
                                <span className="text-[9px] leading-tight" style={{ color: "var(--lx-text-3)" }}>
                                  {col.subLabel}
                                </span>
                              )}
                              <LxInfo text={col.tooltip} size={9} />
                            </span>
                          </th>
                        )),
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {activeRows.map((row) => (
                      <DataRow
                        key={row.pocId}
                        row={row}
                        colMaxValues={colMaxValues}
                        visibleConfig={visibleConfig}
                        onOpenDrilldown={openDrilldown}
                      />
                    ))}
                    {totals && (
                      <TotalRow totals={totals} visibleConfig={visibleConfig} />
                    )}
                  </tbody>
                </table>
              )}
            </div>

            {/* Footer: legend + On Hold note */}
            <div className="flex flex-wrap items-center justify-between gap-3 mt-2 px-1">
              <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--lx-text-3)" }}>
                <span>Heat intensity (relative to column max)</span>
                <span className="flex items-center gap-1 ml-1">
                  <span className="text-[10px]">Low</span>
                  {(["#eff6ff", "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa"] as const).map((bg, i) => (
                    <span key={i} className="inline-block w-3.5 h-3.5 rounded-sm border"
                      style={{ background: bg, borderColor: "#bfdbfe" }} />
                  ))}
                  <span className="text-[10px]">High</span>
                </span>
              </div>
              <p className="text-[10.5px] flex items-center gap-1" style={{ color: "var(--lx-text-3)" }}>
                <LxInfo text="On Hold is shown under Active Prep for operational visibility. Load and conversion calculations remain unchanged." size={10} />
                On Hold shown under Active Prep · load &amp; conversion calculations unchanged.
              </p>
            </div>
          </>
        )}
      </div>

      {data && (
        <HeatmapDrilldownModal
          open={Boolean(selection)}
          selection={selection}
          data={data}
          onOpenChange={(open) => { if (!open) setSelection(null); }}
        />
      )}
    </div>
  );
}

// ── DataRow ───────────────────────────────────────────────────────────────────

function DataRow({
  row, colMaxValues, visibleConfig, onOpenDrilldown,
}: {
  row: PrepPocHeatmapRow;
  colMaxValues: Record<string, number>;
  visibleConfig: SectionDef[];
  onOpenDrilldown: (row: PrepPocHeatmapRow, metricKey: HeatmapMetricKey, displayedValue: number | string, displayedCount: number | null) => void;
}) {
  const open = (metricKey: HeatmapMetricKey, val: number | string, count: number | null = typeof val === "number" ? val : null) =>
    () => onOpenDrilldown(row, metricKey, val, count);

  return (
    <tr className="group transition-colors">
      {/* Sticky POC name */}
      <td
        className="px-4 py-2.5 font-semibold text-[12.5px] whitespace-nowrap border-r border-b transition-colors"
        style={{
          color: "var(--lx-text)",
          position: "sticky", left: 0, zIndex: 1,
          background: "var(--lx-surface)",
          borderColor: "var(--lx-border)",
        }}
      >
        {row.pocName}
      </td>

      {visibleConfig.flatMap((s) =>
        s.cols.map((col) => {
          if (col.colType === "conversion") {
            // LMP Conversion special cell
            const dispVal = fmtConversion(row.convertedCount, row.eligibleClosedCount, row.lmpConversionPercentage);
            const hasEligible = row.eligibleClosedCount > 0;
            const isGood = row.lmpConversionPercentage !== null && row.lmpConversionPercentage >= 50;
            return (
              <td
                key={col.metricKey}
                className="text-center text-[12px] font-semibold tabular-nums border-b transition-colors"
                style={{
                  background: s.subheaderBg,
                  color: hasEligible
                    ? isGood ? "var(--lx-success)" : "var(--lx-risk)"
                    : "var(--lx-text-3)",
                  borderColor: "var(--lx-border)",
                }}
              >
                {hasEligible ? (
                  <button
                    type="button"
                    aria-label={`View LMP Conversion details for ${row.pocName}`}
                    onClick={open("lmpConversion", dispVal, row.eligibleClosedCount)}
                    className="w-full min-h-[38px] px-1.5 py-2 font-semibold tabular-nums transition-all hover:brightness-95 focus-visible:outline-none focus-visible:ring-2"
                    style={{ "--tw-ring-color": "var(--lx-orange)" } as React.CSSProperties}
                  >
                    {dispVal}
                  </button>
                ) : (
                  <span className="inline-flex min-h-[38px] items-center justify-center px-1.5">{dispVal}</span>
                )}
              </td>
            );
          }

          // Standard heat cell
          const value = (row[col.dataKey] as number) ?? 0;
          const colMax = colMaxValues[col.dataKey as string] ?? 1;
          return (
            <HeatCell
              key={col.metricKey}
              value={value}
              palette={col.palette}
              colMax={colMax}
              ariaLabel={`View ${value} ${col.label} LMPs for ${row.pocName}`}
              onOpen={open(col.metricKey, value)}
            />
          );
        }),
      )}
    </tr>
  );
}

// ── TotalRow ──────────────────────────────────────────────────────────────────

function TotalRow({
  totals, visibleConfig,
}: {
  totals: TotalsShape;
  visibleConfig: SectionDef[];
}) {
  return (
    <tr>
      <td
        className="px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-widest border-r"
        style={{
          color: "var(--lx-text-2)",
          position: "sticky", left: 0, zIndex: 1,
          background: "var(--lx-soft)",
          borderTop: "2px solid var(--lx-border)",
          borderColor: "var(--lx-border)",
        }}
      >
        TOTAL
      </td>

      {visibleConfig.flatMap((s) =>
        s.cols.map((col) => {
          if (col.colType === "conversion") {
            const dispVal = fmtConversion(totals.convertedCount, totals.eligibleClosedCount, totals.lmpConversionPercentage);
            return (
              <td
                key={col.metricKey}
                className="text-center text-[12px] font-bold tabular-nums py-2.5"
                style={{
                  background: "var(--lx-soft)",
                  color: totals.eligibleClosedCount > 0 ? col.totalAccent : "var(--lx-text-3)",
                  borderTop: "2px solid var(--lx-border)",
                }}
              >
                {dispVal}
              </td>
            );
          }

          const value = totals[col.dataKey as keyof TotalsShape] as number ?? 0;
          return (
            <td
              key={col.metricKey}
              className="text-center text-[12.5px] font-bold tabular-nums py-2.5"
              style={{
                background: "var(--lx-soft)",
                color: value > 0 ? col.totalAccent : "var(--lx-text-3)",
                borderTop: "2px solid var(--lx-border)",
              }}
            >
              {value}
            </td>
          );
        }),
      )}
    </tr>
  );
}

// ── Drilldown modal (unchanged) ───────────────────────────────────────────────

type HeatmapDrilldownSelection = {
  pocId: string;
  pocName: string;
  metricKey: HeatmapMetricKey;
  metricLabel: string;
  displayedValue: number | string;
  displayedCount: number | null;
};

type LmpSortKey = "company" | "statusLabel" | "domain" | "studentsMapped" | "createdAt" | "updatedAt";
type StudentSortKey = "studentName" | "company" | "domain" | "cohort" | "placementDate";

function HeatmapDrilldownModal({
  open, selection, data, onOpenChange,
}: {
  open: boolean;
  selection: HeatmapDrilldownSelection | null;
  data: PrepPocHeatmapResponse;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [lmpSort, setLmpSort] = useState<LmpSortKey>("createdAt");
  const [studentSort, setStudentSort] = useState<StudentSortKey>("studentName");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const result = useMemo(() => {
    if (!selection) return null;
    return filterHeatmapMetricRecords(data.source, selection.pocId, selection.metricKey);
  }, [data.source, selection]);

  const allLmps = useMemo(
    () => result?.recordType === "conversion" ? result.denominatorLmps : result?.lmps ?? [],
    [result],
  );
  const allStudents = useMemo(() => result?.students ?? [], [result]);
  const originalCount = result?.recordType === "student" ? allStudents.length : allLmps.length;
  const displayedCount = selection?.displayedCount ?? originalCount;
  const countMismatch = selection && displayedCount !== null && displayedCount !== originalCount;

  const filteredLmps = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const rows = q
      ? allLmps.filter((record) => [
          record.company, record.role, record.lmpCode, record.domain,
          record.statusLabel, record.outcomeReason, record.primaryPoc, record.supportPoc,
        ].some((v) => v.toLowerCase().includes(q)))
      : allLmps;
    return [...rows].sort((a, b) => compareValues(a[lmpSort], b[lmpSort], lmpSort === "createdAt" || lmpSort === "updatedAt"));
  }, [allLmps, lmpSort, searchTerm]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const rows = q
      ? allStudents.filter((record) => [
          record.studentName, record.studentCode, record.email, record.phone,
          record.primaryDomain, record.secondaryDomain,
          record.company, record.lmpCode,
          record.domain, record.cohort, record.primaryPoc, record.supportPoc,
        ].some((v) => v.toLowerCase().includes(q)))
      : allStudents;
    return [...rows].sort((a, b) => compareValues(a[studentSort], b[studentSort], studentSort === "placementDate"));
  }, [allStudents, searchTerm, studentSort]);

  const modalRows = result?.recordType === "student" ? filteredStudents : filteredLmps;
  const totalPages = Math.max(1, Math.ceil(modalRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = modalRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetModalControls = (nextOpen: boolean) => {
    if (!nextOpen) { setSearchTerm(""); setPage(1); }
    onOpenChange(nextOpen);
  };

  const exportDrilldown = () => {
    if (!selection || !result) return;
    const meta = [
      { Field: "POC Name", Value: selection.pocName },
      { Field: "Metric", Value: selection.metricLabel },
      { Field: "Displayed Count", Value: String(selection.displayedCount ?? originalCount) },
      { Field: "Detail Count", Value: String(originalCount) },
      { Field: "Data Scope", Value: "Current Prep POC Heatmap live dataset" },
      { Field: "Exported At", Value: new Date().toISOString() },
      {},
    ];
    if (result.recordType === "student") {
      downloadCsv(
        `${safeFilename(selection.pocName)}_${safeFilename(selection.metricLabel)}_${dateStamp()}.csv`,
        [...meta, ...allStudents.map((r) => ({
          "Student Name": r.studentName,
          "Student ID": r.studentCode || r.studentId,
          Email: r.email || "",
          Phone: r.phone || "",
          "Primary Domain": r.primaryDomain || "",
          "Secondary Domain": r.secondaryDomain || "",
          Cohort: r.cohort,
          Company: r.company,
          LMP: r.lmpCode,
          Domain: r.domain,
          "Placement Status": r.placementStatus,
          "Placement Date": formatDate(r.placementDate),
          "Primary POC": r.primaryPoc,
          "Support POC": r.supportPoc,
        }))],
      );
      return;
    }
    downloadCsv(
      `${safeFilename(selection.pocName)}_${safeFilename(selection.metricLabel)}_${dateStamp()}.csv`,
      [...meta, ...allLmps.map((r) => ({
        "LMP Name": `${r.company} — ${r.role}`.trim(), Company: r.company, Role: r.role,
        "LMP ID": r.lmpCode || r.lmpId, Domain: r.domain,
        "Primary POC": r.primaryPoc, "Support POC": r.supportPoc,
        "Prep Status": r.statusLabel, Outcome: r.statusLabel, Reason: r.outcomeReason,
        "Students Mapped": r.studentsMapped, "Students Placed": r.studentsPlaced,
        "Created Date": formatDate(r.createdAt), "Last Updated": formatDate(r.updatedAt),
      }))],
    );
  };

  return (
    <Dialog open={open} onOpenChange={resetModalControls}>
      <DialogContent className="flex max-h-[92vh] w-[min(1180px,calc(100vw-24px))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-3xl">
        <DialogHeader className="border-b bg-gradient-to-br from-white via-white to-slate-50 px-6 py-5 text-left">
          <DialogTitle className="text-[21px] font-bold tracking-[-0.02em] text-slate-900">
            {selection ? `${selection.pocName} · ${selection.metricLabel}` : "Heatmap details"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] text-slate-500">
            {originalCount.toLocaleString()} records contributing to this metric
            {searchTerm.trim() && ` · ${modalRows.length.toLocaleString()} matching search`}
            {selection?.metricKey === "lmpConversion" && result && (
              <span> · {result.convertedLmps.length}/{result.denominatorLmps.length} converted · On Hold excluded</span>
            )}
          </DialogDescription>
          <div className="mt-3 flex flex-wrap gap-2">
            <ContextChip>Till Today</ContextChip>
            <ContextChip>Current dashboard filters</ContextChip>
            <ContextChip>{selection?.metricLabel ?? "Metric"}</ContextChip>
            {countMismatch && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                Count check: visible {displayedCount}, detail {originalCount}
              </span>
            )}
          </div>
        </DialogHeader>

        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white px-6 py-3">
          <label className="relative min-w-[240px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Search records..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[13px] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {result?.recordType === "student" ? (
            <SortSelect value={studentSort} onChange={(v) => setStudentSort(v as StudentSortKey)} options={[
              ["studentName", "Student name"], ["company", "Company"], ["domain", "Domain"],
              ["cohort", "Cohort"], ["placementDate", "Placement date"],
            ]} />
          ) : (
            <SortSelect value={lmpSort} onChange={(v) => setLmpSort(v as LmpSortKey)} options={[
              ["createdAt", "Created date"], ["updatedAt", "Last updated"], ["company", "Company"],
              ["statusLabel", "Status"], ["domain", "Domain"], ["studentsMapped", "Students mapped"],
            ]} />
          )}
          <button
            type="button"
            onClick={exportDrilldown}
            disabled={!result || originalCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Download size={14} /> Download CSV
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50/60 px-6 py-4">
          {result?.recordType === "conversion" && (
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <MetricSummaryCard label="Converted LMPs" value={result.convertedLmps.length} tone="green" />
              <MetricSummaryCard label="Eligible Closed LMPs" value={result.denominatorLmps.length} tone="slate" />
              <MetricSummaryCard label="Conversion" value={fmtConversion(result.convertedLmps.length, result.denominatorLmps.length, result.denominatorLmps.length ? (result.convertedLmps.length / result.denominatorLmps.length) * 100 : null)} tone="green" />
            </div>
          )}
          {!result || originalCount === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-[13px] text-slate-500">
              No records found for this metric.
            </div>
          ) : result.recordType === "student" ? (
            <StudentDrilldownTable rows={pageRows as HeatmapDrilldownStudentRecord[]} />
          ) : (
            <LmpDrilldownTable
              rows={pageRows as HeatmapDrilldownLmpRecord[]}
              onView={(id) => navigate(`/lmp/${encodeURIComponent(id)}?from=heatmap`)}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-white px-6 py-3 text-[12px] text-slate-500">
          <span>
            Showing {modalRows.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, modalRows.length)} of {modalRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-40">
              Previous
            </button>
            <span>Page {safePage} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-40">
              Next
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function LmpDrilldownTable({ rows, onView }: { rows: HeatmapDrilldownLmpRecord[]; onView: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[980px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-slate-100 text-[10.5px] uppercase tracking-wide text-slate-500">
          <tr>
            {["LMP / Company", "Process ID", "Domain", "Primary POC", "Support POC", "Status", "Students", "Created", "Updated", "Actions"].map((h) => (
              <th key={h} className="border-b border-slate-200 px-3 py-3 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lmpId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
              <td className="px-3 py-3"><div className="font-semibold text-slate-900">{r.company || "Untitled"}</div><div className="text-slate-500">{r.role || "No role"}</div></td>
              <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{r.lmpCode || r.lmpId}</td>
              <td className="px-3 py-3 text-slate-700">{r.domain || "Unmapped"}</td>
              <td className="px-3 py-3 text-slate-700">{r.primaryPoc || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.supportPoc || "—"}</td>
              <td className="px-3 py-3">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{r.statusLabel}</span>
                {r.outcomeReason && <div className="mt-1 text-[11px] text-slate-500">{r.outcomeReason}</div>}
              </td>
              <td className="px-3 py-3 text-slate-700">{r.studentsMapped} mapped · {r.studentsPlaced} placed</td>
              <td className="px-3 py-3 text-slate-600">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-3 text-slate-600">{formatDate(r.updatedAt)}</td>
              <td className="px-3 py-3">
                <button type="button" onClick={() => onView(r.lmpId)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50">
                  View LMP
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StudentDrilldownTable({ rows }: { rows: HeatmapDrilldownStudentRecord[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full min-w-[920px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-slate-100 text-[10.5px] uppercase tracking-wide text-slate-500">
          <tr>
            {["Student", "Student ID", "Email", "Phone", "Primary Domain", "Secondary Domain", "Cohort", "Placed Company", "LMP", "Domain", "Placement", "Primary POC", "Support POC"].map((h) => (
              <th key={h} className="border-b border-slate-200 px-3 py-3 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
              <td className="px-3 py-3 font-semibold text-slate-900">{r.studentName}</td>
              <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{r.studentCode || r.studentId}</td>
              <td className="px-3 py-3 text-slate-700">{r.email || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.phone || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.primaryDomain || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.secondaryDomain || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.cohort || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.company || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.lmpCode || r.lmpId}</td>
              <td className="px-3 py-3 text-slate-700">{r.domain || "Unmapped"}</td>
              <td className="px-3 py-3 text-slate-700">{r.placementStatus} · {formatDate(r.placementDate)}</td>
              <td className="px-3 py-3 text-slate-700">{r.primaryPoc || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{r.supportPoc || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 shadow-sm">
      <ArrowUpDown size={13} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent outline-none">
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function MetricSummaryCard({ label, value, tone }: { label: string; value: string | number; tone: "green" | "slate" }) {
  return (
    <div className={cn("rounded-2xl border px-4 py-3", tone === "green" ? "border-green-100 bg-green-50 text-green-800" : "border-slate-200 bg-white text-slate-800")}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
    </div>
  );
}

function ContextChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
      {children}
    </span>
  );
}

function compareValues(a: unknown, b: unknown, desc = false): number {
  const av = a == null ? "" : String(a);
  const bv = b == null ? "" : String(b);
  const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
  return desc ? -cmp : cmp;
}

function safeFilename(v: string): string {
  return v.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "heatmap";
}

function formatDate(value: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}
