import type { ComponentType } from "react";
import { ClipboardList, RefreshCw, TrendingUp, BarChart3, GraduationCap } from "lucide-react";
import { LxInfo } from "@/components/insights/LxInfo";
import { fmtConversion } from "@/lib/prepPocHeatmapAgg";
import type { DomainWiseRow, StudentWiseRow } from "@/lib/prepPocHeatmapViews";
import {
  A_NEUTRAL, A_SKY, A_SAGE, A_CORAL, A_ORANGE, CELL_BORDER, MUTED_TEXT, T_SAGE,
  P_CORAL, P_NEUTRAL, P_ON_HOLD, P_ORANGE, P_SAGE, P_SKY, cellStyle,
} from "@/components/dashboard/prepPocHeatmapPalettes";

export type AltColType = "heat" | "conversion" | "rate" | "text";

export type AltColDef = {
  dataKey: string;
  label: string;
  subLabel?: string;
  tooltip: string;
  minWidth: number;
  palette: typeof P_NEUTRAL;
  totalAccent: string;
  colType: AltColType;
};

export type AltSectionDef = {
  key: string;
  label: string;
  icon: ComponentType<{ size?: number }>;
  accent: string;
  headerBg: string;
  subheaderBg: string;
  cols: AltColDef[];
};

export const STUDENT_SECTION_CONFIG: AltSectionDef[] = [
  {
    key: "studentLoad",
    label: "STUDENT LOAD",
    icon: ClipboardList,
    accent: A_NEUTRAL,
    headerBg: "rgba(250, 250, 249, 0.95)",
    subheaderBg: "var(--lx-surface)",
    cols: [
      { dataKey: "totalStudents", colType: "heat", label: "Total", subLabel: "(Till Today)", minWidth: 68, palette: P_NEUTRAL, totalAccent: A_NEUTRAL, tooltip: "Distinct students linked to this POC's LMPs in the current scope." },
      { dataKey: "currentStudents", colType: "heat", label: "Current", subLabel: "(Active)", minWidth: 68, palette: P_NEUTRAL, totalAccent: A_NEUTRAL, tooltip: "Students currently in Not Started, Prep Ongoing or Prep Done." },
      { dataKey: "placedStudentsLoad", colType: "heat", label: "Placed", minWidth: 60, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Students with a valid final placement outcome." },
    ],
  },
  {
    key: "prepStatus",
    label: "PREP STATUS",
    icon: RefreshCw,
    accent: A_SKY,
    headerBg: "rgba(240, 249, 255, 0.45)",
    subheaderBg: "rgba(240, 249, 255, 0.22)",
    cols: [
      { dataKey: "notStartedCount", colType: "heat", label: "Not Started", minWidth: 78, palette: P_SKY, totalAccent: A_SKY, tooltip: "Students whose current prep status is Not Started." },
      { dataKey: "prepOngoingCount", colType: "heat", label: "Prep Ongoing", minWidth: 90, palette: P_SKY, totalAccent: A_SKY, tooltip: "Students currently in Prep Ongoing." },
      { dataKey: "prepDoneCount", colType: "heat", label: "Prep Done", minWidth: 78, palette: P_SKY, totalAccent: A_SKY, tooltip: "Students marked Prep Done." },
    ],
  },
  {
    key: "placementOutcome",
    label: "PLACEMENT OUTCOME",
    icon: TrendingUp,
    accent: A_SAGE,
    headerBg: "rgba(242, 246, 241, 0.55)",
    subheaderBg: "rgba(242, 246, 241, 0.3)",
    cols: [
      { dataKey: "placedCount", colType: "heat", label: "Placed", minWidth: 72, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Distinct students with a valid final placement outcome." },
      { dataKey: "notPlacedCount", colType: "heat", label: "Not Placed", minWidth: 88, palette: P_CORAL, totalAccent: A_CORAL, tooltip: "Students mapped to an unsuccessful final outcome." },
      { dataKey: "onHoldCount", colType: "heat", label: "On hold", minWidth: 72, palette: P_ON_HOLD, totalAccent: A_ORANGE, tooltip: "Students mapped to On hold." },
      { dataKey: "otherReasonsCount", colType: "heat", label: "Other reasons", minWidth: 96, palette: P_ORANGE, totalAccent: A_ORANGE, tooltip: "Students mapped to other terminal or exception outcomes." },
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
      { dataKey: "placementRatePct", colType: "rate", label: "Placement Rate", minWidth: 96, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Students Placed divided by total unique students for this POC." },
      { dataKey: "avgSessionsPerStudent", colType: "text", label: "Avg. Sessions", subLabel: "(Per Student)", minWidth: 96, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Average completed prep sessions per student. Shows — when session data is unavailable." },
    ],
  },
];

export const DOMAIN_SECTION_CONFIG: AltSectionDef[] = [
  {
    key: "lmpLoad",
    label: "LMP LOAD",
    icon: ClipboardList,
    accent: A_NEUTRAL,
    headerBg: "rgba(250, 250, 249, 0.95)",
    subheaderBg: "var(--lx-surface)",
    cols: [
      { dataKey: "totalLmps", colType: "heat", label: "Total", subLabel: "(Till Today)", minWidth: 68, palette: P_NEUTRAL, totalAccent: A_NEUTRAL, tooltip: "Distinct LMPs mapped to this domain in the current scope." },
      { dataKey: "currentLmps", colType: "heat", label: "Current", subLabel: "(Ongoing)", minWidth: 68, palette: P_NEUTRAL, totalAccent: A_NEUTRAL, tooltip: "LMPs currently in Not Started, Prep Ongoing or Prep Done." },
      { dataKey: "closedLmps", colType: "heat", label: "Closed", minWidth: 60, palette: P_NEUTRAL, totalAccent: A_NEUTRAL, tooltip: "Closed LMPs in this domain." },
    ],
  },
  {
    key: "prepStatus",
    label: "PREP STATUS",
    icon: RefreshCw,
    accent: A_SKY,
    headerBg: "rgba(240, 249, 255, 0.45)",
    subheaderBg: "rgba(240, 249, 255, 0.22)",
    cols: [
      { dataKey: "notStartedCount", colType: "heat", label: "Not Started", minWidth: 78, palette: P_SKY, totalAccent: A_SKY, tooltip: "Distinct LMPs in Not Started for this domain." },
      { dataKey: "prepOngoingCount", colType: "heat", label: "Prep Ongoing", minWidth: 90, palette: P_SKY, totalAccent: A_SKY, tooltip: "Distinct LMPs in Prep Ongoing for this domain." },
      { dataKey: "prepDoneCount", colType: "heat", label: "Prep Done", minWidth: 78, palette: P_SKY, totalAccent: A_SKY, tooltip: "Distinct LMPs in Prep Done for this domain." },
    ],
  },
  {
    key: "placementOutcome",
    label: "PLACEMENT OUTCOME",
    icon: GraduationCap,
    accent: A_SAGE,
    headerBg: "rgba(242, 246, 241, 0.55)",
    subheaderBg: "rgba(242, 246, 241, 0.3)",
    cols: [
      { dataKey: "placedCount", colType: "heat", label: "Placed", minWidth: 72, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Distinct placed students in this domain." },
      { dataKey: "notPlacedCount", colType: "heat", label: "Not Placed", minWidth: 88, palette: P_CORAL, totalAccent: A_CORAL, tooltip: "Students mapped to not placed outcomes in this domain." },
      { dataKey: "onHoldCount", colType: "heat", label: "On hold", minWidth: 72, palette: P_ON_HOLD, totalAccent: A_ORANGE, tooltip: "Students mapped to On hold in this domain." },
      { dataKey: "otherReasonsCount", colType: "heat", label: "Other reasons", minWidth: 96, palette: P_ORANGE, totalAccent: A_ORANGE, tooltip: "Students mapped to other terminal outcomes in this domain." },
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
      { dataKey: "studentsPlaced", colType: "heat", label: "Students Placed", minWidth: 96, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Distinct students with a valid final placement outcome in this domain." },
      { dataKey: "placementRatePct", colType: "rate", label: "Placement Rate", minWidth: 96, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Students Placed divided by total student opted for this domain." },
      { dataKey: "lmpConversion", colType: "conversion", label: "LMP Conversion", minWidth: 108, palette: P_SAGE, totalAccent: A_SAGE, tooltip: "Converted LMPs divided by eligible closed LMPs." },
    ],
  },
];

function fmtRate(pct: number | null | undefined): string {
  return pct == null ? "—" : `${pct.toFixed(0)}%`;
}

function getRowValue(row: StudentWiseRow | DomainWiseRow, key: string): number {
  return Number((row as Record<string, unknown>)[key] ?? 0);
}

function getTotalsValue(totals: Record<string, unknown>, key: string): number {
  return Number(totals[key] ?? 0);
}

export function GenericHeatmapTable({
  rowHeader,
  rows,
  totals,
  visibleConfig,
  colMaxValues,
}: {
  rowHeader: string;
  rows: Array<{ id: string; label: string; row: StudentWiseRow | DomainWiseRow }>;
  totals: Record<string, unknown>;
  visibleConfig: AltSectionDef[];
  colMaxValues: Record<string, number>;
}) {
  // #region agent log
  fetch("http://127.0.0.1:7312/ingest/b3abaf36-b6fd-4714-96aa-a572e9bc3140", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3c81bd" },
    body: JSON.stringify({
      sessionId: "3c81bd",
      runId: "post-fix",
      hypothesisId: "A",
      location: "PrepPocHeatmapAlternateViews.tsx:GenericHeatmapTable",
      message: "GenericHeatmapTable render",
      data: {
        rowHeader,
        rowCount: rows.length,
        colTypes: visibleConfig.flatMap((s) => s.cols.map((c) => c.colType)),
        tSageDefined: typeof T_SAGE === "string",
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  return (
    <table className="w-full border-separate text-[12px]" style={{ borderSpacing: 0, minWidth: 900, border: "0.5px solid var(--lx-border)" }}>
      <colgroup>
        <col style={{ minWidth: 148, width: 160 }} />
        {visibleConfig.flatMap((s) => s.cols.map((c) => <col key={c.dataKey} style={{ minWidth: c.minWidth }} />))}
      </colgroup>
      <thead>
        <tr>
          <th rowSpan={2} className="text-left align-bottom px-4 pb-3 pt-4 text-[11px] font-semibold uppercase border-r border-b"
            style={{ color: "var(--lx-text-3)", letterSpacing: "0.04em", position: "sticky", left: 0, zIndex: 3, background: "var(--lx-surface)", borderColor: CELL_BORDER }}>
            {rowHeader}
          </th>
          {visibleConfig.map((s) => {
            const Icon = s.icon;
            return (
              <th key={s.key} colSpan={s.cols.length}
                className="text-center px-2 py-2.5 text-[11px] font-semibold uppercase border-b"
                style={{ color: s.accent, background: s.headerBg, letterSpacing: "0.04em", borderTop: `2px solid ${s.accent}`, borderBottom: `1px solid ${CELL_BORDER}` }}>
                <span className="inline-flex items-center justify-center gap-1.5">
                  <span className="h-5 w-5 rounded-lg inline-flex items-center justify-center" style={{ background: `color-mix(in srgb, ${s.accent} 8%, transparent)` }}>
                    <Icon size={11} />
                  </span>
                  {s.label}
                </span>
              </th>
            );
          })}
        </tr>
        <tr>
          {visibleConfig.flatMap((s) => s.cols.map((col) => (
            <th key={col.dataKey} className="text-center px-1 pt-1.5 pb-2.5 text-[10px] font-semibold border-b"
              style={{ color: "var(--lx-text-2)", verticalAlign: "bottom", background: s.subheaderBg, borderColor: CELL_BORDER }}>
              <span className="inline-flex flex-col items-center gap-0.5">
                <span className="leading-tight text-center whitespace-nowrap">{col.label}</span>
                {col.subLabel && <span className="text-[9px] leading-tight" style={{ color: "var(--lx-text-3)" }}>{col.subLabel}</span>}
                <LxInfo text={col.tooltip} size={9} side="bottom" />
              </span>
            </th>
          )))}
        </tr>
      </thead>
      <tbody>
        {rows.map(({ id, label, row }) => (
          <tr key={id} className="group transition-colors">
            <td className="px-4 py-2.5 font-semibold text-[12.5px] whitespace-nowrap border-r border-b"
              style={{ color: "var(--lx-text)", position: "sticky", left: 0, zIndex: 1, background: "var(--lx-surface)", borderColor: CELL_BORDER }}>
              {label}
            </td>
            {visibleConfig.flatMap((s) => s.cols.map((col) => {
              if (col.colType === "conversion") {
                const dRow = row as DomainWiseRow;
                const dispVal = fmtConversion(dRow.convertedCount, dRow.eligibleClosedCount, dRow.lmpConversionPercentage);
                return (
                  <td key={col.dataKey} className="text-center text-[12px] font-semibold tabular-nums border-b py-2"
                    style={{ background: "var(--lx-surface)", color: dRow.eligibleClosedCount > 0 ? T_SAGE : MUTED_TEXT, borderColor: CELL_BORDER }}>
                    {dispVal}
                  </td>
                );
              }
              if (col.colType === "rate") {
                const pct = (row as StudentWiseRow & DomainWiseRow).placementRatePct;
                return (
                  <td key={col.dataKey} className="text-center text-[12px] font-semibold tabular-nums border-b py-2"
                    style={{ background: "var(--lx-surface)", color: pct != null ? T_SAGE : MUTED_TEXT, borderColor: CELL_BORDER }}>
                    {fmtRate(pct)}
                  </td>
                );
              }
              if (col.colType === "text") {
                const avg = (row as StudentWiseRow).avgSessionsPerStudent;
                return (
                  <td key={col.dataKey} className="text-center text-[12px] font-semibold tabular-nums border-b py-2"
                    style={{ background: "var(--lx-surface)", color: MUTED_TEXT, borderColor: CELL_BORDER }}>
                    {avg == null ? "—" : avg.toFixed(1)}
                  </td>
                );
              }
              const value = getRowValue(row, col.dataKey);
              const colMax = colMaxValues[col.dataKey] ?? 1;
              return (
                <td key={col.dataKey} className="text-center text-[12.5px] font-semibold tabular-nums border-b min-h-[38px] py-2"
                  style={{ ...cellStyle(value, colMax, col.palette), borderColor: CELL_BORDER }}>
                  {value}
                </td>
              );
            }))}
          </tr>
        ))}
        <tr>
          <td className="px-4 py-2.5 text-[11px] font-bold uppercase border-r"
            style={{ color: "var(--lx-text-2)", letterSpacing: "0.04em", position: "sticky", left: 0, zIndex: 1, background: "var(--lx-soft)", borderTop: "1px solid var(--lx-border)", borderColor: CELL_BORDER }}>
            TOTAL
          </td>
          {visibleConfig.flatMap((s) => s.cols.map((col) => {
            if (col.colType === "conversion") {
              const converted = getTotalsValue(totals, "convertedCount");
              const eligible = getTotalsValue(totals, "eligibleClosedCount");
              const pct = totals.lmpConversionPercentage as number | null | undefined;
              const dispVal = fmtConversion(converted, eligible, pct ?? null);
              return (
                <td key={col.dataKey} className="text-center text-[12px] font-bold tabular-nums py-2.5"
                  style={{ background: "var(--lx-soft)", color: eligible > 0 ? col.totalAccent : MUTED_TEXT, borderTop: "1px solid var(--lx-border)" }}>
                  {dispVal}
                </td>
              );
            }
            if (col.colType === "rate") {
              const pct = totals.placementRatePct as number | null | undefined;
              return (
                <td key={col.dataKey} className="text-center text-[12px] font-bold tabular-nums py-2.5"
                  style={{ background: "var(--lx-soft)", color: pct != null ? col.totalAccent : MUTED_TEXT, borderTop: "1px solid var(--lx-border)" }}>
                  {fmtRate(pct ?? null)}
                </td>
              );
            }
            if (col.colType === "text") {
              return (
                <td key={col.dataKey} className="text-center text-[12px] font-bold tabular-nums py-2.5"
                  style={{ background: "var(--lx-soft)", color: MUTED_TEXT, borderTop: "1px solid var(--lx-border)" }}>
                  —
                </td>
              );
            }
            const value = getTotalsValue(totals, col.dataKey);
            return (
              <td key={col.dataKey} className="text-center text-[12.5px] font-bold tabular-nums py-2.5"
                style={{ background: "var(--lx-soft)", color: value > 0 ? col.totalAccent : MUTED_TEXT, borderTop: "1px solid var(--lx-border)" }}>
                {value}
              </td>
            );
          }))}
        </tr>
      </tbody>
    </table>
  );
}

export function buildColMaxValues(rows: Array<StudentWiseRow | DomainWiseRow>, keys: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    out[key] = Math.max(1, ...rows.map((r) => Number((r as Record<string, unknown>)[key] ?? 0)));
  }
  return out;
}

export function studentTotalsFrom(data: { studentSummary: import("@/lib/prepPocHeatmapViews").StudentWiseSummary; studentRows: StudentWiseRow[] }) {
  const sum = (key: keyof StudentWiseRow) =>
    data.studentRows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  return {
    totalStudents: data.studentSummary.uniqueStudents,
    currentStudents: sum("currentStudents"),
    placedStudentsLoad: data.studentSummary.studentsPlaced,
    notStartedCount: sum("notStartedCount"),
    prepOngoingCount: sum("prepOngoingCount"),
    prepDoneCount: sum("prepDoneCount"),
    placedCount: data.studentSummary.studentsPlaced,
    notPlacedCount: sum("notPlacedCount"),
    onHoldCount: sum("onHoldCount"),
    otherReasonsCount: sum("otherReasonsCount"),
    placementRatePct: data.studentSummary.placedStudentsPct,
    avgSessionsPerStudent: null,
  };
}

export function domainTotalsFrom(data: { domainSummary: import("@/lib/prepPocHeatmapViews").DomainWiseSummary; domainRows: DomainWiseRow[] }) {
  const sum = (key: keyof DomainWiseRow) =>
    data.domainRows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
  return {
    totalLmps: data.domainSummary.totalLmps,
    currentLmps: sum("currentLmps"),
    closedLmps: sum("closedLmps"),
    notStartedCount: sum("notStartedCount"),
    prepOngoingCount: sum("prepOngoingCount"),
    prepDoneCount: sum("prepDoneCount"),
    placedCount: data.domainSummary.studentsPlaced,
    notPlacedCount: sum("notPlacedCount"),
    onHoldCount: sum("onHoldCount"),
    otherReasonsCount: sum("otherReasonsCount"),
    studentsPlaced: data.domainSummary.studentsPlaced,
    placementRatePct: data.domainSummary.placementRatePct,
    convertedCount: data.domainSummary.convertedLmpCount,
    eligibleClosedCount: data.domainSummary.eligibleClosedLmpCount,
    lmpConversionPercentage: data.domainSummary.lmpConversionPct,
  };
}
