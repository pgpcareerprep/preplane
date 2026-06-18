/**
 * PrepPocHeatmapCard
 *
 * Live "Prep POC Heatmap" replacing the old LxHeatmap section.
 * Fully self-contained: fetches its own data, wires realtime subscriptions,
 * provides KPI summary row, grouped column headers, heatmap intensity styling,
 * CSV export, and responsive horizontal scroll.
 *
 * Data sources:
 *   poc_profiles   — active Prep POCs + domain configuration
 *   lmp_poc_links  — POC-to-LMP assignments (prep / support role)
 *   lmp_processes  — LMP status and domain_id
 *   domains        — canonical domain name (joined via lmp_processes.domain_id)
 *   lmp_candidates — student_id for placed-student counting
 *
 * Status treatment for "On hold":
 *   Counted as Closed in the LMP Load column (matching the reference visual)
 *   but excluded from the LMP Conversion denominator (it is not a final outcome).
 *
 * Domain Load applies to Primary (prep-role) LMP assignments only.
 */

import { useMemo, useState, useCallback } from "react";
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
import {
  Users, Briefcase, GraduationCap, TrendingUp,
  Download, RefreshCw, WifiOff, ClipboardList, Search, ArrowUpDown,
} from "lucide-react";

// ── Query-response types (narrow, no 'as any' escape hatch) ──────────────────

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
  pipeline_stage: string | null;
  students: {
    id: string;
    name: string;
    student_code: string | null;
    cohort: string | null;
    primary_domain: string | null;
  } | null;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const QUERY_KEY = ["prep_poc_heatmap_v3"] as const;

// Pastel heatmap colors: [level0, level1, level2, level3, level4]
// level0 = zero value; levels 1-4 = light → strong pastel
type ColorPalette = { bg: string[]; text: string[] };

const PALETTE: Record<string, ColorPalette> = {
  slate: {
    bg: ["#fbfcfd", "#f5f7fa", "#e9eef5", "#d5deea", "#b8c5d4"],
    text: ["#9aa6b2", "#475569", "#334155", "#1f2937", "#172033"],
  },
  blue: {
    bg: ["#fbfdff", "#f1f7ff", "#e3efff", "#c6dcfb", "#9fc2f3"],
    text: ["#9aa6b2", "#1e3a8a", "#1e40af", "#17356f", "#102a56"],
  },
  green: {
    bg: ["#fbfdfb", "#f3fbf5", "#e2f5e7", "#bee7c9", "#8fd4a5"],
    text: ["#9aa6b2", "#166534", "#166534", "#14532d", "#0f3f25"],
  },
  red: {
    bg: ["#fbfcfd", "#fff6f3", "#fee7df", "#f7c4b6", "#ee9c88"],
    text: ["#9aa6b2", "#9a3412", "#9f1239", "#7c2d12", "#5f1b10"],
  },
  neutral: {
    bg: ["#fbfcfd", "#f8f7f5", "#eeeae5", "#ddd6cd", "#c7baad"],
    text: ["#9aa6b2", "#44403c", "#44403c", "#292524", "#231f1a"],
  },
  amber: {
    bg: ["#fbfcfd", "#fff8ed", "#fdebc8", "#f8d69a", "#efbd6f"],
    text: ["#9aa6b2", "#92400e", "#78350f", "#6b350b", "#4d2608"],
  },
  purple: {
    bg: ["#fbfcfd", "#f8f5ff", "#eee8fb", "#d7c7f4", "#bda5ea"],
    text: ["#9aa6b2", "#4c1d95", "#4c1d95", "#3b0764", "#281052"],
  },
  teal: {
    bg: ["#fbfcfd", "#f0fbfb", "#d9f4f3", "#b5e6e4", "#83d5d1"],
    text: ["#9aa6b2", "#134e4a", "#134e4a", "#0f3e37", "#0b332f"],
  },
};

const GROUP_SURFACE: Record<string, string> = {
  lmpLoad: "linear-gradient(180deg, #f8fafc 0%, #eef3f8 100%)",
  activePrep: "linear-gradient(180deg, #f4f8ff 0%, #eaf3ff 100%)",
  closedOutcomes: "linear-gradient(180deg, #f4fbf5 0%, #fff5ee 100%)",
  responsibility: "linear-gradient(180deg, #faf7ff 0%, #f1eafd 100%)",
  domainLoad: "linear-gradient(180deg, #f2fbfb 0%, #e7f7f7 100%)",
  performance: "linear-gradient(180deg, #f4fbf5 0%, #edf8f0 100%)",
};

function intensityLevel(value: number, colMax: number): 0 | 1 | 2 | 3 | 4 {
  if (value === 0 || colMax === 0) return 0;
  const ratio = value / colMax;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

function cellStyle(value: number, colMax: number, palette: ColorPalette) {
  const lvl = intensityLevel(value, colMax);
  return {
    background: palette.bg[lvl],
    color: palette.text[lvl],
  };
}

// ── Column metadata ───────────────────────────────────────────────────────────

type ColDef = {
  key: keyof PrepPocHeatmapRow;
  metricKey: HeatmapMetricKey;
  label: string;
  subLabel?: string;
  palette: ColorPalette;
  tooltip: string;
  minWidth: number;
};

const COLUMN_GROUPS = [
  {
    key: "lmpLoad",
    label: "LMP LOAD",
    icon: ClipboardList,
    color: "#64748b",
    cols: [
      {
        key: "totalLmpLoad" as keyof PrepPocHeatmapRow,
        metricKey: "total",
        label: "Total",
        subLabel: "(Till Today)",
        palette: PALETTE.slate,
        tooltip: "Distinct LMPs assigned to this POC as Primary or Support (all time).",
        minWidth: 68,
      },
      {
        key: "currentLmpCount" as keyof PrepPocHeatmapRow,
        metricKey: "current",
        label: "Current",
        subLabel: "(Ongoing)",
        palette: PALETTE.slate,
        tooltip: "LMPs currently in Not Started, Prep Ongoing or Prep Done.",
        minWidth: 68,
      },
      {
        key: "closedLmpCount" as keyof PrepPocHeatmapRow,
        metricKey: "closed",
        label: "Closed",
        subLabel: undefined,
        palette: PALETTE.slate,
        tooltip: "LMPs with no remaining current Prep work (Converted + Not Converted + On hold + Other reasons).",
        minWidth: 60,
      },
    ] as ColDef[],
  },
  {
    key: "activePrep",
    label: "ACTIVE PREP",
    icon: RefreshCw,
    color: "#3b82f6",
    cols: [
      {
        key: "notStartedCount" as keyof PrepPocHeatmapRow,
        metricKey: "notStarted",
        label: "Not Started",
        palette: PALETTE.blue,
        tooltip: "LMPs assigned but preparation has not yet begun.",
        minWidth: 78,
      },
      {
        key: "prepOngoingCount" as keyof PrepPocHeatmapRow,
        metricKey: "prepOngoing",
        label: "Prep Ongoing",
        palette: PALETTE.blue,
        tooltip: "Prep currently in progress.",
        minWidth: 90,
      },
      {
        key: "prepDoneCount" as keyof PrepPocHeatmapRow,
        metricKey: "prepDone",
        label: "Prep Done",
        palette: PALETTE.blue,
        tooltip: "Prep marked complete, candidate handed to rounds.",
        minWidth: 78,
      },
    ] as ColDef[],
  },
  {
    key: "closedOutcomes",
    label: "CLOSED OUTCOMES",
    icon: TrendingUp,
    color: "#22c55e",
    cols: [
      {
        key: "convertedCount" as keyof PrepPocHeatmapRow,
        metricKey: "converted",
        label: "Converted",
        palette: PALETTE.green,
        tooltip: "Successful conversions credited to this POC.",
        minWidth: 80,
      },
      {
        key: "notConvertedCount" as keyof PrepPocHeatmapRow,
        metricKey: "notConverted",
        label: "Not Converted",
        palette: PALETTE.red,
        tooltip: "LMPs that closed with a Not Converted outcome.",
        minWidth: 96,
      },
      {
        key: "onHoldCount" as keyof PrepPocHeatmapRow,
        metricKey: "onHold",
        label: "On hold",
        palette: PALETTE.neutral,
        tooltip: "LMPs currently mapped to the On hold status. Excluded from conversion rate denominator.",
        minWidth: 68,
      },
      {
        key: "otherReasonsCount" as keyof PrepPocHeatmapRow,
        metricKey: "otherReasons",
        label: "Other reasons",
        palette: PALETTE.amber,
        tooltip: "Closed for reasons other than conversion or Not Converted (e.g. role pulled, candidate withdrew).",
        minWidth: 96,
      },
    ] as ColDef[],
  },
  {
    key: "responsibility",
    label: "RESPONSIBILITY",
    icon: Users,
    color: "#7c3aed",
    cols: [
      {
        key: "primaryCount" as keyof PrepPocHeatmapRow,
        metricKey: "primary",
        label: "Primary",
        palette: PALETTE.purple,
        tooltip: "Distinct LMPs where this POC is the Primary Prep owner.",
        minWidth: 68,
      },
      {
        key: "supportCount" as keyof PrepPocHeatmapRow,
        metricKey: "support",
        label: "Support",
        palette: PALETTE.purple,
        tooltip: "Distinct LMPs where this POC is a Support owner.",
        minWidth: 68,
      },
    ] as ColDef[],
  },
  {
    key: "domainLoad",
    label: "DOMAIN LOAD",
    icon: Briefcase,
    color: "#14b8a6",
    cols: [
      {
        key: "inDomainCount" as keyof PrepPocHeatmapRow,
        metricKey: "inDomain",
        label: "In-domain",
        palette: PALETTE.teal,
        tooltip: "Primary LMPs matching at least one domain assigned to this POC.",
        minWidth: 80,
      },
      {
        key: "crossDomainCount" as keyof PrepPocHeatmapRow,
        metricKey: "crossDomain",
        label: "Cross-domain",
        palette: PALETTE.amber,
        tooltip: "Primary LMPs outside all domains assigned to this POC.",
        minWidth: 92,
      },
    ] as ColDef[],
  },
];

// Performance columns are rendered separately due to custom formatting
const PERF_COLS = {
  conversion: {
    label: "LMP Conversion",
    tooltip: "Converted ÷ eligible closed LMPs (excludes On hold). Format: converted/eligible - %.",
    minWidth: 108,
  },
  studentsPlaced: {
    label: "Students Placed",
    tooltip: "Distinct students with a valid final placement outcome through LMPs attributed to this POC. The overall total counts each student once.",
    minWidth: 96,
  },
};

// Flat column list for max computation
const ALL_COLS: ColDef[] = COLUMN_GROUPS.flatMap((g) => g.cols);

// ── Live badge ────────────────────────────────────────────────────────────────

function LiveBadge({ isFetching, isError }: { isFetching: boolean; isError: boolean }) {
  if (isError) {
    return (
      <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border"
        style={{ background: "#fff1f2", borderColor: "#fecaca", color: "#dc2626" }}>
        <WifiOff size={10} />
        Error
      </span>
    );
  }
  if (isFetching) {
    return (
      <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border"
        style={{ background: "#fffbeb", borderColor: "#fde68a", color: "#d97706" }}>
        <RefreshCw size={10} className="animate-spin" />
        Refreshing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-medium border"
      style={{ background: "#f0fdf4", borderColor: "#bbf7d0", color: "#15803d" }}>
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Live
    </span>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon, label, value, color, tooltip,
}: {
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string | number;
  color: string;
  tooltip: string;
}) {
  return (
    <div className="flex items-center gap-3 flex-1 min-w-[130px] rounded-2xl border bg-white px-4 py-3"
      style={{ borderColor: "#e7edf4", boxShadow: "0 10px 28px rgba(15, 23, 42, 0.045)" }}>
      <span className="shrink-0 h-10 w-10 rounded-2xl flex items-center justify-center"
        style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}18` }}>
        <Icon size={18} style={{ color }} />
      </span>
      <div className="min-w-0">
        <div className="text-[22px] font-bold leading-none tabular-nums" style={{ color: "#1e293b" }}>
          {value}
        </div>
        <div className="mt-1 text-[11.5px] font-medium inline-flex items-center gap-1" style={{ color: "#64748b" }}>
          <span>{label}</span>
          <LxInfo text={tooltip} size={11} />
        </div>
      </div>
    </div>
  );
}

// ── Cell rendering ────────────────────────────────────────────────────────────

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
      className={cn(
        "text-center tabular-nums text-[13px] font-semibold border border-white/80 transition-all group-hover:bg-blend-multiply",
        className,
      )}
      style={{
        ...style,
        boxShadow: value > 0 ? "inset 0 0 0 1px rgba(15, 23, 42, 0.025)" : undefined,
      }}
    >
      {clickable ? (
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={onOpen}
          className="h-full min-h-[34px] w-full rounded-lg px-2 py-2 font-semibold tabular-nums transition-all hover:-translate-y-0.5 hover:bg-white/30 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1"
        >
          {value}
        </button>
      ) : (
        <span className="inline-flex min-h-[34px] items-center justify-center px-2 py-2">
          {value}
        </span>
      )}
    </td>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function HeatmapSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-16 flex-1 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="h-8 bg-slate-100 rounded" />
      <div className="h-8 bg-slate-100 rounded" />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-10 bg-slate-50 rounded" />
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PrepPocHeatmapCard() {
  const [activeView, setActiveView] = useState<"lmp" | "student" | "domain">("lmp");
  const [selection, setSelection] = useState<HeatmapDrilldownSelection | null>(null);

  // ── Data fetch ──────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<PrepPocHeatmapResponse>({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const [pocsRes, linksRes, candidatesRes] = await Promise.all([
        supabase
          .from("poc_profiles")
          .select("id, name, primary_domain, domain_tags")
          .eq("role_type", "prep_poc")
          .eq("status", "active"),
        supabase
          .from("lmp_poc_links")
          .select("poc_id, role, lmp_id, lmp_processes(id, lmp_code, company, role, status, domain_id, domain_raw, daily_progress, created_at, updated_at, domains(name))")
          .in("role", ["prep", "support"]),
        supabase
          .from("lmp_candidates")
          .select("lmp_id, student_id, student_name, pipeline_stage, students(id, name, student_code, cohort, primary_domain)")
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

  // ── Realtime subscriptions ──────────────────────────────────────────────────
  useRealtimeInvalidate("lmp_processes", [QUERY_KEY]);
  useRealtimeInvalidate("lmp_poc_links" as never, [QUERY_KEY]);
  useRealtimeInvalidate("poc_profiles" as never, [QUERY_KEY]);
  useRealtimeInvalidate("lmp_candidates", [QUERY_KEY]);

  // ── Per-column max values for heat intensity ────────────────────────────────
  const colMaxValues = useMemo(() => {
    const rows = data?.rows ?? [];
    const maxFor = (key: keyof PrepPocHeatmapRow) =>
      Math.max(1, ...rows.map((r) => (r[key] as number) ?? 0));
    return {
      totalLmpLoad: maxFor("totalLmpLoad"),
      currentLmpCount: maxFor("currentLmpCount"),
      closedLmpCount: maxFor("closedLmpCount"),
      notStartedCount: maxFor("notStartedCount"),
      prepOngoingCount: maxFor("prepOngoingCount"),
      prepDoneCount: maxFor("prepDoneCount"),
      convertedCount: maxFor("convertedCount"),
      notConvertedCount: maxFor("notConvertedCount"),
      onHoldCount: maxFor("onHoldCount"),
      otherReasonsCount: maxFor("otherReasonsCount"),
      primaryCount: maxFor("primaryCount"),
      supportCount: maxFor("supportCount"),
      inDomainCount: maxFor("inDomainCount"),
      crossDomainCount: maxFor("crossDomainCount"),
      studentsPlaced: maxFor("studentsPlaced"),
    };
  }, [data]);

  // ── CSV export ──────────────────────────────────────────────────────────────
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
      Converted: r.convertedCount,
      "Not Converted": r.notConvertedCount,
      "On hold": r.onHoldCount,
      "Other reasons": r.otherReasonsCount,
      Primary: r.primaryCount,
      Support: r.supportCount,
      "In-domain": r.inDomainCount,
      "Cross-domain": r.crossDomainCount,
      "Converted Count": r.convertedCount,
      "Eligible Closed Count": r.eligibleClosedCount,
      "LMP Conversion %": r.lmpConversionPercentage !== null
        ? `${r.lmpConversionPercentage.toFixed(1)}%`
        : "—",
      "Students Placed": r.studentsPlaced,
    }));
    // Append metadata rows
    csvRows.push({} as any);
    csvRows.push({ "POC Name": `Exported At: ${generatedAt}` } as any);
    csvRows.push({
      "POC Name": `Active POCs: ${summary.activePocCount} | Unique LMPs: ${summary.uniqueLmpCount} | Converted LMP %: ${summary.convertedLmpPercentage !== null ? `${summary.convertedLmpPercentage.toFixed(1)}%` : "—"}`,
    } as any);

    downloadCsv(`prep-poc-heatmap-lmp-wise-${dateStamp()}.csv`, csvRows, [
      "POC Name", "Total LMPs", "Current LMPs", "Closed LMPs",
      "Not Started", "Prep Ongoing", "Prep Done",
      "Converted", "Not Converted", "On hold", "Other reasons",
      "Primary", "Support",
      "In-domain", "Cross-domain",
      "Converted Count", "Eligible Closed Count", "LMP Conversion %",
      "Students Placed",
    ]);
  }, [data]);

  // ── Totals row values ───────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!data) return null;
    const { rows, summary } = data;
    const sum = (key: keyof PrepPocHeatmapRow) =>
      rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
    return {
      totalLmpLoad: summary.uniqueLmpCount, // globally deduped
      currentLmpCount: sum("currentLmpCount"),
      closedLmpCount: sum("closedLmpCount"),
      notStartedCount: sum("notStartedCount"),
      prepOngoingCount: sum("prepOngoingCount"),
      prepDoneCount: sum("prepDoneCount"),
      convertedCount: summary.convertedLmpCount,
      notConvertedCount: sum("notConvertedCount"),
      onHoldCount: sum("onHoldCount"),
      otherReasonsCount: sum("otherReasonsCount"),
      primaryCount: sum("primaryCount"),
      supportCount: sum("supportCount"),
      inDomainCount: sum("inDomainCount"),
      crossDomainCount: sum("crossDomainCount"),
      eligibleClosedCount: summary.eligibleClosedLmpCount,
      lmpConversionPercentage: summary.convertedLmpPercentage,
      studentsPlaced: summary.uniqueStudentsPlaced, // globally deduped
    };
  }, [data]);

  const openDrilldown = useCallback((row: PrepPocHeatmapRow, metricKey: HeatmapMetricKey, displayedValue: number | string, displayedCount: number | null) => {
    if (displayedCount !== null && displayedCount <= 0) return;
    setSelection({
      pocId: row.pocId,
      pocName: row.pocName,
      metricKey,
      metricLabel: HEATMAP_METRIC_LABELS[metricKey],
      displayedValue,
      displayedCount,
    });
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="rounded-3xl border bg-white overflow-hidden"
      style={{
        borderColor: "#e7edf4",
        boxShadow: "0 24px 60px rgba(15, 23, 42, 0.075), 0 2px 8px rgba(15, 23, 42, 0.045)",
      }}
    >
      {/* ── Card header ── */}
      <div className="px-6 pt-5 pb-4 border-b bg-gradient-to-br from-white via-white to-slate-50/70" style={{ borderColor: "#f1f5f9" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* Title area */}
          <div>
            <h3 className="text-[22px] font-bold tracking-[-0.02em]" style={{ color: "#111827" }}>
              Prep POC Heatmap
            </h3>
            <p className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: "#64748b" }}>
              Live from POC DB • LMP DB
              <LiveBadge isFetching={isFetching && !isLoading} isError={isError} />
            </p>
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* View tabs */}
            <div className="flex rounded-xl border bg-white overflow-hidden shadow-sm" style={{ borderColor: "#e2e8f0" }}>
              {(
                [
                  { id: "lmp", label: "LMP-wise" },
                  { id: "student", label: "Student-wise" },
                  { id: "domain", label: "Domain-wise" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveView(tab.id)}
                  disabled={tab.id !== "lmp"}
                  className={cn(
                    "px-4 py-2 text-[12.5px] font-semibold transition-colors border-r last:border-r-0",
                    activeView === tab.id
                      ? "bg-blue-50 text-blue-700"
                      : "bg-white hover:bg-slate-50",
                    tab.id !== "lmp" && "opacity-40 cursor-not-allowed",
                  )}
                  style={{ borderColor: "#e2e8f0", color: activeView === tab.id ? "#1d4ed8" : "#64748b" }}
                  title={tab.id !== "lmp" ? "Not yet implemented" : undefined}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Export */}
            <button
              onClick={handleExport}
              disabled={!data || isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border bg-white text-[12.5px] font-semibold transition-colors hover:bg-slate-50 disabled:opacity-40 shadow-sm"
              style={{ borderColor: "#e2e8f0", color: "#64748b" }}
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>
        </div>

        {/* ── KPI cards ── */}
        {!isLoading && data && (
          <div className="flex flex-wrap gap-3 mt-4">
            <KpiCard
              icon={Users}
              label="Active POCs"
              value={data.summary.activePocCount}
              color="#6366f1"
              tooltip="Distinct active Prep POCs included in the current dashboard scope."
            />
            <KpiCard
              icon={Briefcase}
              label="Unique LMPs"
              value={data.summary.uniqueLmpCount}
              color="#3b82f6"
              tooltip="Distinct LMP processes counted once, even when multiple POCs are assigned."
            />
            <KpiCard
              icon={GraduationCap}
              label="Students Placed"
              value={data.summary.uniqueStudentsPlaced}
              color="#22c55e"
              tooltip="Distinct students with a valid final placement outcome, counted once globally."
            />
            <KpiCard
              icon={TrendingUp}
              label="Converted LMP %"
              value={
                data.summary.convertedLmpPercentage !== null
                  ? `${data.summary.convertedLmpPercentage.toFixed(0)}%`
                  : "—"
              }
              color="#14b8a6"
              tooltip="Globally distinct converted LMPs ÷ eligible closed LMPs (excludes On hold)."
            />
          </div>
        )}

        {/* Skeleton KPI row while loading */}
        {isLoading && (
          <div className="flex flex-wrap gap-3 mt-4 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 flex-1 min-w-[130px] rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
      </div>

      {/* ── Body ── */}
      <div className="p-4">
        {isLoading && <HeatmapSkeleton />}

        {isError && (
          <div className="py-10 text-center space-y-2">
            <p className="text-[14px] font-medium" style={{ color: "#dc2626" }}>
              Failed to load heatmap data
            </p>
            <p className="text-[12px]" style={{ color: "#94a3b8" }}>
              Check console for details or retry.
            </p>
            <button
              onClick={() => refetch()}
              className="mt-2 px-4 py-1.5 rounded-lg border text-[12.5px] font-medium hover:bg-slate-50"
              style={{ borderColor: "#e2e8f0", color: "#64748b" }}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && data && data.rows.length === 0 && (
          <div className="py-10 text-center">
            <p className="text-[14px]" style={{ color: "#94a3b8" }}>
              No Prep POC workload data is available for the selected filters.
            </p>
          </div>
        )}

        {!isLoading && !isError && data && data.rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: "#e7edf4" }}>
            <table
              className="w-full border-separate text-[12px]"
              style={{ borderSpacing: 0, minWidth: 1280 }}
            >
              <colgroup>
                <col style={{ minWidth: 140, width: 160 }} />
                {/* LMP Load */}
                <col style={{ minWidth: 68 }} />
                <col style={{ minWidth: 68 }} />
                <col style={{ minWidth: 60 }} />
                {/* Active Prep */}
                <col style={{ minWidth: 78 }} />
                <col style={{ minWidth: 90 }} />
                <col style={{ minWidth: 78 }} />
                {/* Closed Outcomes */}
                <col style={{ minWidth: 80 }} />
                <col style={{ minWidth: 96 }} />
                <col style={{ minWidth: 68 }} />
                <col style={{ minWidth: 96 }} />
                {/* Responsibility */}
                <col style={{ minWidth: 68 }} />
                <col style={{ minWidth: 68 }} />
                {/* Domain Load */}
                <col style={{ minWidth: 80 }} />
                <col style={{ minWidth: 92 }} />
                {/* Performance */}
                <col style={{ minWidth: 108 }} />
                <col style={{ minWidth: 96 }} />
              </colgroup>

              <thead>
                {/* ── Row 1: Group headers ── */}
                <tr>
                  <th
                    rowSpan={2}
                    className="text-left align-bottom px-4 pb-4 pt-5 text-[11px] font-bold uppercase tracking-wide border-r border-b"
                    style={{ color: "#475569", position: "sticky", left: 0, background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)", zIndex: 3, borderColor: "#e7edf4" }}
                  >
                    POC
                  </th>

                  {COLUMN_GROUPS.map((g) => {
                    const Icon = g.icon;
                    return (
                      <th
                        key={g.key}
                        colSpan={g.cols.length}
                        className="text-center px-2 py-3 text-[10.5px] font-bold uppercase tracking-wider border-b"
                        style={{
                          color: g.color,
                          borderColor: `${g.color}26`,
                          background: GROUP_SURFACE[g.key],
                          boxShadow: `inset 0 2px 0 ${g.color}38`,
                        }}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-6 w-6 rounded-xl inline-flex items-center justify-center" style={{ background: `${g.color}14` }}>
                            <Icon size={12} />
                          </span>
                          {g.label}
                        </span>
                      </th>
                    );
                  })}

                  {/* Performance header */}
                  <th
                    colSpan={2}
                    className="text-center px-2 py-3 text-[10.5px] font-bold uppercase tracking-wider border-b"
                    style={{
                      color: "#22c55e",
                      borderColor: "#22c55e26",
                      background: GROUP_SURFACE.performance,
                      boxShadow: "inset 0 2px 0 #22c55e38",
                    }}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <span className="h-6 w-6 rounded-xl inline-flex items-center justify-center" style={{ background: "#22c55e14" }}>
                        <TrendingUp size={12} />
                      </span>
                      PERFORMANCE
                    </span>
                  </th>
                </tr>

                {/* ── Row 2: Sub-column labels ── */}
                <tr>
                  {COLUMN_GROUPS.flatMap((g) =>
                    g.cols.map((col) => (
                      <th
                        key={col.key}
                        className="text-center px-1.5 pt-2 pb-3 text-[10px] font-semibold border-b"
                        style={{
                          color: "#64748b",
                          verticalAlign: "bottom",
                          background: `${g.color}09`,
                          borderColor: `${g.color}1f`,
                        }}
                      >
                        <span className="inline-flex flex-col items-center gap-0.5">
                          <span className="leading-tight text-center">{col.label}</span>
                          {col.subLabel && (
                            <span className="text-[9px] leading-tight" style={{ color: "#cbd5e1" }}>
                              {col.subLabel}
                            </span>
                          )}
                          <LxInfo text={col.tooltip} size={10} />
                        </span>
                      </th>
                    )),
                  )}
                  {/* Performance sub-labels */}
                  <th
                    className="text-center px-1.5 pt-2 pb-3 text-[10px] font-semibold border-b"
                    style={{ color: "#64748b", verticalAlign: "bottom", background: "#22c55e09", borderColor: "#22c55e1f" }}
                  >
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span className="leading-tight">LMP Conversion</span>
                      <LxInfo text={PERF_COLS.conversion.tooltip} size={10} />
                    </span>
                  </th>
                  <th
                    className="text-center px-1.5 pt-2 pb-3 text-[10px] font-semibold border-b"
                    style={{ color: "#64748b", verticalAlign: "bottom", background: "#22c55e09", borderColor: "#22c55e1f" }}
                  >
                    <span className="inline-flex flex-col items-center gap-0.5">
                      <span className="leading-tight">Students Placed</span>
                      <LxInfo text={PERF_COLS.studentsPlaced.tooltip} size={10} />
                    </span>
                  </th>
                </tr>
              </thead>

              <tbody>
                {data.rows.map((row) => (
                  <DataRow
                    key={row.pocId}
                    row={row}
                    colMaxValues={colMaxValues}
                    onOpenDrilldown={openDrilldown}
                  />
                ))}

                {/* ── Total row ── */}
                {totals && (
                  <TotalRow totals={totals} colMaxValues={colMaxValues} />
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {data && (
        <HeatmapDrilldownModal
          open={Boolean(selection)}
          selection={selection}
          data={data}
          onOpenChange={(open) => {
            if (!open) setSelection(null);
          }}
        />
      )}
    </div>
  );
}

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
  open,
  selection,
  data,
  onOpenChange,
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
          record.company,
          record.role,
          record.lmpCode,
          record.domain,
          record.statusLabel,
          record.outcomeReason,
          record.primaryPoc,
          record.supportPoc,
        ].some((value) => value.toLowerCase().includes(q)))
      : allLmps;
    return [...rows].sort((a, b) => compareValues(a[lmpSort], b[lmpSort], lmpSort === "createdAt" || lmpSort === "updatedAt"));
  }, [allLmps, lmpSort, searchTerm]);

  const filteredStudents = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const rows = q
      ? allStudents.filter((record) => [
          record.studentName,
          record.studentCode,
          record.company,
          record.lmpCode,
          record.domain,
          record.cohort,
          record.primaryPoc,
          record.supportPoc,
        ].some((value) => value.toLowerCase().includes(q)))
      : allStudents;
    return [...rows].sort((a, b) => compareValues(a[studentSort], b[studentSort], studentSort === "placementDate"));
  }, [allStudents, searchTerm, studentSort]);

  const activeRows = result?.recordType === "student" ? filteredStudents : filteredLmps;
  const totalPages = Math.max(1, Math.ceil(activeRows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = activeRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const resetModalControls = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchTerm("");
      setPage(1);
    }
    onOpenChange(nextOpen);
  };

  const exportDrilldown = () => {
    if (!selection || !result) return;
    const metadataRows = [
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
        [
          ...metadataRows,
          ...allStudents.map((record) => ({
            "Student Name": record.studentName,
            "Student ID": record.studentId,
            Cohort: record.cohort,
            Company: record.company,
            LMP: record.lmpCode,
            Domain: record.domain,
            "Placement Status": record.placementStatus,
            "Placement Date": formatDate(record.placementDate),
            "Primary POC": record.primaryPoc,
            "Support POC": record.supportPoc,
          })),
        ],
      );
      return;
    }

    downloadCsv(
      `${safeFilename(selection.pocName)}_${safeFilename(selection.metricLabel)}_${dateStamp()}.csv`,
      [
        ...metadataRows,
        ...allLmps.map((record) => ({
          "LMP Name": `${record.company} — ${record.role}`.trim(),
          Company: record.company,
          Role: record.role,
          "LMP ID": record.lmpCode || record.lmpId,
          Domain: record.domain,
          "Primary POC": record.primaryPoc,
          "Support POC": record.supportPoc,
          "Prep Status": record.statusLabel,
          Outcome: record.statusLabel,
          Reason: record.outcomeReason,
          "Students Mapped": record.studentsMapped,
          "Students Placed": record.studentsPlaced,
          "Created Date": formatDate(record.createdAt),
          "Last Updated": formatDate(record.updatedAt),
        })),
      ],
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
            {searchTerm.trim() && ` · ${activeRows.length.toLocaleString()} matching search`}
            {selection?.metricKey === "lmpConversion" && result && (
              <span> · {result.convertedLmps.length}/{result.denominatorLmps.length} converted · On hold excluded</span>
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
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              placeholder="Search records..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-[13px] outline-none transition focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            />
          </label>
          {result?.recordType === "student" ? (
            <SortSelect value={studentSort} onChange={(value) => setStudentSort(value as StudentSortKey)} options={[
              ["studentName", "Student name"],
              ["company", "Company"],
              ["domain", "Domain"],
              ["cohort", "Cohort"],
              ["placementDate", "Placement date"],
            ]} />
          ) : (
            <SortSelect value={lmpSort} onChange={(value) => setLmpSort(value as LmpSortKey)} options={[
              ["createdAt", "Created date"],
              ["updatedAt", "Last updated"],
              ["company", "Company"],
              ["statusLabel", "Status"],
              ["domain", "Domain"],
              ["studentsMapped", "Students mapped"],
            ]} />
          )}
          <button
            type="button"
            onClick={exportDrilldown}
            disabled={!result || originalCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
          >
            <Download size={14} />
            Download CSV
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
              No records were found for this metric under the current filters.
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
            Showing {activeRows.length ? (safePage - 1) * pageSize + 1 : 0}-{Math.min(safePage * pageSize, activeRows.length)} of {activeRows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-40"
            >
              Previous
            </button>
            <span>Page {safePage} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 disabled:opacity-40"
            >
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
            {["LMP / Company", "Process ID", "Domain", "Primary POC", "Support POC", "Status", "Students", "Created", "Updated", "Actions"].map((header) => (
              <th key={header} className="border-b border-slate-200 px-3 py-3 font-bold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <tr key={record.lmpId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
              <td className="px-3 py-3">
                <div className="font-semibold text-slate-900">{record.company || "Untitled company"}</div>
                <div className="text-slate-500">{record.role || "No role"}</div>
              </td>
              <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{record.lmpCode || record.lmpId}</td>
              <td className="px-3 py-3 text-slate-700">{record.domain || "Unmapped"}</td>
              <td className="px-3 py-3 text-slate-700">{record.primaryPoc || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{record.supportPoc || "—"}</td>
              <td className="px-3 py-3">
                <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{record.statusLabel}</span>
                {record.outcomeReason && <div className="mt-1 text-[11px] text-slate-500">{record.outcomeReason}</div>}
              </td>
              <td className="px-3 py-3 text-slate-700">{record.studentsMapped} mapped · {record.studentsPlaced} placed</td>
              <td className="px-3 py-3 text-slate-600">{formatDate(record.createdAt)}</td>
              <td className="px-3 py-3 text-slate-600">{formatDate(record.updatedAt)}</td>
              <td className="px-3 py-3">
                <button
                  type="button"
                  onClick={() => onView(record.lmpId)}
                  className="rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
                >
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
            {["Student", "Student ID", "Cohort", "Placed Company", "LMP", "Domain", "Placement", "Primary POC", "Support POC"].map((header) => (
              <th key={header} className="border-b border-slate-200 px-3 py-3 font-bold">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((record) => (
            <tr key={record.studentId} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
              <td className="px-3 py-3 font-semibold text-slate-900">{record.studentName}</td>
              <td className="px-3 py-3 font-mono text-[11px] text-slate-600">{record.studentCode || record.studentId}</td>
              <td className="px-3 py-3 text-slate-700">{record.cohort || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{record.company || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{record.lmpCode || record.lmpId}</td>
              <td className="px-3 py-3 text-slate-700">{record.domain || "Unmapped"}</td>
              <td className="px-3 py-3 text-slate-700">{record.placementStatus} · {formatDate(record.placementDate)}</td>
              <td className="px-3 py-3 text-slate-700">{record.primaryPoc || "—"}</td>
              <td className="px-3 py-3 text-slate-700">{record.supportPoc || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SortSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return (
    <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[12.5px] font-semibold text-slate-600 shadow-sm">
      <ArrowUpDown size={13} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="bg-transparent outline-none"
      >
        {options.map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
    </label>
  );
}

function MetricSummaryCard({ label, value, tone }: { label: string; value: string | number; tone: "green" | "slate" }) {
  return (
    <div className={cn(
      "rounded-2xl border px-4 py-3",
      tone === "green" ? "border-green-100 bg-green-50 text-green-800" : "border-slate-200 bg-white text-slate-800",
    )}>
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

function safeFilename(value: string): string {
  return value.trim().replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "") || "heatmap";
}

function formatDate(value: string): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

// ── DataRow ───────────────────────────────────────────────────────────────────

function DataRow({
  row,
  colMaxValues,
  onOpenDrilldown,
}: {
  row: PrepPocHeatmapRow;
  colMaxValues: Record<string, number>;
  onOpenDrilldown: (row: PrepPocHeatmapRow, metricKey: HeatmapMetricKey, displayedValue: number | string, displayedCount: number | null) => void;
}) {
  const openMetric = (metricKey: HeatmapMetricKey, displayedValue: number | string, displayedCount: number | null = typeof displayedValue === "number" ? displayedValue : null) =>
    () => onOpenDrilldown(row, metricKey, displayedValue, displayedCount);

  return (
    <tr className="group transition-colors">
      {/* POC name — sticky left */}
      <td
        className="px-4 py-3 font-semibold text-[12.5px] whitespace-nowrap border-r border-b transition-colors group-hover:bg-slate-50"
        style={{
          color: "#1e293b",
          position: "sticky",
          left: 0,
          background: "rgba(255,255,255,0.98)",
          zIndex: 1,
          borderColor: "#e7edf4",
        }}
      >
        {row.pocName}
      </td>

      {/* LMP LOAD */}
      <HeatCell value={row.totalLmpLoad} palette={PALETTE.slate} colMax={colMaxValues.totalLmpLoad} className="border-l border-slate-200/80" ariaLabel={`View ${row.totalLmpLoad} Total LMPs for ${row.pocName}`} onOpen={openMetric("total", row.totalLmpLoad)} />
      <HeatCell value={row.currentLmpCount} palette={PALETTE.slate} colMax={colMaxValues.currentLmpCount} ariaLabel={`View ${row.currentLmpCount} Current LMPs for ${row.pocName}`} onOpen={openMetric("current", row.currentLmpCount)} />
      <HeatCell value={row.closedLmpCount} palette={PALETTE.slate} colMax={colMaxValues.closedLmpCount} className="border-r border-slate-200/80" ariaLabel={`View ${row.closedLmpCount} Closed LMPs for ${row.pocName}`} onOpen={openMetric("closed", row.closedLmpCount)} />

      {/* ACTIVE PREP */}
      <HeatCell value={row.notStartedCount} palette={PALETTE.blue} colMax={colMaxValues.notStartedCount} className="border-l border-blue-100" ariaLabel={`View ${row.notStartedCount} Not Started LMPs for ${row.pocName}`} onOpen={openMetric("notStarted", row.notStartedCount)} />
      <HeatCell value={row.prepOngoingCount} palette={PALETTE.blue} colMax={colMaxValues.prepOngoingCount} ariaLabel={`View ${row.prepOngoingCount} Prep Ongoing LMPs for ${row.pocName}`} onOpen={openMetric("prepOngoing", row.prepOngoingCount)} />
      <HeatCell value={row.prepDoneCount} palette={PALETTE.blue} colMax={colMaxValues.prepDoneCount} className="border-r border-blue-100" ariaLabel={`View ${row.prepDoneCount} Prep Done LMPs for ${row.pocName}`} onOpen={openMetric("prepDone", row.prepDoneCount)} />

      {/* CLOSED OUTCOMES */}
      <HeatCell value={row.convertedCount} palette={PALETTE.green} colMax={colMaxValues.convertedCount} className="border-l border-green-100" ariaLabel={`View ${row.convertedCount} Converted LMPs for ${row.pocName}`} onOpen={openMetric("converted", row.convertedCount)} />
      <HeatCell value={row.notConvertedCount} palette={PALETTE.red} colMax={colMaxValues.notConvertedCount} ariaLabel={`View ${row.notConvertedCount} Not Converted LMPs for ${row.pocName}`} onOpen={openMetric("notConverted", row.notConvertedCount)} />
      <HeatCell value={row.onHoldCount} palette={PALETTE.neutral} colMax={colMaxValues.onHoldCount} ariaLabel={`View ${row.onHoldCount} On hold LMPs for ${row.pocName}`} onOpen={openMetric("onHold", row.onHoldCount)} />
      <HeatCell value={row.otherReasonsCount} palette={PALETTE.amber} colMax={colMaxValues.otherReasonsCount} className="border-r border-green-100" ariaLabel={`View ${row.otherReasonsCount} Other reasons LMPs for ${row.pocName}`} onOpen={openMetric("otherReasons", row.otherReasonsCount)} />

      {/* RESPONSIBILITY */}
      <HeatCell value={row.primaryCount} palette={PALETTE.purple} colMax={colMaxValues.primaryCount} className="border-l border-purple-100" ariaLabel={`View ${row.primaryCount} Primary LMPs for ${row.pocName}`} onOpen={openMetric("primary", row.primaryCount)} />
      <HeatCell value={row.supportCount} palette={PALETTE.purple} colMax={colMaxValues.supportCount} className="border-r border-purple-100" ariaLabel={`View ${row.supportCount} Support LMPs for ${row.pocName}`} onOpen={openMetric("support", row.supportCount)} />

      {/* DOMAIN LOAD */}
      <HeatCell value={row.inDomainCount} palette={PALETTE.teal} colMax={colMaxValues.inDomainCount} className="border-l border-teal-100" ariaLabel={`View ${row.inDomainCount} In-domain LMPs for ${row.pocName}`} onOpen={openMetric("inDomain", row.inDomainCount)} />
      <HeatCell value={row.crossDomainCount} palette={PALETTE.amber} colMax={colMaxValues.crossDomainCount} className="border-r border-teal-100" ariaLabel={`View ${row.crossDomainCount} Cross-domain LMPs for ${row.pocName}`} onOpen={openMetric("crossDomain", row.crossDomainCount)} />

      {/* PERFORMANCE — LMP Conversion */}
      <td
        className="text-center text-[12px] font-semibold tabular-nums px-1 py-2.5 border-l border-b border-green-100 transition-colors"
        style={{
          color: row.eligibleClosedCount > 0
            ? row.lmpConversionPercentage !== null && row.lmpConversionPercentage >= 50
              ? "#15803d"
              : "#9f1239"
            : "#94a3b8",
          background: "#f5fbf6",
        }}
      >
        {row.eligibleClosedCount > 0 ? (
          <button
            type="button"
            aria-label={`View LMP Conversion details for ${row.pocName}`}
            onClick={openMetric("lmpConversion", fmtConversion(row.convertedCount, row.eligibleClosedCount, row.lmpConversionPercentage), row.eligibleClosedCount)}
            className="w-full rounded-lg px-2 py-2 font-semibold tabular-nums transition-all hover:-translate-y-0.5 hover:bg-white/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-green-400 focus:ring-offset-1"
          >
            {fmtConversion(row.convertedCount, row.eligibleClosedCount, row.lmpConversionPercentage)}
          </button>
        ) : (
          <span className="inline-flex min-h-[34px] items-center justify-center px-2 py-2">
            {fmtConversion(row.convertedCount, row.eligibleClosedCount, row.lmpConversionPercentage)}
          </span>
        )}
      </td>

      {/* PERFORMANCE — Students Placed */}
      <HeatCell value={row.studentsPlaced} palette={PALETTE.green} colMax={colMaxValues.studentsPlaced} className="border-r border-green-100" ariaLabel={`View ${row.studentsPlaced} Students Placed for ${row.pocName}`} onOpen={openMetric("studentsPlaced", row.studentsPlaced)} />
    </tr>
  );
}

// ── Total row ─────────────────────────────────────────────────────────────────

function TotalRow({
  totals,
  colMaxValues,
}: {
  totals: {
    totalLmpLoad: number;
    currentLmpCount: number;
    closedLmpCount: number;
    notStartedCount: number;
    prepOngoingCount: number;
    prepDoneCount: number;
    convertedCount: number;
    notConvertedCount: number;
    onHoldCount: number;
    otherReasonsCount: number;
    primaryCount: number;
    supportCount: number;
    inDomainCount: number;
    crossDomainCount: number;
    eligibleClosedCount: number;
    lmpConversionPercentage: number | null;
    studentsPlaced: number;
  };
  colMaxValues: Record<string, number>;
}) {
  return (
    <tr>
      <td
        className="px-4 py-3 font-bold text-[12.5px] uppercase tracking-wide border-y border-r"
        style={{
          color: "#1e293b",
          position: "sticky",
          left: 0,
          background: "linear-gradient(180deg, #ffffff 0%, #f1f5f9 100%)",
          zIndex: 1,
          borderColor: "#dbe5ef",
        }}
      >
        TOTAL
      </td>

      {/* LMP LOAD — globally unique */}
      <td className="text-center font-bold text-[13px] tabular-nums py-3 border-y border-l border-slate-200" style={{ background: "#edf2f7", color: "#334155" }}>
        {totals.totalLmpLoad}
      </td>
      <td className="text-center font-bold text-[13px] tabular-nums py-3 border-y border-white" style={{ background: "#edf2f7", color: "#334155" }}>
        {totals.currentLmpCount}
      </td>
      <td className="text-center font-bold text-[13px] tabular-nums py-3 border-y border-r border-slate-200" style={{ background: "#edf2f7", color: "#334155" }}>
        {totals.closedLmpCount}
      </td>

      {/* ACTIVE PREP */}
      <TotalCell value={totals.notStartedCount} color="#3b82f6" />
      <TotalCell value={totals.prepOngoingCount} color="#3b82f6" />
      <TotalCell value={totals.prepDoneCount} color="#3b82f6" />

      {/* CLOSED OUTCOMES */}
      <TotalCell value={totals.convertedCount} color="#22c55e" />
      <TotalCell value={totals.notConvertedCount} color="#ef4444" />
      <TotalCell value={totals.onHoldCount} color="#78716c" />
      <TotalCell value={totals.otherReasonsCount} color="#d97706" />

      {/* RESPONSIBILITY */}
      <TotalCell value={totals.primaryCount} color="#7c3aed" />
      <TotalCell value={totals.supportCount} color="#7c3aed" />

      {/* DOMAIN LOAD */}
      <TotalCell value={totals.inDomainCount} color="#14b8a6" />
      <TotalCell value={totals.crossDomainCount} color="#d97706" />

      {/* PERFORMANCE — LMP Conversion (globally deduped) */}
      <td
        className="text-center font-bold text-[12px] tabular-nums py-3 border-y border-l border-green-100"
        style={{ background: "#f0fdf4", color: "#15803d" }}
      >
        {fmtConversion(totals.convertedCount, totals.eligibleClosedCount, totals.lmpConversionPercentage)}
      </td>

      {/* PERFORMANCE — Students Placed (globally deduped) */}
      <td
        className="text-center font-bold text-[13px] tabular-nums py-3 border-y border-r border-green-100"
        style={{ background: "#dcfce7", color: "#15803d" }}
      >
        {totals.studentsPlaced}
      </td>
    </tr>
  );
}

function TotalCell({ value, color }: { value: number; color: string }) {
  return (
    <td
      className="text-center font-bold text-[13px] tabular-nums py-3 border-y border-white"
      style={{ background: "#f8fafc", color }}
    >
      {value}
    </td>
  );
}
