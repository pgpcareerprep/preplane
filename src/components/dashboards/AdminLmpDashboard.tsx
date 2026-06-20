import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader, LxSection, LxSectionBlock,
  LxKpi, LxRankedBar, LxAttentionStrip,
  LX_HEX, type LxAccent,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters, uniquePocs } from "./filters/useLmpFilters";
import { useDashboardFilterOptions } from "@/lib/hooks/useDashboardFilterOptions";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { useRole } from "@/lib/rolesContext";
import {
  lmpStatusCounts,
} from "@/lib/lmpProcessQueries";
// (cross-domain classification has moved to live `usePocPrimaryDomainMap`;
//  this dashboard does not consume it directly anymore.)
import { resolveDomainName } from "@/lib/domainAlias";
import { rankPerformance } from "@/lib/performanceConversion";
import {
  isOptedOutStatus, getStudentIdentityKey, getCandidateIdentityKey,
} from "@/lib/studentAnalytics";

import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import { useLmpRows } from "@/lib/sheets/hooks";
import { useDomains } from "@/lib/hooks/useDbData";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { Link } from "react-router-dom";
import { ArrowUpDown, Download } from "lucide-react";
import { SyncIndicator } from "@/components/sheets/SyncIndicator";
import { useTodayDailyLogIds } from "@/lib/hooks/useTodayDailyLogIds";
import { ActionRequiredCard } from "./sections/ActionRequiredCard";
import { RecentSnapshotStrip } from "./sections/RecentSnapshotStrip";
import { RecentActivityCard } from "./sections/RecentActivityCard";
import { LxDrillDown, type DrillState, type ConvertedStudentDrillRow } from "@/components/insights/LxDrillDown";
import { info } from "@/lib/dashboardInfo";
import {
  lmpsForDomain, lmpsForPoc,
  studentsInBucket, studentsByPrimaryDomain, snapshotDrill, countZeroCandidateLmps,
} from "@/lib/dashboardDrill";
import { STATUS_META } from "@/lib/lmpTypes";
import { canonicalLmpStatus, type CanonicalLmpStatus } from "@/types/lmp";
import { PrepPocHeatmapCard } from "@/components/dashboard/PrepPocHeatmapCard";
import { CohortSummaryCard } from "@/components/dashboard/CohortSummaryCard";
import { LmpHealthSummaryCard, type ActiveLmpStatus } from "@/components/dashboard/LmpHealthSummaryCard";
import type { ReactNode } from "react";

/* ─── Converted-name parsing ───────────────────────────────────────────────
 * Splits a raw final_converted_names string into individual names.
 * Separators: comma, newline, semicolon.
 * Filters out: empty, "-", "NA", "N/A", and common placeholder values.
 */
const CONVERTED_NAME_JUNK = new Set(["", "-", "--", "na", "n/a", "nil", "none", "tbd", "n.a."]);

export function parseConvertedNames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n;]+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length > 0 && !CONVERTED_NAME_JUNK.has(s.toLowerCase()));
}

export function normalizeConvertedName(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

type DomainLoadView = "table" | "heatmap";
type DomainSortKey =
  | "rank"
  | "domain"
  | "totalLmps"
  | "activeLoad"
  | "convertedLmps"
  | "studentsPlaced"
  | "studentsOpted"
  | "conversionPct";

type DomainAnalyticsRow = {
  rank: number;
  domain: string;
  totalLmps: number;
  activeLoad: number;
  convertedLmps: number;
  studentsPlaced: number;
  studentsOpted: number;
  conversionPct: number | null;
  insight: "Highest load" | "Strong conversion" | "Balanced" | "Watchlist" | "No current load";
};

const ACTIVE_LMP_STATUSES = new Set(["not-started", "prep-ongoing", "ongoing", "prep-done"]);
const CONVERTED_LMP_STATUSES = new Set(["converted", "offer-received"]);

function downloadDashboardCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(value: unknown): string {
  const raw = value == null ? "" : String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function formatConversion(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(1)}%`;
}

function pctClass(value: number | null): LxAccent {
  if (value == null) return "neutral";
  if (value >= 50) return "success";
  if (value >= 20) return "yellow";
  return "risk";
}

function canonicalStatus(status: import("@/types/lmp").LmpStatus): CanonicalLmpStatus {
  return canonicalLmpStatus(status);
}

export function AdminLmpDashboard({ headerExtra }: { headerExtra?: ReactNode }) {
  const { user } = useRole();
  const {
    domainOptions,
    statusOptions,
    typeOptions,
    prepPocOptions,
  } = useDashboardFilterOptions();
  const { pocLmpIdsMap } = useEligiblePrepPocs();
  // Total student count from canonical students DB (independent of any filter).
  const { data: totalStudentsDb = 0 } = useQuery({
    queryKey: ["students_total_count"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  // Live student roster (name + cohort + domain + lmp counts) — drives cohort, domain & participation cards.
  const { data: studentRoster = [] } = useQuery({
    queryKey: ["students_roster_full"],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const out: any[] = [];
      // paginate to bypass the 1000-row default limit
       
      while (true) {
        const { data, error } = await supabase
          .from("students")
          .select("id, email, name, cohort, primary_domain, secondary_domain, lmp_count, active_lmp_count, placement_status, roll_no, student_code, phone")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return out.map((s) => ({
        id: (s.id ?? null) as string | null,
        email: (s.email ?? null) as string | null,
        name: (s.name ?? "").trim(),
        cohort: (s.cohort ?? "").trim(),
        primaryDomain: (s.primary_domain ?? "").trim(),
        secondaryDomain: (s.secondary_domain ?? "").trim(),
        rollNo: (s.roll_no ?? "").trim(),
        studentCode: (s.student_code ?? "").trim(),
        phone: (s.phone ?? "").trim(),
        lmpCount: Number(s.lmp_count ?? 0),
        activeLmpCount: Number(s.active_lmp_count ?? 0),
        placementStatus: (s.placement_status ?? null) as string | null,
      }));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  // lmp_candidates — all rows, filtered client-side by filteredIds.
  // Used for: Students in Selected LMPs KPI, domain-preference cross-reference,
  // POC lens funnel, and converted-student deduplication.
  const { data: allCandidateRows = [] } = useQuery({
    queryKey: ["lmp_candidates_all"],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const out: any[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("lmp_candidates")
          .select("id, lmp_id, student_id, email, student_name, roll_no, pipeline_stage, offer_status, status, r1_status, r2_status, r3_status")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return out.map((c) => ({
        id: (c.id ?? "") as string,
        lmpId: (c.lmp_id ?? "") as string,
        studentId: (c.student_id ?? null) as string | null,
        email: (c.email ?? null) as string | null,
        studentName: (c.student_name ?? "") as string,
        rollNo: (c.roll_no ?? null) as string | null,
        pipelineStage: (c.pipeline_stage ?? null) as string | null,
        offerStatus: (c.offer_status ?? null) as string | null,
        status: (c.status ?? null) as string | null,
        r1Status: (c.r1_status ?? null) as string | null,
        r2Status: (c.r2_status ?? null) as string | null,
        r3Status: (c.r3_status ?? null) as string | null,
      }));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  // Live realtime — keep all KPI queries fresh as DB rows change.
  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();
  // Invalidate the dashboard's custom queries on any underlying DB write so
  // the heatmap, attention strip, and student cards update instantly.
  useRealtimeInvalidate("lmp_processes", [
    ["prep_poc_capacity_live_v2"],
    ["attention_pending_offers"],
    ["attention_missing_prep_docs"],
  ], {
    cachePrefixes: ['["db-lmp-processes', '["prep_poc_capacity_live_v2'],
  });
  useRealtimeInvalidate("lmp_poc_links" as never, [["prep_poc_capacity_live_v2"]], {
    cachePrefixes: ['["db-poc-switcher-list', '["prep_poc_capacity_live_v2'],
  });
  useRealtimeInvalidate("poc_profiles" as never, [
    ["prep_poc_capacity_live_v2"],
    ["attention_pocs"],
  ], {
    cachePrefixes: ['["db-poc-profiles-with-load', '["db-all-poc-profiles', '["eligible_prep_pocs'],
  });
  useRealtimeInvalidate("students" as never, [
    ["students_total_count"],
    ["students_roster_full"],
  ], {
    cachePrefixes: ['["db-students'],
  });
  useRealtimeInvalidate("lmp_candidates" as never, [["lmp_candidates_all"]], {
    cachePrefixes: ['["db-lmp-candidates', '["db-lmp-candidate-counts'],
  });
  const { processes: liveProcesses, isLoading: lmpLoading } = useLiveProcesses();
  const { data: lmpRecords = [] } = useLmpRows();
  const { data: domainRows = [] } = useDomains();
  const { filtered, all, filters, set } = useLmpFilters({ role: "admin", userName: user.name, data: liveProcesses.length ? liveProcesses : undefined, pocLmpIdsMap });
  const filteredIds = useMemo(() => new Set(filtered.map((row) => row.processId)), [filtered]);
  const filteredRecords = useMemo(
    () => lmpRecords.filter((row) => filteredIds.has(row.id)),
    [filteredIds, lmpRecords],
  );

  // Candidate rows scoped to current filtered LMPs
  const filteredCandidates = useMemo(
    () => allCandidateRows.filter((c) => filteredIds.has(c.lmpId)),
    [allCandidateRows, filteredIds],
  );

  // Map lmpId → candidate rows (for fast lookup inside memos below)
  const candidatesByLmp = useMemo(() => {
    const m = new Map<string, typeof allCandidateRows>();
    filteredCandidates.forEach((c) => {
      if (!m.has(c.lmpId)) m.set(c.lmpId, []);
      m.get(c.lmpId)!.push(c);
    });
    return m;
  }, [filteredCandidates]);

  const candidateCountByLmp = useMemo(() => {
    const m = new Map<string, number>();
    candidatesByLmp.forEach((rows, lmpId) => m.set(lmpId, rows.length));
    return m;
  }, [candidatesByLmp]);

  /* ─────── Status counts (canonical 7-bucket model) ─────── */
  const lsc = lmpStatusCounts(filteredRecords);

  /* ─────── Capacity data — used by attention strip for overloaded POC detection ─────── */
  const { data: prepPocCapacity = [] } = useQuery({
    queryKey: ["prep_poc_capacity_live_v2"],
    queryFn: async () => {
      const [pocsRes, linksRes] = await Promise.all([
        supabase
          .from("poc_profiles")
          .select("id, name, role_type, primary_domain, domain_tags")
          .eq("status", "active"),
        supabase
          .from("lmp_poc_links")
          .select("poc_id, is_active, role, lmp_id, lmp_processes(id, status, domains(name))")
          .in("role", ["prep", "support"]),
      ]);
      if (pocsRes.error) throw new Error(pocsRes.error.message);
      if (linksRes.error) throw new Error(linksRes.error.message);
      const norm = (s: any) => String(s ?? "").trim().toLowerCase();
      const TERMINAL = new Set(["converted", "not-converted", "other-reasons", "closed", "rejected"]);
      type Link = { is_active: boolean; role: string; lmp_processes: any; lmp_id: string };
      const byPoc = new Map<string, Link[]>();
      (linksRes.data ?? []).forEach((l: any) => {
        const pid = l.lmp_id ?? l.lmp_processes?.id;
        if (!l.poc_id || !pid) return;
        const arr = byPoc.get(l.poc_id) ?? [];
        arr.push({ is_active: !!l.is_active, role: l.role, lmp_processes: l.lmp_processes, lmp_id: pid });
        byPoc.set(l.poc_id, arr);
      });
      return (pocsRes.data ?? [])
        .map((p: any) => {
          const links = byPoc.get(p.id) ?? [];
          const prepLinks = links.filter((l) => l.role === "prep");
          const domainTags = Array.isArray(p.domain_tags) ? p.domain_tags.filter(Boolean) : [];
          const domainCtx = new Set<string>([p.primary_domain, ...domainTags].filter(Boolean).map((d: string) => norm(d)));
          const prepActiveIds = new Set<string>();
          prepLinks.forEach((l) => {
            const st = norm(l.lmp_processes?.status);
            if (l.is_active && !TERMINAL.has(st)) prepActiveIds.add(l.lmp_id);
          });
          return { name: (p.name ?? "").trim(), active: prepActiveIds.size, hasDomain: domainCtx.size > 0 };
        })
        .filter((p) => p.name && (p.hasDomain || p.active > 0));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const filteredCapacity = useMemo(() => {
    return prepPocCapacity; // Attention strip reads active counts directly; no filter intersection needed here
  }, [prepPocCapacity]);

  /* ─────── Attention strip — computed from filtered scope ─────── */

  const zeroCandidateLmpsCount = useMemo(
    () => countZeroCandidateLmps(filtered, candidateCountByLmp),
    [filtered, candidateCountByLmp],
  );

  const mostOverloadedPocName = useMemo(
    () => (filteredCapacity.length > 0
      ? [...filteredCapacity].sort((a, b) => b.active - a.active)[0]?.name ?? "—"
      : "—"),
    [filteredCapacity],
  );

  /* ─────── Student analytics KPI counts (live · students DB) ─────── */
  const studentStats = useMemo(() => {
    let optedOut = 0, active = 0, single = 0, multiple = 0, noActive = 0;
    studentRoster.forEach((s) => {
      if (isOptedOutStatus(s.placementStatus)) { optedOut += 1; return; }
      const c = s.activeLmpCount;
      if (c === 0) noActive += 1;
      else if (c === 1) { single += 1; active += 1; }
      else { multiple += 1; active += 1; }
    });

    // Cohort split — opted-out is its own segment
    const cohortAgg: Record<string, { total: number; single: number; multiple: number; inactive: number; optedOut: number }> = {};
    studentRoster.filter((s) => s.name && s.cohort).forEach((s) => {
      const b = cohortAgg[s.cohort] ?? { total: 0, single: 0, multiple: 0, inactive: 0, optedOut: 0 };
      b.total += 1;
      if (isOptedOutStatus(s.placementStatus)) { b.optedOut += 1; }
      else {
        const c = s.activeLmpCount;
        if (c === 0) b.inactive += 1;
        else if (c === 1) b.single += 1;
        else b.multiple += 1;
      }
      cohortAgg[s.cohort] = b;
    });

    return {
      optedOutStudents: optedOut,
      eligibleStudents: studentRoster.length - optedOut,
      activeStudents: active,
      noActiveProcess: noActive,
      singleProcess: single,
      multipleProcesses: multiple,
      cohortAgg,
    };
  }, [studentRoster]);

  /* ─────── Students in selected LMPs (candidate-based) ─────── */
  const studentsInSelectedLmps = useMemo(() => {
    const uniqueKeys = new Set<string>();
    filteredCandidates.forEach((c) => uniqueKeys.add(getCandidateIdentityKey(c)));
    const rosterKeyMap = new Map<string, typeof studentRoster[0]>();
    studentRoster.forEach((s) => rosterKeyMap.set(getStudentIdentityKey(s), s));
    const rows = Array.from(uniqueKeys).map((k) => rosterKeyMap.get(k)).filter((s): s is typeof studentRoster[0] => !!s);
    return { count: uniqueKeys.size, rows };
  }, [filteredCandidates, studentRoster]);

  /* ─────── Converted students KPI (candidate-priority matching) ─────── */
  const convertedStudentsData = useMemo(() => {
    const CONV_STAGES = new Set(["converted", "offer", "final", "accepted", "placed"]);
    const isConvCand = (c: typeof allCandidateRows[0]) => {
      const stage = (c.pipelineStage ?? "").toLowerCase();
      return CONV_STAGES.has(stage) || (c.offerStatus ?? "").toLowerCase() === "accepted";
    };

    const uniqueKeys = new Set<string>();
    const seenKeyLmp = new Set<string>();
    const rows: ConvertedStudentDrillRow[] = [];

    const rosterByKey = new Map<string, typeof studentRoster[0]>();
    const rosterById = new Map<string, typeof studentRoster[0]>();
    studentRoster.forEach((s) => {
      rosterByKey.set(getStudentIdentityKey(s), s);
      if (s.id) rosterById.set(s.id, s);
    });

    for (const rec of filteredRecords) {
      const cands = candidatesByLmp.get(rec.id) ?? [];
      const convCands = cands.filter(isConvCand);

      if (convCands.length > 0) {
        for (const cand of convCands) {
          const key = getCandidateIdentityKey(cand);
          uniqueKeys.add(key);
          const dedupKey = `${key}::${rec.id}`;
          if (!seenKeyLmp.has(dedupKey)) {
            seenKeyLmp.add(dedupKey);
            const student = rosterByKey.get(key) ?? (cand.studentId ? rosterById.get(cand.studentId) : undefined);
            rows.push({
              studentName: cand.studentName || student?.name || "—",
              studentIdDisplay:
                student?.rollNo ||
                student?.studentCode ||
                cand.rollNo ||
                cand.studentId ||
                "",
              email: student?.email || cand.email || "",
              phone: student?.phone || "",
              cohort: student?.cohort || "—",
              primaryDomain: student?.primaryDomain || "—",
              secondaryDomain: student?.secondaryDomain || "—",
              company: (rec as any).company || "—",
              role: (rec as any).role || "—",
              lmpDomain: (rec as any).domain || "—",
              processType: (rec as any).type || "—",
              lmpStatus: rec.status,
              displayStatus: STATUS_META[rec.status]?.label || rec.status,
              prepPoc: (rec as any).prepPoc?.name || (rec as any).domainPrepPoc?.name || "—",
              outreachPoc: (rec as any).outreachPoc?.name || "—",
              closingDate: (rec as any).closingDate || "—",
              lmpCode: (rec as any).lmpCode || rec.id.slice(0, 8),
              lmpId: rec.id,
              matchStatus: student ? "matched" : "not_matched",
            });
          }
        }
      } else {
        // Fallback: parse from finalConvertedNames text field
        const names = parseConvertedNames((rec as any).finalConvertedNames);
        for (const name of names) {
          const normKey = normalizeConvertedName(name);
          if (!normKey) continue;
          const key = `name:${normKey}`;
          uniqueKeys.add(key);
          const dedupKey = `${key}::${rec.id}`;
          if (!seenKeyLmp.has(dedupKey)) {
            seenKeyLmp.add(dedupKey);
            const matches = studentRoster.filter((s) => normalizeConvertedName(s.name) === normKey);
            const matchStatus: ConvertedStudentDrillRow["matchStatus"] =
              matches.length === 0 ? "not_matched" : matches.length === 1 ? "matched" : "ambiguous";
            const student = matchStatus === "matched" ? matches[0] : null;
            rows.push({
              studentName: name,
              studentIdDisplay: student?.rollNo || student?.studentCode || student?.id || "",
              email: student?.email || "",
              phone: student?.phone || "",
              cohort: student?.cohort || (matchStatus === "ambiguous" ? "Ambiguous" : "Not matched"),
              primaryDomain: student?.primaryDomain || (matchStatus === "ambiguous" ? "Ambiguous" : "Not matched"),
              secondaryDomain: student?.secondaryDomain || (matchStatus === "ambiguous" ? "Ambiguous" : "Not matched"),
              company: (rec as any).company || "—",
              role: (rec as any).role || "—",
              lmpDomain: (rec as any).domain || "—",
              processType: (rec as any).type || "—",
              lmpStatus: rec.status,
              displayStatus: STATUS_META[rec.status]?.label || rec.status,
              prepPoc: (rec as any).prepPoc?.name || (rec as any).domainPrepPoc?.name || "—",
              outreachPoc: (rec as any).outreachPoc?.name || "—",
              closingDate: (rec as any).closingDate || "—",
              lmpCode: (rec as any).lmpCode || rec.id.slice(0, 8),
              lmpId: rec.id,
              matchStatus,
            });
          }
        }
      }
    }

    return { uniqueCount: uniqueKeys.size, recordCount: rows.length, rows };
  }, [filteredRecords, filteredCandidates, candidatesByLmp, studentRoster]);

  /* ─────── Per-cohort conversion count (matched rows only) ─────── */
  const convertedPerCohort = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of convertedStudentsData.rows) {
      if (row.matchStatus === "matched" && row.cohort && row.cohort !== "—") {
        m.set(row.cohort, (m.get(row.cohort) ?? 0) + 1);
      }
    }
    return m;
  }, [convertedStudentsData.rows]);

  const todaySet = useTodayDailyLogIds();
  const [drill, setDrill] = useState<DrillState | null>(null);
  const [domainLoadView, setDomainLoadView] = useState<DomainLoadView>("table");
  const [domainLoadFilter, setDomainLoadFilter] = useState("all");
  const [domainLoadSort, setDomainLoadSort] = useState<{ key: DomainSortKey; dir: "asc" | "desc" }>({
    key: "activeLoad",
    dir: "desc",
  });

  const canonicalDomains = useMemo(
    () => (domainRows as any[])
      .map((d: any) => ({
        id: d?.id ?? d?.slug ?? "",
        name: d?.name ?? "",
        slug: d?.slug ?? "",
        aliases: Array.isArray(d?.aliases) ? d.aliases : [],
      }))
      .filter((d) => d.name),
    [domainRows],
  );

  // ── Performance metrics ──────────────────────────────────────────────────────
  // Formula (POC, POD, domain): Converted ÷ (Converted + Not Converted) × 100.
  // offer-received counts as Converted (canonical lmpStatusCounts mapping).
  // All computations respect active filters via filteredRecords.

  const bestPoc = useMemo(() => {
    // Group by prepPocId (UUID) to deduplicate assignments; display name from prepPoc.name.
    const byPocId = new Map<string, { name: string; converted: number; notConverted: number }>();
    for (const r of filteredRecords) {
      if (!r.prepPocId) continue;
      const entry = byPocId.get(r.prepPocId) ?? {
        name: r.prepPoc?.name ?? r.prepPocId,
        converted: 0,
        notConverted: 0,
      };
      if (r.status === "converted" || r.status === "offer-received") entry.converted += 1;
      else if (r.status === "not-converted") entry.notConverted += 1;
      byPocId.set(r.prepPocId, entry);
    }
    return rankPerformance(Array.from(byPocId.values()));
  }, [filteredRecords]);

  const bestDomain = useMemo(() => {
    // Group by canonical domain name (resolved via aliases → primary name).
    const byDomain = new Map<string, { converted: number; notConverted: number }>();
    for (const r of filteredRecords) {
      const domainName = resolveDomainName(r.domain, canonicalDomains) ?? r.domain ?? "";
      if (!domainName || domainName.toLowerCase() === "unmapped") continue;
      const entry = byDomain.get(domainName) ?? { converted: 0, notConverted: 0 };
      if (r.status === "converted" || r.status === "offer-received") entry.converted += 1;
      else if (r.status === "not-converted") entry.notConverted += 1;
      byDomain.set(domainName, entry);
    }
    return rankPerformance(
      Array.from(byDomain.entries()).map(([name, e]) => ({ name, ...e })),
    );
  }, [filteredRecords, canonicalDomains]);

  const domainAnalytics = useMemo(() => {
    type MutableDomain = {
      domain: string;
      lmpIds: Set<string>;
      activeIds: Set<string>;
      convertedIds: Set<string>;
      placedStudents: Set<string>;
      optedStudents: Set<string>;
    };
    const byDomain = new Map<string, MutableDomain>();
    const getDomain = (domain: string) => {
      const existing = byDomain.get(domain);
      if (existing) return existing;
      const next: MutableDomain = {
        domain,
        lmpIds: new Set(),
        activeIds: new Set(),
        convertedIds: new Set(),
        placedStudents: new Set(),
        optedStudents: new Set(),
      };
      byDomain.set(domain, next);
      return next;
    };

    for (const rec of filteredRecords) {
      const domain = resolveDomainName(rec.domain, canonicalDomains) ?? rec.domain?.trim();
      if (!domain || domain.toLowerCase() === "unmapped") continue;
      const row = getDomain(domain);
      row.lmpIds.add(rec.id);
      if (ACTIVE_LMP_STATUSES.has(rec.status)) row.activeIds.add(rec.id);
      if (CONVERTED_LMP_STATUSES.has(rec.status)) row.convertedIds.add(rec.id);
      if (rec.status === "converted") {
        parseConvertedNames(rec.finalConvertedNames).forEach((name) => row.placedStudents.add(normalizeConvertedName(name)));
      }
    }

    for (const student of studentRoster) {
      const studentKey = normalizeConvertedName(student.name);
      if (!studentKey) continue;
      const studentDomains = new Set<string>();
      [student.primaryDomain, student.secondaryDomain].forEach((raw) => {
        const domain = resolveDomainName(raw, canonicalDomains);
        if (domain) studentDomains.add(domain);
      });
      studentDomains.forEach((domain) => getDomain(domain).optedStudents.add(studentKey));
    }

    const rawRows = Array.from(byDomain.values()).filter(
      (row) => row.lmpIds.size > 0 || row.optedStudents.size > 0 || row.placedStudents.size > 0,
    );
    const visibleLmpRows = rawRows.filter((row) => row.lmpIds.size > 0);
    const highestActive = Math.max(0, ...visibleLmpRows.map((row) => row.activeIds.size));
    const overallPlaced = new Set<string>();
    const overallOpted = new Set<string>();
    rawRows.forEach((row) => {
      row.placedStudents.forEach((id) => overallPlaced.add(id));
      row.optedStudents.forEach((id) => overallOpted.add(id));
    });
    const overallConversion = overallOpted.size ? (overallPlaced.size / overallOpted.size) * 100 : null;
    const optedMedian = rawRows.length
      ? [...rawRows].map((row) => row.optedStudents.size).sort((a, b) => a - b)[Math.floor(rawRows.length / 2)] ?? 0
      : 0;

    const rows: DomainAnalyticsRow[] = rawRows.map((row) => {
      const conversionPct = row.optedStudents.size
        ? (row.placedStudents.size / row.optedStudents.size) * 100
        : null;
      let insight: DomainAnalyticsRow["insight"] = "Balanced";
      if (row.activeIds.size === 0) insight = "No current load";
      else if (highestActive > 0 && row.activeIds.size === highestActive) insight = "Highest load";
      else if (conversionPct != null && overallConversion != null && conversionPct > overallConversion && row.placedStudents.size > 0) insight = "Strong conversion";
      else if (row.optedStudents.size >= optedMedian && (conversionPct == null || conversionPct < Math.max(15, overallConversion ?? 0))) insight = "Watchlist";

      return {
        rank: 0,
        domain: row.domain,
        totalLmps: row.lmpIds.size,
        activeLoad: row.activeIds.size,
        convertedLmps: row.convertedIds.size,
        studentsPlaced: row.placedStudents.size,
        studentsOpted: row.optedStudents.size,
        conversionPct,
        insight,
      };
    });

    rows.sort((a, b) => {
      const loadDiff = b.activeLoad - a.activeLoad;
      if (loadDiff) return loadDiff;
      const totalDiff = b.totalLmps - a.totalLmps;
      if (totalDiff) return totalDiff;
      return a.domain.localeCompare(b.domain);
    });
    rows.forEach((row, index) => { row.rank = index + 1; });
    return rows;
  }, [canonicalDomains, filteredRecords, studentRoster]);

  const visibleDomainRows = useMemo(() => {
    const scoped = domainLoadFilter === "all"
      ? domainAnalytics
      : domainAnalytics.filter((row) => row.domain === domainLoadFilter);
    const sorted = [...scoped].sort((a, b) => {
      const dir = domainLoadSort.dir === "asc" ? 1 : -1;
      if (domainLoadSort.key === "domain") return dir * a.domain.localeCompare(b.domain);
      if (domainLoadSort.key === "conversionPct") {
        const av = a.conversionPct ?? -1;
        const bv = b.conversionPct ?? -1;
        const diff = av - bv;
        return diff ? dir * diff : a.domain.localeCompare(b.domain);
      }
      const diff = Number(a[domainLoadSort.key]) - Number(b[domainLoadSort.key]);
      if (diff) return dir * diff;
      const loadDiff = b.activeLoad - a.activeLoad;
      if (loadDiff) return loadDiff;
      const totalDiff = b.totalLmps - a.totalLmps;
      if (totalDiff) return totalDiff;
      return a.domain.localeCompare(b.domain);
    });
    return sorted.map((row, index) => ({ ...row, rank: index + 1 }));
  }, [domainAnalytics, domainLoadFilter, domainLoadSort]);

  const domainTotals = useMemo(() => {
    const visibleDomains = new Set(visibleDomainRows.map((row) => row.domain));
    const totalLmpIds = new Set<string>();
    const activeLmpIds = new Set<string>();
    const convertedLmpIds = new Set<string>();
    const placedStudents = new Set<string>();
    const optedStudents = new Set<string>();

    for (const rec of filteredRecords) {
      const domain = resolveDomainName(rec.domain, canonicalDomains) ?? rec.domain?.trim();
      if (!domain || !visibleDomains.has(domain)) continue;
      totalLmpIds.add(rec.id);
      if (ACTIVE_LMP_STATUSES.has(rec.status)) activeLmpIds.add(rec.id);
      if (CONVERTED_LMP_STATUSES.has(rec.status)) convertedLmpIds.add(rec.id);
      if (rec.status === "converted") {
        parseConvertedNames(rec.finalConvertedNames).forEach((name) => placedStudents.add(normalizeConvertedName(name)));
      }
    }

    for (const student of studentRoster) {
      const studentKey = normalizeConvertedName(student.name);
      if (!studentKey) continue;
      const studentDomains = [student.primaryDomain, student.secondaryDomain]
        .map((raw) => resolveDomainName(raw, canonicalDomains))
        .filter((domain): domain is string => !!domain);
      if (studentDomains.some((domain) => visibleDomains.has(domain))) {
        optedStudents.add(studentKey);
      }
    }

    return {
      totalDomains: visibleDomainRows.length,
      totalLmps: totalLmpIds.size,
      activeLoad: activeLmpIds.size,
      convertedLmps: convertedLmpIds.size,
      studentsPlaced: placedStudents.size,
      studentsOpted: optedStudents.size,
      conversionPct: optedStudents.size ? (placedStudents.size / optedStudents.size) * 100 : null,
      highestLoad: [...visibleDomainRows].sort((a, b) => {
        const loadDiff = b.activeLoad - a.activeLoad;
        if (loadDiff) return loadDiff;
        const totalDiff = b.totalLmps - a.totalLmps;
        if (totalDiff) return totalDiff;
        return a.domain.localeCompare(b.domain);
      })[0]?.domain ?? "—",
    };
  }, [canonicalDomains, filteredRecords, studentRoster, visibleDomainRows]);

  // ── Drill openers ──
  const openLmps = (rows: typeof filtered, title: string, subtitle?: string) =>
    setDrill({ kind: "lmps", title, subtitle, rows });
  const openDomainLmps = (domain: string, subtitle?: string) => {
    const matched = filtered.filter((p) => (resolveDomainName(p.domain, canonicalDomains) ?? p.domain ?? "Unmapped") === domain);
    openLmps(matched, `${domain} · LMPs`, subtitle ?? `${matched.length} LMPs in current view`);
  };
  const setDomainSortKey = (key: DomainSortKey) => {
    setDomainLoadSort((current) => ({
      key,
      dir: current.key === key && current.dir === "desc" ? "asc" : "desc",
    }));
  };
  const maxDomainMetrics = useMemo(() => ({
    totalLmps: Math.max(1, ...visibleDomainRows.map((row) => row.totalLmps)),
    activeLoad: Math.max(1, ...visibleDomainRows.map((row) => row.activeLoad)),
    convertedLmps: Math.max(1, ...visibleDomainRows.map((row) => row.convertedLmps)),
    studentsPlaced: Math.max(1, ...visibleDomainRows.map((row) => row.studentsPlaced)),
    studentsOpted: Math.max(1, ...visibleDomainRows.map((row) => row.studentsOpted)),
  }), [visibleDomainRows]);
  const exportDomainCsv = () => {
    const metadata = [
      ["Exported At", new Date().toISOString()],
      ["Applied Filters", JSON.stringify(filters)],
      ["Selected View", domainLoadView],
      ["Domain Filter", domainLoadFilter === "all" ? "All Domains" : domainLoadFilter],
      [],
    ];
    const headers = [
      "Rank",
      "Domain",
      "Total LMPs (Till Today)",
      "Active Load",
      "Converted LMPs",
      "Students Placed",
      "Total student opted",
      "Conversion %",
      "Insight",
    ];
    const body = visibleDomainRows.map((row) => [
      row.rank,
      row.domain,
      row.totalLmps,
      row.activeLoad,
      row.convertedLmps,
      row.studentsPlaced,
      row.studentsOpted,
      formatConversion(row.conversionPct),
      row.insight,
    ]);
    const csv = [
      ...metadata.map((line) => line.map(csvEscape).join(",")),
      headers.map(csvEscape).join(","),
      ...body.map((line) => line.map(csvEscape).join(",")),
    ].join("\n");
    downloadDashboardCsv(`domain-load-${domainLoadView}.csv`, csv);
  };
  const openStatus = (status: ActiveLmpStatus) => {
    const ids = new Set(
      filteredRecords
        .filter((row) => canonicalStatus(row.status) === status)
        .map((row) => row.id),
    );
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      `${STATUS_META[status].label} LMPs`,
      `${filtered.length} in current view`,
    );
  };
  const openSnapshot = (kind: "active" | "high" | Parameters<typeof snapshotDrill>[0]) => {
    const { rows, title } = snapshotDrill(kind as any, filtered, todaySet, candidateCountByLmp);
    openLmps(rows, title, `${rows.length} of ${filtered.length} in view`);
  };

  return (
    <LuminaShell>
      <LxPageHeader
        crumb="ADMIN · DASHBOARD"
        title="LMP Health"
        right={
          <div className="flex items-center gap-2">
            {headerExtra}
            <LxLivePill />
          </div>
        }
      />

      <LxLmpFilters
        filters={filters}
        set={set}
        pocOptions={prepPocOptions}
        domainOptions={domainOptions}
        statusOptions={statusOptions}
        typeOptions={typeOptions}
        showPrepPoc
        showOutreachPoc
      />

      {/* ─────── SECTION 1: LMP Health Summary ─────── */}
      <LmpHealthSummaryCard
        total={filteredRecords.length}
        lsc={lsc}
        isLoading={lmpLoading}
        onStatusClick={openStatus}
      />

      {/* ─────── SECTION 2: Prep POC Heatmap ─────── */}
      <PrepPocHeatmapCard
        filteredLmpIds={filteredRecords.map((r) => r.id)}
        filters={filters as Record<string, unknown>}
      />

      {/* ─────── SECTION 4: Domain load (calculated from filtered scope) ─────── */}
      <LxSectionBlock>
      <LxGrid>
        <LxCard span={12} className="overflow-hidden">
          <LxCardHeader
            eyebrow="Active load"
            title="Domain load"
            info={info("admin.domain.bar")}
            right={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="inline-flex rounded-lg p-0.5" style={{ background: "var(--lx-soft)", border: "1px solid var(--lx-border)" }}>
                  {(["table", "heatmap"] as const).map((view) => (
                    <button
                      key={view}
                      type="button"
                      onClick={() => setDomainLoadView(view)}
                      className="h-8 px-3 rounded-md text-[11.5px] font-semibold transition-colors"
                      style={{
                        background: domainLoadView === view ? "var(--lx-surface)" : "transparent",
                        color: domainLoadView === view ? LX_HEX.info : "var(--lx-text-2)",
                        boxShadow: domainLoadView === view ? "0 1px 2px rgba(16,33,63,0.08)" : "none",
                      }}
                    >
                      {view === "table" ? "Table" : "Heatmap"}
                    </button>
                  ))}
                </div>
                <select
                  value={domainLoadFilter}
                  onChange={(event) => setDomainLoadFilter(event.target.value)}
                  className="h-9 rounded-lg border bg-transparent px-3 text-[11.5px] font-medium outline-none"
                  style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-2)", background: "var(--lx-surface)" }}
                  aria-label="Filter domain load"
                >
                  <option value="all">All Domains</option>
                  {domainAnalytics.map((row) => (
                    <option key={row.domain} value={row.domain}>{row.domain}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={exportDomainCsv}
                  disabled={visibleDomainRows.length === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-[11.5px] font-semibold transition-colors hover:bg-[var(--lx-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  style={{ borderColor: "var(--lx-border)", color: "var(--lx-text)" }}
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </div>
            }
          />

          <div className="mb-4 grid grid-cols-1 gap-x-6 gap-y-gutter sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total Domains", value: domainTotals.totalDomains.toLocaleString(), sub: "In selected scope", accent: "info" as LxAccent },
              { label: "Total LMPs", value: domainTotals.totalLmps.toLocaleString(), sub: "Till today", accent: "neutral" as LxAccent },
              { label: "Active Load", value: domainTotals.activeLoad.toLocaleString(), sub: "Not started + prep ongoing + prep done", accent: "teal" as LxAccent },
              { label: "Highest Load", value: domainTotals.highestLoad, sub: "Tie: total LMPs, then A-Z", accent: "success" as LxAccent },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-2xl border px-4 py-3"
                style={{ borderColor: "var(--lx-border)", background: "linear-gradient(180deg, var(--lx-surface), var(--lx-soft))" }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[10.5px] font-semibold uppercase tracking-[0.9px]" style={{ color: "var(--lx-text-3)" }}>{item.label}</div>
                  <span className="h-2 w-2 rounded-full" style={{ background: LX_HEX[item.accent] }} />
                </div>
                <div className="mt-2 truncate text-[24px] font-semibold leading-none tabular-nums" title={item.value} style={{ color: "var(--lx-text)" }}>{item.value}</div>
                <div className="mt-1 truncate text-[11px]" style={{ color: "var(--lx-text-3)" }}>{item.sub}</div>
              </div>
            ))}
          </div>

          {visibleDomainRows.length === 0 ? (
            <div className="rounded-2xl border px-4 py-10 text-center text-[12.5px]" style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-3)" }}>
              No domain load data is available for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--lx-border)" }}>
              <table className="min-w-[1060px] w-full border-collapse text-[12px]">
                <thead>
                  <tr style={{ background: "var(--lx-soft)" }}>
                    {[
                      ["rank", "Rank"],
                      ["domain", "Domain"],
                      ["totalLmps", "Total LMPs (Till Today)"],
                      ["activeLoad", "Active Load"],
                      ["convertedLmps", "Converted LMPs"],
                      ["studentsPlaced", "Students Placed"],
                      ["studentsOpted", "Total student opted"],
                      ["conversionPct", "Conversion %"],
                    ].map(([key, label]) => (
                      <th key={key} className="px-3 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.6px]" style={{ color: "var(--lx-text-3)", borderBottom: "1px solid var(--lx-border)" }}>
                        <button
                          type="button"
                          onClick={() => setDomainSortKey(key as DomainSortKey)}
                          className="inline-flex items-center gap-1 rounded-md hover:text-[var(--lx-text)]"
                          aria-label={`Sort by ${label}`}
                        >
                          {label}
                          <ArrowUpDown className="h-3 w-3 opacity-60" />
                        </button>
                      </th>
                    ))}
                    {domainLoadView === "table" && (
                      <th className="px-3 py-3 text-left text-[10.5px] font-semibold uppercase tracking-[0.6px]" style={{ color: "var(--lx-text-3)", borderBottom: "1px solid var(--lx-border)" }}>
                        Insight
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleDomainRows.map((row) => {
                    const activePct = (row.activeLoad / maxDomainMetrics.activeLoad) * 100;
                    const heat = (value: number, max: number, palette: string[]) => {
                      if (value === 0) return palette[0];
                      const intensity = value / Math.max(1, max);
                      if (intensity <= 0.25) return palette[1];
                      if (intensity <= 0.5) return palette[2];
                      if (intensity <= 0.75) return palette[3];
                      return palette[4];
                    };
                    const conversionHeat = row.conversionPct == null
                      ? "rgba(122,117,108,0.07)"
                      : row.conversionPct >= 50 ? "rgba(106,158,98,0.18)" : row.conversionPct >= 20 ? "rgba(247,211,68,0.22)" : "rgba(240,112,64,0.16)";
                    const metricClass = "px-3 py-3 text-left font-semibold tabular-nums";
                    return (
                      <tr key={row.domain} className="group transition-colors hover:bg-[var(--lx-soft)]">
                        <td className="px-3 py-3 font-mono tabular-nums" style={{ color: "var(--lx-text-3)", borderBottom: "1px solid var(--lx-border)" }}>#{row.rank}</td>
                        <td className="sticky left-0 z-[1] px-3 py-3 font-semibold" style={{ color: "var(--lx-text)", background: "var(--lx-surface)", borderBottom: "1px solid var(--lx-border)" }}>
                          <button type="button" onClick={() => openDomainLmps(row.domain, `${row.activeLoad} active · ${row.totalLmps} total`)} className="text-left hover:underline underline-offset-4">
                            {row.domain}
                          </button>
                        </td>
                        {domainLoadView === "table" ? (
                          <>
                            <td className={metricClass} style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <button onClick={() => openDomainLmps(row.domain)} className="rounded-full px-2 py-1 hover:underline" style={{ background: "rgba(74,142,232,0.10)", color: "var(--lx-text)" }}>{row.totalLmps}</button>
                            </td>
                            <td className="px-3 py-3" style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <button type="button" onClick={() => openDomainLmps(row.domain, `${row.activeLoad} active LMPs`)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 text-left">
                                <span className="h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(74,142,232,0.12)" }}>
                                  <span className="block h-full rounded-full transition-all" style={{ width: `${activePct}%`, background: LX_HEX.info }} />
                                </span>
                                <span className="font-mono font-semibold tabular-nums" style={{ color: "var(--lx-text)" }}>{row.activeLoad}</span>
                              </button>
                            </td>
                            <td className={metricClass} style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <span className="rounded-full px-2 py-1" style={{ background: "rgba(106,158,98,0.12)", color: LX_HEX.success }}>{row.convertedLmps}</span>
                            </td>
                            <td className={metricClass} style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <span className="rounded-full px-2 py-1" style={{ background: "rgba(109,40,217,0.10)", color: LX_HEX.ai }}>{row.studentsPlaced}</span>
                            </td>
                            <td className={metricClass} style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <span className="rounded-full px-2 py-1" style={{ background: "rgba(227,131,48,0.12)", color: LX_HEX.orange }}>{row.studentsOpted}</span>
                            </td>
                            <td className={metricClass} style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <span className="rounded-full px-2 py-1" style={{ background: `${LX_HEX[pctClass(row.conversionPct)]}1f`, color: LX_HEX[pctClass(row.conversionPct)] }}>{formatConversion(row.conversionPct)}</span>
                            </td>
                            <td className="px-3 py-3" style={{ borderBottom: "1px solid var(--lx-border)" }}>
                              <span className="rounded-full px-2 py-1 text-[11px] font-medium" style={{ background: "var(--lx-soft)", color: "var(--lx-text-2)" }} title="Rule-based signal from active load, student interest, and conversion.">
                                {row.insight}
                              </span>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className={metricClass} style={{ background: heat(row.totalLmps, maxDomainMetrics.totalLmps, ["#f8fafc", "#eef4fb", "#dfeafa", "#cbdcf5", "#b5ccef"]), border: "1px solid #fff" }}>{row.totalLmps}</td>
                            <td className={metricClass} style={{ background: heat(row.activeLoad, maxDomainMetrics.activeLoad, ["#f8fbff", "#ecf4fe", "#d8e8fd", "#b7d3f8", "#93bdf4"]), border: "1px solid #fff" }}>{row.activeLoad}</td>
                            <td className={metricClass} style={{ background: heat(row.convertedLmps, maxDomainMetrics.convertedLmps, ["#f8fcf6", "#eaf6e2", "#d5edcb", "#b9dfae", "#9ccc90"]), border: "1px solid #fff" }}>{row.convertedLmps}</td>
                            <td className={metricClass} style={{ background: heat(row.studentsPlaced, maxDomainMetrics.studentsPlaced, ["#fcfaff", "#f2e8fd", "#e3d1fa", "#cdb4f1", "#b99be8"]), border: "1px solid #fff" }}>{row.studentsPlaced}</td>
                            <td className={metricClass} style={{ background: heat(row.studentsOpted, maxDomainMetrics.studentsOpted, ["#fffaf6", "#fef3e8", "#fde1c9", "#f6c18f", "#efaa69"]), border: "1px solid #fff" }}>{row.studentsOpted}</td>
                            <td className={metricClass} style={{ background: conversionHeat, border: "1px solid #fff" }}>{formatConversion(row.conversionPct)}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                  <tr style={{ background: "var(--lx-soft)" }}>
                    <td className="px-3 py-3 font-semibold" style={{ borderTop: "2px solid var(--lx-border)", color: "var(--lx-text)" }}>TOTAL</td>
                    <td className="sticky left-0 z-[1] px-3 py-3 font-semibold" style={{ borderTop: "2px solid var(--lx-border)", color: "var(--lx-text)", background: "var(--lx-soft)" }}>
                      {domainTotals.totalDomains} domains
                    </td>
                    <td className="px-3 py-3 font-semibold tabular-nums" style={{ borderTop: "2px solid var(--lx-border)", color: LX_HEX.info }}>{domainTotals.totalLmps}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums" style={{ borderTop: "2px solid var(--lx-border)", color: LX_HEX.teal }}>{domainTotals.activeLoad}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums" style={{ borderTop: "2px solid var(--lx-border)", color: LX_HEX.success }}>{domainTotals.convertedLmps}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums" style={{ borderTop: "2px solid var(--lx-border)", color: LX_HEX.ai }}>{domainTotals.studentsPlaced}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums" style={{ borderTop: "2px solid var(--lx-border)", color: LX_HEX.orange }}>{domainTotals.studentsOpted}</td>
                    <td className="px-3 py-3 font-semibold tabular-nums" style={{ borderTop: "2px solid var(--lx-border)", color: LX_HEX[pctClass(domainTotals.conversionPct)] }}>{formatConversion(domainTotals.conversionPct)}</td>
                    {domainLoadView === "table" && <td className="px-3 py-3" style={{ borderTop: "2px solid var(--lx-border)" }} />}
                  </tr>
                </tbody>
              </table>
              {domainLoadView === "heatmap" && (
                <div className="flex items-center justify-end gap-2 border-t px-4 py-3 text-[11px]" style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-3)" }}>
                  <span>Low</span>
                  {["#f8fbff", "#ecf4fe", "#d8e8fd", "#b7d3f8", "#93bdf4"].map((color) => (
                    <span key={color} className="h-3 w-3 rounded-[3px] border border-white" style={{ background: color }} />
                  ))}
                  <span>High</span>
                </div>
              )}
            </div>
          )}
        </LxCard>
      </LxGrid>
      </LxSectionBlock>

      {/* ─────── SECTION 4.5: Student analytics ─────── */}
      <LxSectionBlock>
      <LxSection
        eyebrow="Student analytics"
        title="Student distribution, participation, and inactivity snapshot"
        info={info("admin.students.in-process")}
      />

      {/* Row 1 — 8 KPI cards in one row */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="grid grid-cols-8 gap-6 min-w-[1040px]">
        <LxKpi compact label="Total Students" accent="info" value={totalStudentsDb}
          sub="Live · students DB" info={info("admin.students.total-db")}
          onClick={() => setDrill({ kind: "students", title: "All students", subtitle: "Live students DB", rows: studentsInBucket(studentRoster, { bucket: "all" }) })} />
        <LxKpi compact label="Students in Selected LMPs" accent="teal" value={studentsInSelectedLmps.count}
          sub="Unique via lmp_candidates" info={info("admin.students.selected-lmps")}
          onClick={() => setDrill({ kind: "students", title: "Students in selected LMPs", subtitle: `${studentsInSelectedLmps.count} unique students in current scope`, rows: studentsInSelectedLmps.rows })} />
        <LxKpi compact label="Students in Active Processes" accent="success" value={studentStats.activeStudents}
          sub="active_lmp_count ≥ 1" info={info("admin.students.active-processes")}
          onClick={() => setDrill({ kind: "students", title: "Students in active processes", subtitle: "≥ 1 active LMP", rows: studentsInBucket(studentRoster, { bucket: "active" }) })} />
        <LxKpi compact label="In 1 Active Process" accent="success" value={studentStats.singleProcess}
          sub="Exactly 1 active LMP" info={info("admin.students.one-active")}
          onClick={() => setDrill({ kind: "students", title: "In 1 active process", rows: studentsInBucket(studentRoster, { bucket: "single" }) })} />
        <LxKpi compact label="In 2+ Active Processes" accent="ai" value={studentStats.multipleProcesses}
          sub="2+ active LMPs" info={info("admin.students.two-plus-active")}
          onClick={() => setDrill({ kind: "students", title: "In 2+ active processes", rows: studentsInBucket(studentRoster, { bucket: "multiple" }) })} />
        <LxKpi compact label="No Active Process" accent="risk" value={studentStats.noActiveProcess}
          sub="Excl. opted-out" info={info("admin.students.no-active")}
          onClick={() => setDrill({ kind: "students", title: "No active process", subtitle: "Eligible students with zero active LMPs", rows: studentsInBucket(studentRoster, { bucket: "no-active" }) })} />
        <LxKpi compact label="Opted Out" accent="orange" value={studentStats.optedOutStudents}
          sub="Withdrawn / not participating" info={info("admin.students.opted-out")}
          onClick={() => setDrill({ kind: "students", title: "Opted-out students", subtitle: "placement_status = opted-out or equivalent", rows: studentsInBucket(studentRoster, { bucket: "opted-out" }) })} />
        <LxKpi compact label="Converted Students" accent="success"
          value={convertedStudentsData.uniqueCount}
          sub={studentStats.eligibleStudents > 0 ? `${((convertedStudentsData.uniqueCount / studentStats.eligibleStudents) * 100).toFixed(0)}% of eligible` : "Unique in scope"}
          info={info("admin.students.converted")}
          onClick={() => setDrill({
            kind: "converted-students",
            title: "Converted Students",
            subtitle: `${convertedStudentsData.uniqueCount} unique · ${convertedStudentsData.recordCount} records`,
            rows: convertedStudentsData.rows,
          })} />
        </div>
      </div>

      {/* Row 2 — cohort distribution */}
      <LxGrid>
        {Object.keys(studentStats.cohortAgg).length === 0 ? (
          <LxCard span={12}>
            <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--lx-text-3)" }}>
              No students in DB yet.
            </div>
          </LxCard>
        ) : (
          Object.entries(studentStats.cohortAgg)
            .filter(([, c]) => c && typeof c === "object")
            .sort((a, b) => (b[1]?.total ?? 0) - (a[1]?.total ?? 0))
            .map(([cohort, c]) => {
              const eligible = c.total - c.optedOut;
              const active = c.single + c.multiple;
              const cohortConverted = convertedPerCohort.get(cohort) ?? 0;
              const convPct = eligible > 0 ? (cohortConverted / eligible) * 100 : null;
              const openCohort = (bucket: "single" | "multiple" | "no-active" | "opted-out" | "all", subtitle: string) =>
                setDrill({ kind: "students", title: `${cohort} · ${subtitle}`, rows: studentsInBucket(studentRoster, { cohort, bucket }) });

              const cohortCsvRows = studentsInBucket(studentRoster, { cohort, bucket: "all" });
              const exportCohortCsv = () => {
                const h = ["name", "email", "cohort", "primaryDomain", "secondaryDomain", "placementStatus", "activeLmpCount", "lmpCount"];
                const body = cohortCsvRows.map((s) => h.map((k) => csvEscape((s as any)[k])).join(",")).join("\n");
                downloadDashboardCsv(`cohort-${cohort.replace(/\s+/g, "-").toLowerCase()}.csv`, `${h.join(",")}\n${body}`);
              };

              return (
                <CohortSummaryCard
                  key={cohort}
                  cohort={cohort}
                  total={c.total}
                  eligible={eligible}
                  active={active}
                  converted={cohortConverted}
                  cohortConverted={cohortConverted}
                  convPct={convPct}
                  single={c.single}
                  multiple={c.multiple}
                  inactive={c.inactive}
                  optedOut={c.optedOut}
                  onSegmentClick={(bucket) => {
                    const subtitles: Record<typeof bucket, string> = {
                      single: "in 1 active process",
                      multiple: "in 2+ active processes",
                      "no-active": "no active process",
                      "opted-out": "opted out",
                    };
                    openCohort(bucket, subtitles[bucket]);
                  }}
                  onExport={exportCohortCsv}
                />
              );
            })
        )}
      </LxGrid>
      </LxSectionBlock>

      {/* Action required (high-priority only) + Recent activity */}
      <LxGrid>
        <ActionRequiredCard
          rows={filtered}
          todaySet={todaySet}
          title="High-priority action items"
          eyebrow="Pending actions"
          limit={25}
          span={7}
        />
        <RecentActivityCard lmpIds={Array.from(filteredIds)} limit={20} span={5} />
      </LxGrid>

      <LxAttentionStrip
        stretch
        items={[
          {
            label: "Highest Performing POC",
            value: bestPoc ? bestPoc.name : "—",
            sub: bestPoc
              ? `${bestPoc.converted}/${bestPoc.eligible} · ${bestPoc.pct.toFixed(0)}%`
              : "No eligible outcomes",
            accent: "success",
            info: info("attention.best-poc"),
            onClick: bestPoc
              ? () => openLmps(lmpsForPoc(filtered, bestPoc.name, "prep"), `${bestPoc.name} · LMPs`)
              : undefined,
          },
          {
            label: "Best Performing Domain",
            value: bestDomain ? bestDomain.name : "—",
            sub: bestDomain
              ? `${bestDomain.converted}/${bestDomain.eligible} · ${bestDomain.pct.toFixed(0)}%`
              : "No eligible outcomes",
            accent: "teal",
            info: info("attention.best-domain"),
            onClick: bestDomain
              ? () => openLmps(lmpsForDomain(filtered, bestDomain.name), `${bestDomain.name} · LMPs`)
              : undefined,
          },
          {
            label: "Most Overloaded POC",
            value: mostOverloadedPocName,
            accent: "orange",
            info: info("attention.most-overloaded-poc"),
            onClick: () => openLmps(lmpsForPoc(all, mostOverloadedPocName, "any"), `${mostOverloadedPocName} · LMPs`),
          },
        ]}
      />

      {/* ─────── Flagged LMPs (moved to bottom) ─────── */}
      <LxSectionBlock>
      <RecentSnapshotStrip
        rows={filtered}
        todaySet={todaySet}
        zeroCandidateCount={zeroCandidateLmpsCount}
        onItemClick={openSnapshot}
      />
      </LxSectionBlock>

      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </LuminaShell>
  );
}

