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
import { useTheme } from "@/lib/themeContext";
import {
  A_NEUTRAL, A_SKY, A_SAGE, A_CORAL, A_ORANGE, A_PLUM, A_TEAL,
  CELL_BORDER, LEGEND_LEVELS, LEGEND_LEVELS_DARK,
  P_CORAL, P_NEUTRAL, P_ON_HOLD, P_ORANGE, P_PLUM, P_SAGE, P_SKY, P_TEAL,
  cellStyle, sectionHeaderBg, sectionSubheaderBg, MUTED_TEXT, T_SAGE, T_CORAL,
  type ColorPalette,
} from "@/components/dashboard/prepPocHeatmapPalettes";
import {
  filterHeatmapMetricRecords,
  fmtConversion,
  HEATMAP_METRIC_LABELS,
  type HeatmapDrilldownLmpRecord,
  type HeatmapDrilldownStudentRecord,
  type HeatmapMetricKey,
  type PrepPocHeatmapRow,
} from "@/lib/prepPocHeatmapAgg";
import {
  buildFullHeatmapData,
  type FullPrepPocHeatmapResponse,
} from "@/lib/prepPocHeatmapViews";
import {
  ResponsiveHeatmapTable,
  STUDENT_SECTION_CONFIG,
  DOMAIN_SECTION_CONFIG,
  buildColMaxValues,
  studentTotalsFrom,
  domainTotalsFrom,
  type AltSectionDef,
} from "@/components/dashboard/PrepPocHeatmapAlternateViews";
import { LxInfo } from "@/components/insights/LxInfo";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users, Briefcase, GraduationCap, TrendingUp,
  Download, RefreshCw, ClipboardList, Search,
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

const QUERY_KEY_BASE = "prep_poc_heatmap_v3";

const STORAGE_KEY_LMP = "heatmap_visible_sections_v1";
const STORAGE_KEY_STUDENT = "heatmap_visible_sections_student_v1";
const STORAGE_KEY_DOMAIN = "heatmap_visible_sections_domain_v1";

const ALL_STUDENT_SECTION_KEYS = STUDENT_SECTION_CONFIG.map((s) => s.key);
const ALL_DOMAIN_SECTION_KEYS = DOMAIN_SECTION_CONFIG.map((s) => s.key);

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
    accent: A_NEUTRAL,
    headerBg: "rgba(250, 250, 249, 0.95)",
    subheaderBg: "var(--lx-surface)",
    cols: [
      {
        dataKey: "totalLmpLoad", metricKey: "total", colType: "heat",
        label: "Total", subLabel: "(Till Today)", minWidth: 68,
        palette: P_NEUTRAL, totalAccent: A_NEUTRAL,
        tooltip: "Distinct LMPs assigned to this POC as Primary or Support (all time).",
      },
      {
        dataKey: "currentLmpCount", metricKey: "current", colType: "heat",
        label: "Current", subLabel: "(Ongoing)", minWidth: 68,
        palette: P_NEUTRAL, totalAccent: A_NEUTRAL,
        tooltip: "LMPs currently in Not Started, Prep Ongoing or Prep Done.",
      },
      {
        dataKey: "closedLmpCount", metricKey: "closed", colType: "heat",
        label: "Closed", minWidth: 60,
        palette: P_NEUTRAL, totalAccent: A_NEUTRAL,
        tooltip: "LMPs with no remaining current Prep work (Converted + Not Converted + On Hold + Other Reasons).",
      },
    ],
  },
  {
    key: "activePrep",
    label: "ACTIVE PREP",
    icon: RefreshCw,
    accent: A_SKY,
    headerBg: "rgba(240, 249, 255, 0.45)",
    subheaderBg: "rgba(240, 249, 255, 0.22)",
    cols: [
      {
        dataKey: "notStartedCount", metricKey: "notStarted", colType: "heat",
        label: "Not Started", minWidth: 78,
        palette: P_SKY, totalAccent: A_SKY,
        tooltip: "LMPs assigned but preparation has not yet begun.",
      },
      {
        dataKey: "prepOngoingCount", metricKey: "prepOngoing", colType: "heat",
        label: "Prep Ongoing", minWidth: 90,
        palette: P_SKY, totalAccent: A_SKY,
        tooltip: "Prep currently in progress.",
      },
      {
        dataKey: "prepDoneCount", metricKey: "prepDone", colType: "heat",
        label: "Prep Done", minWidth: 78,
        palette: P_SKY, totalAccent: A_SKY,
        tooltip: "Prep marked complete, candidate handed to rounds.",
      },
      {
        dataKey: "onHoldCount", metricKey: "onHold", colType: "heat",
        label: "On Hold", minWidth: 72,
        palette: P_ON_HOLD, totalAccent: A_ORANGE,
        tooltip: "LMPs currently mapped to On Hold status. Shown here for operational visibility — excluded from the conversion denominator and existing load calculations are unchanged.",
      },
    ],
  },
  {
    key: "closedOutcomes",
    label: "CLOSED OUTCOMES",
    icon: TrendingUp,
    accent: A_SAGE,
    headerBg: "rgba(242, 246, 241, 0.55)",
    subheaderBg: "rgba(242, 246, 241, 0.3)",
    cols: [
      {
        dataKey: "convertedCount", metricKey: "converted", colType: "heat",
        label: "Converted", minWidth: 80,
        palette: P_SAGE, totalAccent: A_SAGE,
        tooltip: "Successful conversions credited to this POC.",
      },
      {
        dataKey: "notConvertedCount", metricKey: "notConverted", colType: "heat",
        label: "Not Converted", minWidth: 96,
        palette: P_CORAL, totalAccent: A_CORAL,
        tooltip: "LMPs that closed with a Not Converted outcome.",
      },
      {
        dataKey: "otherReasonsCount", metricKey: "otherReasons", colType: "heat",
        label: "Other Reasons", minWidth: 96,
        palette: P_ORANGE, totalAccent: A_ORANGE,
        tooltip: "Closed for reasons other than Converted or Not Converted (e.g. role pulled, candidate withdrew).",
      },
    ],
  },
  {
    key: "responsibility",
    label: "RESPONSIBILITY",
    icon: Users,
    accent: A_PLUM,
    headerBg: "rgba(245, 240, 255, 0.4)",
    subheaderBg: "rgba(245, 240, 255, 0.22)",
    cols: [
      {
        dataKey: "primaryCount", metricKey: "primary", colType: "heat",
        label: "Primary", minWidth: 68,
        palette: P_PLUM, totalAccent: A_PLUM,
        tooltip: "Distinct LMPs where this POC is the Primary Prep owner.",
      },
      {
        dataKey: "supportCount", metricKey: "support", colType: "heat",
        label: "Support", minWidth: 68,
        palette: P_PLUM, totalAccent: A_PLUM,
        tooltip: "Distinct LMPs where this POC is a Support owner.",
      },
    ],
  },
  {
    key: "domainLoad",
    label: "DOMAIN LOAD",
    icon: Briefcase,
    accent: A_TEAL,
    headerBg: "rgba(236, 254, 255, 0.4)",
    subheaderBg: "rgba(236, 254, 255, 0.22)",
    cols: [
      {
        dataKey: "inDomainCount", metricKey: "inDomain", colType: "heat",
        label: "In-domain", minWidth: 80,
        palette: P_TEAL, totalAccent: A_TEAL,
        tooltip: "Primary LMPs matching at least one domain assigned to this POC.",
      },
      {
        dataKey: "crossDomainCount", metricKey: "crossDomain", colType: "heat",
        label: "Cross-domain", minWidth: 92,
        palette: P_TEAL, totalAccent: A_TEAL,
        tooltip: "Primary LMPs outside all domains assigned to this POC.",
      },
    ],
  },
  {
    key: "performance",
    label: "PERFORMANCE",
    icon: BarChart3,
    accent: A_SAGE,
    headerBg: "rgba(242, 246, 241, 0.45)",
    subheaderBg: "rgba(242, 246, 241, 0.22)",
    cols: [
      {
        dataKey: "eligibleClosedCount", metricKey: "lmpConversion", colType: "conversion",
        label: "LMP Conversion", minWidth: 108,
        palette: P_SAGE, totalAccent: A_SAGE,
        tooltip: "Converted ÷ eligible closed LMPs (excludes On Hold). Format: converted/eligible – %.",
      },
      {
        dataKey: "studentsPlaced", metricKey: "studentsPlaced", colType: "heat",
        label: "Students Placed", minWidth: 96,
        palette: P_SAGE, totalAccent: A_SAGE,
        tooltip: "Distinct students with a valid final placement outcome through LMPs attributed to this POC.",
      },
    ],
  },
];

// ── Visibility helpers ────────────────────────────────────────────────────────

function loadVisibleSections(storageKey: string, defaults: string[]): Set<string> {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      if (Array.isArray(arr) && arr.length > 0) return new Set(arr);
    }
  } catch {
    // ignore
  }
  return new Set(defaults);
}

function saveVisibleSections(storageKey: string, set: Set<string>) {
  try {
    localStorage.setItem(storageKey, JSON.stringify([...set]));
  } catch {
    // ignore
  }
}

// ── Helper components ─────────────────────────────────────────────────────────

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
  value, palette, colMax, className, ariaLabel, onOpen, isDark = false,
}: {
  value: number;
  palette: ColorPalette;
  colMax: number;
  className?: string;
  ariaLabel?: string;
  onOpen?: () => void;
  isDark?: boolean;
}) {
  const style = cellStyle(value, colMax, palette, isDark);
  const clickable = value > 0 && Boolean(onOpen);
  return (
    <td
      className={cn("text-center tabular-nums text-[12.5px] font-semibold transition-colors border-b", className)}
      style={{ ...style, borderColor: CELL_BORDER }}
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
  sections,
  visibleSections,
  onToggle,
  onShowAll,
}: {
  sections: Array<{ key: string; label: string }>;
  visibleSections: Set<string>;
  onToggle: (key: string) => void;
  onShowAll: () => void;
}) {
  const allVisible = sections.every((k) => visibleSections.has(k.key));
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
              {sections.length - visibleSections.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-56 p-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--lx-text-3)" }}>
          Visible sections
        </div>
        <div className="space-y-1">
          {sections.map((s) => {
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
      <div className="flex gap-6">
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

export function PrepPocHeatmapCard({
  filteredLmpIds,
  filters,
}: {
  filteredLmpIds?: string[];
  filters?: Record<string, unknown>;
} = {}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeView, setActiveView] = useState<"lmp" | "student" | "domain">("lmp");
  const [selection, setSelection] = useState<HeatmapDrilldownSelection | null>(null);
  const [visibleLmpSections, setVisibleLmpSections] = useState<Set<SectionKey>>(() => loadVisibleSections(STORAGE_KEY_LMP, ALL_SECTION_KEYS) as Set<SectionKey>);
  const [visibleStudentSections, setVisibleStudentSections] = useState<Set<string>>(() => loadVisibleSections(STORAGE_KEY_STUDENT, ALL_STUDENT_SECTION_KEYS));
  const [visibleDomainSections, setVisibleDomainSections] = useState<Set<string>>(() => loadVisibleSections(STORAGE_KEY_DOMAIN, ALL_DOMAIN_SECTION_KEYS));

  const scopeKey = useMemo(
    () => (filteredLmpIds?.length ? [...filteredLmpIds].sort().join(",") : "all"),
    [filteredLmpIds],
  );
  const queryKey = useMemo(() => [QUERY_KEY_BASE, scopeKey] as const, [scopeKey]);
  const scopeLmpIds = useMemo(
    () => (filteredLmpIds?.length ? new Set(filteredLmpIds) : undefined),
    [filteredLmpIds],
  );

  useEffect(() => { saveVisibleSections(STORAGE_KEY_LMP, visibleLmpSections as Set<string>); }, [visibleLmpSections]);
  useEffect(() => { saveVisibleSections(STORAGE_KEY_STUDENT, visibleStudentSections); }, [visibleStudentSections]);
  useEffect(() => { saveVisibleSections(STORAGE_KEY_DOMAIN, visibleDomainSections); }, [visibleDomainSections]);

  const toggleSection = useCallback((key: string) => {
    if (activeView === "lmp") {
      setVisibleLmpSections((prev) => {
        const next = new Set(prev);
        if (next.has(key as SectionKey)) next.delete(key as SectionKey); else next.add(key as SectionKey);
        return next;
      });
      return;
    }
    if (activeView === "student") {
      setVisibleStudentSections((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      return;
    }
    setVisibleDomainSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, [activeView]);

  const showAll = useCallback(() => {
    if (activeView === "lmp") setVisibleLmpSections(new Set(ALL_SECTION_KEYS));
    else if (activeView === "student") setVisibleStudentSections(new Set(ALL_STUDENT_SECTION_KEYS));
    else setVisibleDomainSections(new Set(ALL_DOMAIN_SECTION_KEYS));
  }, [activeView]);

  const visibleSections = activeView === "lmp"
    ? visibleLmpSections
    : activeView === "student"
      ? visibleStudentSections
      : visibleDomainSections;

  const activeSectionConfig: Array<SectionDef | AltSectionDef> = activeView === "lmp"
    ? SECTION_CONFIG
    : activeView === "student"
      ? STUDENT_SECTION_CONFIG
      : DOMAIN_SECTION_CONFIG;

  const { data, isLoading, isError, refetch } = useQuery<FullPrepPocHeatmapResponse>({
    queryKey,
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

      return buildFullHeatmapData(
        (pocsRes.data ?? []) as import("@/lib/prepPocHeatmapAgg").PocRaw[],
        (linksRes.data ?? []) as HeatmapLinkQueryRow[],
        (candidatesRes.data ?? []) as HeatmapCandidateQueryRow[],
        scopeLmpIds,
      );
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });

  // ── Realtime ────────────────────────────────────────────────────────────────
  useRealtimeInvalidate("lmp_processes", queryKey);
  useRealtimeInvalidate("lmp_poc_links" as never, queryKey);
  useRealtimeInvalidate("poc_profiles" as never, queryKey);
  useRealtimeInvalidate("lmp_candidates", queryKey);
  useRealtimeInvalidate("students" as never, queryKey);

  const activeLmpRows = useMemo(() => (data?.rows ?? []).filter((r) => r.totalLmpLoad > 0), [data]);
  const activeStudentRows = useMemo(() => (data?.studentRows ?? []).filter((r) => r.totalStudents > 0), [data]);
  const activeDomainRows = useMemo(() => (data?.domainRows ?? []).filter((r) => r.totalLmps > 0 || r.studentsPlaced > 0), [data]);

  const hasRows = activeView === "lmp"
    ? activeLmpRows.length > 0
    : activeView === "student"
      ? activeStudentRows.length > 0
      : activeDomainRows.length > 0;

  // Per-column max values (heat only; conversion skipped)
  const colMaxValues = useMemo(() => {
    if (activeView === "student") {
      return buildColMaxValues(activeStudentRows, STUDENT_SECTION_CONFIG.flatMap((s) => s.cols.filter((c) => c.colType === "heat").map((c) => c.dataKey)));
    }
    if (activeView === "domain") {
      return buildColMaxValues(activeDomainRows, DOMAIN_SECTION_CONFIG.flatMap((s) => s.cols.filter((c) => c.colType === "heat").map((c) => c.dataKey)));
    }
    const maxFor = (key: keyof PrepPocHeatmapRow) =>
      Math.max(1, ...activeLmpRows.map((r) => (r[key] as number) ?? 0));
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
  }, [activeView, activeLmpRows, activeStudentRows, activeDomainRows]);

  const studentTotals = useMemo(() => (data ? studentTotalsFrom(data) : null), [data]);
  const domainTotals = useMemo(() => (data ? domainTotalsFrom(data) : null), [data]);

  // CSV export — exports active view
  const handleExport = useCallback(() => {
    if (!data) return;
    const { generatedAt } = data;
    const filterMeta = filters ? JSON.stringify(filters) : "none";

    if (activeView === "student") {
      const csvRows = data.studentRows.map((r) => ({
        "POC Name": r.pocName,
        "Total Students": r.totalStudents,
        "Current Students": r.currentStudents,
        "Placed Students": r.placedStudentsLoad,
        "Not Started": r.notStartedCount,
        "Prep Ongoing": r.prepOngoingCount,
        "Prep Done": r.prepDoneCount,
        Placed: r.placedCount,
        "Not Placed": r.notPlacedCount,
        "On hold": r.onHoldCount,
        "Other reasons": r.otherReasonsCount,
        "Placement Rate": r.placementRatePct != null ? `${r.placementRatePct.toFixed(1)}%` : "—",
        "Avg. Sessions Per Student": "—",
      }));
      csvRows.push({} as never);
      csvRows.push({ "POC Name": `Exported At: ${generatedAt}` } as never);
      csvRows.push({ "POC Name": `Selected View: Student-wise` } as never);
      csvRows.push({ "POC Name": `Applied Filters: ${filterMeta}` } as never);
      downloadCsv(`prep-poc-heatmap-student-wise-${dateStamp()}.csv`, csvRows, [
        "POC Name", "Total Students", "Current Students", "Placed Students",
        "Not Started", "Prep Ongoing", "Prep Done", "Placed", "Not Placed", "On hold", "Other reasons",
        "Placement Rate", "Avg. Sessions Per Student",
      ]);
      return;
    }

    if (activeView === "domain") {
      const csvRows = data.domainRows.map((r) => ({
        Domain: r.domainName,
        "Total LMPs": r.totalLmps,
        "Current LMPs": r.currentLmps,
        "Closed LMPs": r.closedLmps,
        "Not Started": r.notStartedCount,
        "Prep Ongoing": r.prepOngoingCount,
        "Prep Done": r.prepDoneCount,
        Placed: r.placedCount,
        "Not Placed": r.notPlacedCount,
        "On hold": r.onHoldCount,
        "Other reasons": r.otherReasonsCount,
        "Students Placed": r.studentsPlaced,
        "Placement Rate": r.placementRatePct != null ? `${r.placementRatePct.toFixed(1)}%` : "—",
        "LMP Conversion": r.lmpConversionPercentage != null ? `${r.convertedCount}/${r.eligibleClosedCount} · ${r.lmpConversionPercentage.toFixed(0)}%` : "—",
      }));
      csvRows.push({} as never);
      csvRows.push({ Domain: `Exported At: ${generatedAt}` } as never);
      csvRows.push({ Domain: `Selected View: Domain-wise` } as never);
      csvRows.push({ Domain: `Applied Filters: ${filterMeta}` } as never);
      downloadCsv(`prep-poc-heatmap-domain-wise-${dateStamp()}.csv`, csvRows, [
        "Domain", "Total LMPs", "Current LMPs", "Closed LMPs",
        "Not Started", "Prep Ongoing", "Prep Done", "Placed", "Not Placed", "On hold", "Other reasons",
        "Students Placed", "Placement Rate", "LMP Conversion",
      ]);
      return;
    }

    const { rows, summary } = data;
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
    csvRows.push({ "POC Name": `Selected View: LMP-wise` } as never);
    csvRows.push({ "POC Name": `Applied Filters: ${filterMeta}` } as never);
    csvRows.push({ "POC Name": `Active POCs: ${summary.activePocCount} | Unique LMPs: ${summary.uniqueLmpCount} | Converted LMP %: ${summary.convertedLmpPercentage !== null ? `${summary.convertedLmpPercentage.toFixed(1)}%` : "—"}` } as never);
    downloadCsv(`prep-poc-heatmap-lmp-wise-${dateStamp()}.csv`, csvRows, [
      "POC Name", "Total LMPs", "Current LMPs", "Closed LMPs",
      "Not Started", "Prep Ongoing", "Prep Done", "On Hold",
      "Converted", "Not Converted", "Other Reasons",
      "Primary", "Support", "In-domain", "Cross-domain",
      "Converted Count", "Eligible Closed Count", "LMP Conversion %", "Students Placed",
    ]);
  }, [data, activeView, filters]);

  // Totals row values (LMP-wise)
  const totals = useMemo((): TotalsShape | null => {
    if (!data || activeView !== "lmp") return null;
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
  }, [data, activeView]);

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
    () => activeSectionConfig.filter((s) => visibleSections.has(s.key)),
    [activeSectionConfig, visibleSections],
  );
  const noSections = visibleConfig.length === 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="rounded-2xl border overflow-hidden"
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
                  className="px-3.5 text-[12.5px] font-semibold transition-colors border-r last:border-r-0 focus-visible:outline-none focus-visible:ring-2"
                  style={{
                    borderColor: "var(--lx-border)",
                    background: activeView === tab.id ? "var(--lx-surface)" : "transparent",
                    color: activeView === tab.id ? "var(--lx-orange)" : "var(--lx-text-2)",
                    boxShadow: activeView === tab.id ? "0 1px 3px rgba(26,25,22,0.08)" : undefined,
                    "--tw-ring-color": "var(--lx-orange)",
                  } as React.CSSProperties}
                  aria-pressed={activeView === tab.id}
                  role="tab"
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Columns visibility */}
            <ColumnsPopover
              sections={activeSectionConfig.map((s) => ({ key: s.key, label: s.label }))}
              visibleSections={visibleSections as Set<string>}
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
        {!isLoading && data && activeView === "lmp" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-gutter mt-4">
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
        {!isLoading && data && activeView === "student" && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-gutter mt-4">
            <KpiCard icon={Users} label="Active POCs" value={data.studentSummary.activePocCount}
              accentCss="var(--lx-orange)" tooltip="Distinct active Prep POCs with student workload in scope." />
            <KpiCard icon={GraduationCap} label="Unique Students" value={data.studentSummary.uniqueStudents}
              accentCss="var(--lx-yellow)" tooltip="Distinct students linked to the selected Prep scope." />
            <KpiCard icon={GraduationCap} label="Students Placed" value={data.studentSummary.studentsPlaced}
              accentCss="var(--lx-success)" tooltip="Distinct students with a valid final placement outcome." />
            <KpiCard icon={TrendingUp} label="Placed Students %"
              value={data.studentSummary.placedStudentsPct != null ? `${data.studentSummary.placedStudentsPct.toFixed(0)}%` : "—"}
              accentCss="var(--lx-info)" tooltip="Students Placed ÷ Unique Students × 100." />
          </div>
        )}
        {!isLoading && data && activeView === "domain" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-gutter mt-4">
            <KpiCard icon={Briefcase} label="Active Domains" value={data.domainSummary.activeDomains}
              accentCss="var(--lx-orange)" tooltip="Domains present in the filtered scope." />
            <KpiCard icon={Briefcase} label="Total LMPs" value={data.domainSummary.totalLmps}
              accentCss="var(--lx-yellow)" tooltip="Globally unique LMPs in the filtered scope." />
            <KpiCard icon={GraduationCap} label="Total Students" value={data.domainSummary.totalStudents}
              accentCss="var(--lx-teal)" tooltip="Distinct students who selected or opted for a domain." />
            <KpiCard icon={GraduationCap} label="Students Placed" value={data.domainSummary.studentsPlaced}
              accentCss="var(--lx-success)" tooltip="Distinct students with a valid final placement outcome." />
            <KpiCard icon={TrendingUp} label="Placement Rate"
              value={data.domainSummary.placementRatePct != null ? `${data.domainSummary.placementRatePct.toFixed(0)}%` : "—"}
              accentCss="var(--lx-info)" tooltip="Students Placed ÷ Total Students × 100." />
          </div>
        )}
        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-gutter mt-4 animate-pulse">
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

        {!isLoading && !isError && data && !hasRows && (
          <div className="py-10 text-center">
            <p className="text-[14px]" style={{ color: "var(--lx-text-3)" }}>
              No Prep POC workload data available for the selected filters.
            </p>
          </div>
        )}

        {!isLoading && !isError && data && hasRows && (
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
              ) : activeView === "lmp" ? (
                <>
                  <div className="lg:hidden" data-testid="heatmap-mobile-summary">
                    <div className="px-4 py-3 border-b text-[11px] font-semibold uppercase tracking-wide text-muted-foreground" style={{ borderColor: CELL_BORDER }}>
                      POC · Current LMPs
                    </div>
                    <ol className="divide-y" style={{ borderColor: CELL_BORDER }}>
                      {[...activeLmpRows]
                        .sort((a, b) => b.currentLmpCount - a.currentLmpCount)
                        .map((row, idx) => (
                          <li key={row.pocId}>
                            <button
                              type="button"
                              onClick={() => openDrilldown(row, "currentLmpCount", row.currentLmpCount, row.currentLmpCount)}
                              className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] text-left hover:bg-muted/50 transition-colors"
                            >
                              <span className="w-6 text-[11px] font-bold tabular-nums text-muted-foreground">{idx + 1}</span>
                              <span className="flex-1 min-w-0 font-semibold text-[13px] truncate">{row.pocName}</span>
                              <span className="shrink-0 min-w-[44px] text-center rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums bg-muted">
                                {row.currentLmpCount}
                              </span>
                            </button>
                          </li>
                        ))}
                    </ol>
                  </div>
                  <div className="hidden lg:block overflow-x-auto">
                <table
                  className="w-full border-separate text-[12px]"
                  style={{ borderSpacing: 0, minWidth: 900, border: "0.5px solid var(--lx-border)" }}
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
                        className="text-left align-bottom px-4 pb-3 pt-4 text-[11px] font-semibold uppercase border-r border-b"
                        style={{
                          color: "var(--lx-text-3)",
                          letterSpacing: "0.04em",
                          position: "sticky", left: 0, zIndex: 3,
                          background: "var(--lx-surface)",
                          borderColor: CELL_BORDER,
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
                            className="text-center px-2 py-2.5 text-[11px] font-semibold uppercase border-b"
                            style={{
                              color: s.accent,
                              background: sectionHeaderBg(s.accent, s.headerBg, isDark),
                              letterSpacing: "0.04em",
                              borderTop: `2px solid ${s.accent}`,
                              borderLeft: `0.5px solid color-mix(in srgb, ${s.accent} 18%, transparent)`,
                              borderRight: `0.5px solid color-mix(in srgb, ${s.accent} 18%, transparent)`,
                              borderBottom: `1px solid ${CELL_BORDER}`,
                            }}
                          >
                            <span className="inline-flex items-center justify-center gap-1.5">
                              <span className="h-5 w-5 rounded-lg inline-flex items-center justify-center"
                                style={{ background: `color-mix(in srgb, ${s.accent} 8%, transparent)` }}>
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
                              background: sectionSubheaderBg(s.accent, s.subheaderBg, isDark),
                              borderColor: CELL_BORDER,
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
                    {activeLmpRows.map((row) => (
                      <DataRow
                        key={row.pocId}
                        row={row}
                        colMaxValues={colMaxValues}
                        visibleConfig={visibleConfig as SectionDef[]}
                        onOpenDrilldown={openDrilldown}
                        isDark={isDark}
                      />
                    ))}
                    {totals && (
                      <TotalRow totals={totals} visibleConfig={visibleConfig as SectionDef[]} isDark={isDark} />
                    )}
                  </tbody>
                </table>
                  </div>
                </>
              ) : (
                <ResponsiveHeatmapTable
                  rowHeader={activeView === "student" ? "POC" : "DOMAIN"}
                  rows={
                    activeView === "student"
                      ? activeStudentRows.map((r) => ({ id: r.pocId, label: r.pocName, row: r }))
                      : activeDomainRows.map((r) => ({ id: r.domainId, label: r.domainName, row: r }))
                  }
                  totals={(activeView === "student" ? studentTotals : domainTotals) ?? {}}
                  visibleConfig={visibleConfig as AltSectionDef[]}
                  colMaxValues={colMaxValues}
                />
              )}
            </div>

            {/* Footer: heat intensity legend */}
            <div className="flex flex-wrap items-center gap-3 mt-2 px-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{ color: "var(--lx-text-3)" }}>
                <span>Heat intensity (relative to column max)</span>
                <span className="flex items-center gap-1 ml-1">
                  <span className="text-[10px]">Low</span>
                  {(isDark ? LEGEND_LEVELS_DARK : LEGEND_LEVELS).map((bg, i) => (
                    <span key={i} className="inline-block w-3.5 h-3.5 rounded-sm border"
                      style={{ background: bg, borderColor: CELL_BORDER }} />
                  ))}
                  <span className="text-[10px]">High</span>
                </span>
                <span className="text-[10px]" style={{ color: "var(--lx-text-3)" }}>
                  Heat intensity is relative to the maximum value in each column.
                </span>
              </div>
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
  row, colMaxValues, visibleConfig, onOpenDrilldown, isDark = false,
}: {
  row: PrepPocHeatmapRow;
  colMaxValues: Record<string, number>;
  visibleConfig: SectionDef[];
  onOpenDrilldown: (row: PrepPocHeatmapRow, metricKey: HeatmapMetricKey, displayedValue: number | string, displayedCount: number | null) => void;
  isDark?: boolean;
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
          borderColor: CELL_BORDER,
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
            const convColor = !hasEligible
              ? MUTED_TEXT
              : isGood
                ? (isDark ? "#86EFAC" : T_SAGE)
                : (isDark ? "#FDA4AF" : T_CORAL);
            return (
              <td
                key={col.metricKey}
                className="text-center text-[12px] font-semibold tabular-nums border-b transition-colors"
                style={{
                  background: "var(--lx-surface)",
                  color: convColor,
                  borderColor: CELL_BORDER,
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
              isDark={isDark}
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
  totals, visibleConfig, isDark = false,
}: {
  totals: TotalsShape;
  visibleConfig: SectionDef[];
  isDark?: boolean;
}) {
  return (
    <tr>
      <td
        className="px-4 py-2.5 text-[11px] font-bold uppercase border-r"
        style={{
          color: "var(--lx-text-2)",
          letterSpacing: "0.04em",
          position: "sticky", left: 0, zIndex: 1,
          background: "var(--lx-soft)",
          borderTop: "1px solid var(--lx-border)",
          borderColor: CELL_BORDER,
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
                  color: totals.eligibleClosedCount > 0 ? col.totalAccent : MUTED_TEXT,
                  borderTop: "1px solid var(--lx-border)",
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
                color: value > 0 ? col.totalAccent : MUTED_TEXT,
                borderTop: "1px solid var(--lx-border)",
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
  data: FullPrepPocHeatmapResponse;
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
        <DialogHeader className="border-b border-border bg-card px-6 py-5 text-left">
          <DialogTitle className="text-[21px] font-bold tracking-[-0.02em] text-foreground">
            {selection ? `${selection.pocName} · ${selection.metricLabel}` : "Heatmap details"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] text-muted-foreground">
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

        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-card px-6 py-3">
          <label className="relative min-w-[240px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
              placeholder="Search records..."
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20"
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
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground shadow-sm transition hover:bg-muted disabled:opacity-40"
          >
            <Download size={14} /> Download CSV
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/30 px-6 py-4">
          {result?.recordType === "conversion" && (
            <div className="mb-4 grid gap-x-6 gap-y-gutter sm:grid-cols-3">
              <MetricSummaryCard label="Converted LMPs" value={result.convertedLmps.length} tone="green" />
              <MetricSummaryCard label="Eligible Closed LMPs" value={result.denominatorLmps.length} tone="slate" />
              <MetricSummaryCard label="Conversion" value={fmtConversion(result.convertedLmps.length, result.denominatorLmps.length, result.denominatorLmps.length ? (result.convertedLmps.length / result.denominatorLmps.length) * 100 : null)} tone="green" />
            </div>
          )}
          {!result || originalCount === 0 ? (
            <div className="rounded-2xl border border-border bg-card px-6 py-10 text-center text-[13px] text-muted-foreground">
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

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-6 py-3 text-[12px] text-muted-foreground">
          <span>
            Showing {modalRows.length ? (safePage - 1) * pageSize + 1 : 0}–{Math.min(safePage * pageSize, modalRows.length)} of {modalRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1}
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground disabled:opacity-40">
              Previous
            </button>
            <span>Page {safePage} / {totalPages}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage >= totalPages}
              className="rounded-lg border border-border px-3 py-1.5 font-medium text-foreground disabled:opacity-40">
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[980px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-muted text-[10.5px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {["LMP / Company", "Process ID", "Domain", "Primary POC", "Support POC", "Status", "Students", "Created", "Updated", "Actions"].map((h) => (
              <th key={h} className="border-b border-border px-3 py-3 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lmpId} className="border-b border-border last:border-b-0 hover:bg-muted/50">
              <td className="px-3 py-3"><div className="font-semibold text-foreground">{r.company || "Untitled"}</div><div className="text-muted-foreground">{r.role || "No role"}</div></td>
              <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{r.lmpCode || r.lmpId}</td>
              <td className="px-3 py-3 text-foreground">{r.domain || "Unmapped"}</td>
              <td className="px-3 py-3 text-foreground">{r.primaryPoc || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.supportPoc || "—"}</td>
              <td className="px-3 py-3">
                <span className="rounded-full bg-muted px-2 py-1 font-semibold text-foreground">{r.statusLabel}</span>
                {r.outcomeReason && <div className="mt-1 text-[11px] text-muted-foreground">{r.outcomeReason}</div>}
              </td>
              <td className="px-3 py-3 text-foreground">{r.studentsMapped} mapped · {r.studentsPlaced} placed</td>
              <td className="px-3 py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
              <td className="px-3 py-3 text-muted-foreground">{formatDate(r.updatedAt)}</td>
              <td className="px-3 py-3">
                <button type="button" onClick={() => onView(r.lmpId)}
                  className="rounded-lg border border-border px-2.5 py-1.5 font-semibold text-foreground hover:bg-muted">
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
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <table className="w-full min-w-[920px] text-left text-[12px]">
        <thead className="sticky top-0 z-10 bg-muted text-[10.5px] uppercase tracking-wide text-muted-foreground">
          <tr>
            {["Student", "Student ID", "Email", "Phone", "Primary Domain", "Secondary Domain", "Cohort", "Placed Company", "LMP", "Domain", "Placement", "Primary POC", "Support POC"].map((h) => (
              <th key={h} className="border-b border-border px-3 py-3 font-bold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.studentId} className="border-b border-border last:border-b-0 hover:bg-muted/50">
              <td className="px-3 py-3 font-semibold text-foreground">{r.studentName}</td>
              <td className="px-3 py-3 font-mono text-[11px] text-muted-foreground">{r.studentCode || r.studentId}</td>
              <td className="px-3 py-3 text-foreground">{r.email || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.phone || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.primaryDomain || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.secondaryDomain || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.cohort || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.company || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.lmpCode || r.lmpId}</td>
              <td className="px-3 py-3 text-foreground">{r.domain || "Unmapped"}</td>
              <td className="px-3 py-3 text-foreground">{r.placementStatus} · {formatDate(r.placementDate)}</td>
              <td className="px-3 py-3 text-foreground">{r.primaryPoc || "—"}</td>
              <td className="px-3 py-3 text-foreground">{r.supportPoc || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortSelect({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-muted-foreground shadow-sm">
      <ArrowUpDown size={13} />
      <select value={value} onChange={(e) => onChange(e.target.value)} className="bg-transparent text-foreground outline-none">
        {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    </label>
  );
}

function MetricSummaryCard({ label, value, tone }: { label: string; value: string | number; tone: "green" | "slate" }) {
  return (
    <div className={cn(
      "rounded-2xl border px-4 py-3",
      tone === "green"
        ? "border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200"
        : "border-border bg-card text-foreground",
    )}>
      <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
    </div>
  );
}

function ContextChip({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
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
