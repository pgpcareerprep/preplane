import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader, LxSection,
  LxHero, LxKpi, LxStackedBar, LxDonut, LxRankedBar, LxHeatmap, LxAttentionStrip,
  LxInsightTile, LX_HEX, type LxAccent,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters, uniquePocs, usePrepPocOptions } from "./filters/useLmpFilters";
import { useRole } from "@/lib/rolesContext";
import {
  DOMAINS, domainBreakdown, isConverted, isDormant, lmpStatusCounts, offerCounts, pocLoad, statusCounts,
  POC_OVERLOAD_THRESHOLD, calculateOutcomeConversionRate,
} from "@/lib/lmpProcessQueries";
// (cross-domain classification has moved to live `usePocPrimaryDomainMap`;
//  this dashboard does not consume it directly anymore.)
import { resolveDomainName } from "@/lib/domainAlias";

import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import { useLmpRows } from "@/lib/sheets/hooks";
import { useDomains } from "@/lib/hooks/useDbData";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { SyncIndicator } from "@/components/sheets/SyncIndicator";
import { useTodayDailyLogIds } from "@/lib/hooks/useTodayDailyLogIds";
import { ActionRequiredCard } from "./sections/ActionRequiredCard";
import { RecentSnapshotStrip } from "./sections/RecentSnapshotStrip";
import { RecentActivityCard } from "./sections/RecentActivityCard";
import { LxDrillDown, type DrillState } from "@/components/insights/LxDrillDown";
import { info } from "@/lib/dashboardInfo";
import {
  lmpsByStatus, lmpsForDomain, lmpsForPoc,
  studentsInBucket, studentsByPrimaryDomain, snapshotDrill,
} from "@/lib/dashboardDrill";
import { STATUSES, STATUS_META, type LmpStatus } from "@/lib/lmpTypes";

type ActiveLmpStatus = Exclude<LmpStatus, "ongoing" | "dormant" | "closed" | "converted-na" | "offer-received">;

const STATUS_ACCENT: Record<ActiveLmpStatus, LxAccent> = {
  "not-started": "neutral",
  "prep-ongoing": "info",
  "prep-done": "sky",
  hold: "ai",
  converted: "success",
  "not-converted": "neutral",
  "other-reasons": "risk",
};

function canonicalStatus(status: LmpStatus): ActiveLmpStatus {
  if (status === "ongoing") return "prep-ongoing";
  if (status === "offer-received") return "converted";
  if (status === "dormant" || status === "closed" || status === "converted-na") return "other-reasons";
  return status;
}

export function AdminLmpDashboard() {
  const { user } = useRole();
  const prepPocOptions = usePrepPocOptions();
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
          .select("name, cohort, primary_domain, secondary_domain, lmp_count, active_lmp_count")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        out.push(...rows);
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return out.map((s) => ({
        name: (s.name ?? "").trim(),
        cohort: (s.cohort ?? "").trim(),
        primaryDomain: (s.primary_domain ?? "").trim(),
        secondaryDomain: (s.secondary_domain ?? "").trim(),
        lmpCount: Number(s.lmp_count ?? 0),
        activeLmpCount: Number(s.active_lmp_count ?? 0),
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
  ]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["prep_poc_capacity_live_v2"]]);
  useRealtimeInvalidate("poc_profiles" as never, [
    ["prep_poc_capacity_live_v2"],
    ["attention_pocs"],
  ]);
  useRealtimeInvalidate("students" as never, [
    ["students_total_count"],
    ["students_roster_full"],
  ]);
  const { processes: liveProcesses, isLoading: lmpLoading } = useLiveProcesses();
  const { data: lmpRecords = [] } = useLmpRows();
  const { data: domainRows = [] } = useDomains();
  const { filtered, all, filters, set } = useLmpFilters({ role: "admin", userName: user.name, data: liveProcesses.length ? liveProcesses : undefined });
  const filteredIds = useMemo(() => new Set(filtered.map((row) => row.processId)), [filtered]);
  const filteredRecords = useMemo(
    () => lmpRecords.filter((row) => filteredIds.has(row.id)),
    [filteredIds, lmpRecords],
  );

  /* ─────── KPIs ─────── */
  const convertedCount = filteredRecords.filter((r) => r.status === "converted").length;
  const notConvertedCount = filteredRecords.filter((r) => r.status === "not-converted").length;
  const conversionRate = calculateOutcomeConversionRate(convertedCount, notConvertedCount);
  const converted = convertedCount;
  const ongoing = filtered.filter((r) => r.status === "Ongoing").length;
  const offerReceived = filtered.filter((r) => r.status === "Offer Received").length;
  const risk =
    filtered.filter((r) => r.status === "On Hold").length +
    filtered.filter(isDormant).length +
    filtered.filter((r) => r.status === "Closed").length;

  /* ─────── Status + Offer ─────── */
  const sc = statusCounts(filtered);
  const lsc = lmpStatusCounts(filteredRecords);
  const liveStatusSegments = STATUSES.map((rawStatus) => {
    const status = canonicalStatus(rawStatus);
    return {
      status,
      label: STATUS_META[status].label,
      value: lsc[status],
      accent: STATUS_ACCENT[status],
    };
  });
  const oc = offerCounts(filtered);

  /* ─────── Domains ─────── */
  const domains = useMemo(() => domainBreakdown(filteredRecords), [filteredRecords]);
  const sortedByLoad = [...domains].sort((a, b) => b.ongoing - a.ongoing);
  const highestLoad = sortedByLoad[0];
  const highestRisk = [...domains].sort((a, b) => b.risk - a.risk)[0];
  const fastestMoving = [...domains].sort(
    (a, b) => (b.converted / Math.max(1, b.total)) - (a.converted / Math.max(1, a.total)),
  )[0];

  /* ─────── POCs ─────── */
  const prepLoad = useMemo(() => pocLoad(filtered, "prep"), [filtered]);
  const outreachLoad = useMemo(() => pocLoad(filtered, "outreach"), [filtered]);
  const activePocs = new Set<string>();
  filtered.filter((r) => r.status === "Ongoing").forEach((r) => {
    activePocs.add(r.prepPoc); activePocs.add(r.outreachPoc);
  });
  const avgLoad = activePocs.size ? ongoing / activePocs.size : 0;
  const overloaded = prepLoad.filter((p) => p.ongoing > POC_OVERLOAD_THRESHOLD).length
    + outreachLoad.filter((p) => p.ongoing > POC_OVERLOAD_THRESHOLD).length;

  /* ─────── Capacity heatmap — fully live from POC DB + LMP DB ─────── */
  const { data: prepPocCapacity = [], isLoading: capacityLoading } = useQuery({
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
          const supportLinks = links.filter((l) => l.role === "support");
          const domainTags = Array.isArray(p.domain_tags) ? p.domain_tags.filter(Boolean) : [];
          const domainCtx = new Set<string>(
            [p.primary_domain, ...domainTags].filter(Boolean).map((d: string) => norm(d)),
          );

          const totalIds = new Set<string>();
          const prepActiveIds = new Set<string>();
          const supportActiveIds = new Set<string>();
          const inDomainIds = new Set<string>();
          const crossIds = new Set<string>();
          const statusIds: Record<string, Set<string>> = {
            notStarted: new Set(), prepOngoing: new Set(), prepDone: new Set(),
            hold: new Set(), converted: new Set(), notConverted: new Set(), otherReasons: new Set(),
          };

          prepLinks.forEach((l) => {
            const id = l.lmp_id;
            const st = norm(l.lmp_processes?.status);
            const dn = norm(l.lmp_processes?.domains?.name);
            totalIds.add(id);
            if (st === "not-started") statusIds.notStarted.add(id);
            else if (st === "prep-ongoing") statusIds.prepOngoing.add(id);
            else if (st === "prep-done") statusIds.prepDone.add(id);
            else if (st === "hold") statusIds.hold.add(id);
            else if (st === "converted") statusIds.converted.add(id);
            else if (st === "not-converted") statusIds.notConverted.add(id);
            else if (st === "other-reasons") statusIds.otherReasons.add(id);
            if (l.is_active && !TERMINAL.has(st)) {
              prepActiveIds.add(id);
              if (domainCtx.size && dn && !domainCtx.has(dn)) crossIds.add(id);
              else inDomainIds.add(id);
            }
          });
          supportLinks.forEach((l) => {
            const id = l.lmp_id;
            const st = norm(l.lmp_processes?.status);
            // Include support LMPs in the total and status breakdown.
            totalIds.add(id);
            if (st === "not-started") statusIds.notStarted.add(id);
            else if (st === "prep-ongoing") statusIds.prepOngoing.add(id);
            else if (st === "prep-done") statusIds.prepDone.add(id);
            else if (st === "hold") statusIds.hold.add(id);
            else if (st === "converted") statusIds.converted.add(id);
            else if (st === "not-converted") statusIds.notConverted.add(id);
            else if (st === "other-reasons") statusIds.otherReasons.add(id);
            if (l.is_active && !TERMINAL.has(st)) supportActiveIds.add(id);
          });

          return {
            name: (p.name ?? "").trim(),
            hasDomain: domainCtx.size > 0,
            historical: totalIds.size,
            active: prepActiveIds.size,
            supportActive: supportActiveIds.size,
            cross: crossIds.size,
            inDomain: inDomainIds.size,
            notStarted: statusIds.notStarted.size,
            prepOngoing: statusIds.prepOngoing.size,
            prepDone: statusIds.prepDone.size,
            hold: statusIds.hold.size,
            converted: statusIds.converted.size,
            notConverted: statusIds.notConverted.size,
            otherReasons: statusIds.otherReasons.size,
            ids: {
              total: totalIds,
              prepActive: prepActiveIds,
              supportActive: supportActiveIds,
              inDomain: inDomainIds,
              cross: crossIds,
              ...statusIds,
            },
          };
        })
        .filter((p) => p.name && (p.hasDomain || p.historical > 0 || p.supportActive > 0))
        .sort((a, b) => (b.active - a.active) || (b.historical - a.historical));


    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const capacityPocs = prepPocCapacity.map((p) => p.name);
  const capacityByName = useMemo(() => {
    const m = new Map<string, typeof prepPocCapacity[number]>();
    prepPocCapacity.forEach((p) => m.set(p.name, p));
    return m;
  }, [prepPocCapacity]);
  const heatmapMatrix = prepPocCapacity.map((p) => [
    p.historical,
    p.active,
    p.supportActive,
    p.inDomain,
    p.cross,
    p.notStarted,
    p.prepOngoing,
    p.prepDone,
    p.hold,
    p.converted,
    p.notConverted,
    p.otherReasons,
  ]);

  const loadTotals = prepPocCapacity.map((p) => p.active);

  /* ─────── Attention strip — live, source-of-truth queries ─────── */
  const { data: attentionPendingOffers = 0 } = useQuery({
    queryKey: ["attention_pending_offers"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lmp_processes")
        .select("*", { count: "exact", head: true })
        .ilike("status", "offer received");
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: attentionMissingPrepDocs = 0 } = useQuery({
    queryKey: ["attention_missing_prep_docs"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("lmp_processes")
        .select("*", { count: "exact", head: true })
        .or("prep_doc.is.null,prep_doc.eq.")
        .not("status", "in", '("Converted","Closed","Rejected")');
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const { data: attentionPocs = [] } = useQuery({
    queryKey: ["attention_pocs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_profiles")
        .select("name, active_load, max_threshold")
        .eq("status", "active");
      if (error) throw new Error(error.message);
      return (data ?? []).map((p: any) => ({
        name: (p.name ?? "").trim(),
        active: Number(p.active_load ?? 0),
        threshold: Number(p.max_threshold ?? 8),
      }));
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const mostOverloadedPocName =
    [...attentionPocs].sort((a, b) => b.active - a.active)[0]?.name ?? "—";
  const overloadedPocsCount = attentionPocs.filter((p) => p.active > p.threshold).length;
  const highestRiskDomainName =
    [...domainRows]
      .map((d: any) => ({
        name: d?.name ?? "—",
        risk: Number(d?.on_hold ?? 0) + Number(d?.dormant ?? 0) + Number(d?.closed ?? 0),
        total: Number(d?.total_lmps ?? 0),
      }))
      .sort((a, b) => b.risk - a.risk || b.total - a.total)[0]?.name ?? "—";

  /* ─────── Student analytics (live · students DB) ─────── */
  const studentStats = useMemo(() => {
    // Unique students in CURRENT filtered LMP view (derived from process name strings).
    const inViewNames = new Set<string>();
    filtered.forEach((r) => {
      [r.r1Shortlisted, r.r2Shortlisted, r.r3Shortlisted, r.finalConvert, r.convertNames]
        .filter(Boolean)
        .forEach((s) =>
          s.split(/[,/]/).map((n) => n.trim()).filter(Boolean).forEach((n) => inViewNames.add(n)),
        );
    });

    // Canonical counts come from the students DB (active_lmp_count is maintained
    // by the candidates trigger), so the strip reflects real DB state, not parsed strings.
    const rosterWithCohort = studentRoster.filter((s) => s.name && s.cohort);
    let active = 0, single = 0, multiple = 0, inactive = 0;
    studentRoster.forEach((s) => {
      const c = s.activeLmpCount;
      if (c === 0) inactive += 1;
      else if (c === 1) { single += 1; active += 1; }
      else { multiple += 1; active += 1; }
    });

    // Cohort split from students DB
    const cohortAgg: Record<string, { total: number; single: number; multiple: number; inactive: number }> = {};
    rosterWithCohort.forEach((s) => {
      const bucket = cohortAgg[s.cohort] ?? { total: 0, single: 0, multiple: 0, inactive: 0 };
      bucket.total += 1;
      const c = s.activeLmpCount;
      if (c === 0) bucket.inactive += 1;
      else if (c === 1) bucket.single += 1;
      else bucket.multiple += 1;
      cohortAgg[s.cohort] = bucket;
    });

    // Domain preference: bucket students by canonical domain (resolved via
    // `domains.aliases`). Anything that doesn't match a canonical name or alias
    // falls into "Unmapped" so the chart never shows raw sheet variants.
    const totalsByDomain = new Map<string, number>();
    const activeByDomain = new Map<string, number>();
    const canonicalDomains = domainRows.map((d: any) => ({
      id: d?.id ?? d?.slug ?? "",
      name: d?.name ?? "",
      slug: d?.slug ?? "",
      aliases: Array.isArray(d?.aliases) ? d.aliases : [],
    })).filter((d) => d.name);
    const UNMAPPED = "Unmapped";
    studentRoster.forEach((s) => {
      const canonical = resolveDomainName(s.primaryDomain, canonicalDomains) ?? UNMAPPED;
      totalsByDomain.set(canonical, (totalsByDomain.get(canonical) ?? 0) + 1);
      if (s.activeLmpCount > 0) {
        activeByDomain.set(canonical, (activeByDomain.get(canonical) ?? 0) + 1);
      }
    });
    // Rows come strictly from the domains table (canonical order). Hide the
    // synthetic "Unmapped" row when empty; keep zero-count canonical rows.
    const orderedNames = canonicalDomains
      .map((d) => d.name)
      .filter((n) => n.toLowerCase() !== "unmapped");
    const buildRows = (src: Map<string, number>) => {
      const rows = orderedNames.map((name) => ({ label: name, value: src.get(name) ?? 0 }));
      const unmappedCount = src.get(UNMAPPED) ?? 0;
      if (unmappedCount > 0) rows.push({ label: UNMAPPED, value: unmappedCount });
      return rows;
    };
    const domainRowsTotal = buildRows(totalsByDomain);
    const domainRowsActive = buildRows(activeByDomain);

    return {
      totalStudents: inViewNames.size,        // "In current view"
      activeStudents: active,                  // In Process (Unique) — live DB
      inactiveStudents: inactive,              // Inactive — live DB
      singleProcess: single,                   // live DB
      multipleProcesses: multiple,             // live DB
      cohortAgg,
      domainRowsTotal,
      domainRowsActive,
    };
  }, [filtered, studentRoster, domainRows]);

  const [domainPrefMode, setDomainPrefMode] = useState<"total" | "active">("total");
  const todaySet = useTodayDailyLogIds();
  const [drill, setDrill] = useState<DrillState | null>(null);

  // ── Drill openers ──
  const openLmps = (rows: typeof filtered, title: string, subtitle?: string) =>
    setDrill({ kind: "lmps", title, subtitle, rows });
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
    const { rows, title } = snapshotDrill(kind as any, filtered, todaySet);
    openLmps(rows, title, `${rows.length} of ${filtered.length} in view`);
  };

  // ── Heatmap cell drill (POC × LMP column) ──
  // Uses the same lmp_poc_links-derived ID sets that produced each cell count,
  // then resolves them to in-memory Process rows so the modal always matches.
  const onHeatmapCell = (cell: { row: string; colIndex: number; col: string; value: number }) => {
    const name = cell.row;
    const subtitle = `${cell.col} · ${cell.value} LMPs`;
    const cap = capacityByName.get(name);
    const COL_TO_SET = [
      "total", "prepActive", "supportActive", "inDomain", "cross",
      "notStarted", "prepOngoing", "prepDone", "hold",
      "converted", "notConverted", "otherReasons",
    ] as const;
    const setKey = COL_TO_SET[cell.colIndex];
    const ids = cap?.ids?.[setKey] as Set<string> | undefined;
    const rows = ids
      ? all.filter((r) => ids.has(r.processId))
      : lmpsForPoc(all, name, "prep");
    openLmps(rows, `${name} · ${cell.col}`, subtitle);
  };



  return (
    <LuminaShell>
      <LxPageHeader
        crumb="ADMIN · DASHBOARD"
        title="Operating snapshot"
        subtitle="Where conversion stands today, where load sits, and where attention is needed."
        right={<LxLivePill />}
      />

      <LxLmpFilters
        filters={filters}
        set={set}
        pocOptions={prepPocOptions}
        showPrepPoc
        showOutreachPoc
      />

      {/* ─────── SECTION 1: Unified LMP Health + Status ─────── */}
      <LxGrid>
        <LxHero
          eyebrow="LMP Health Summary"
          title="Live snapshot of the selected view vs. the full pipeline"
          primaryValue={`${conversionRate.toFixed(1)}%`}
          primaryLabel="overall conversion"
          variant="mu"
          span={12}
          info={info("admin.hero.conversion")}
          stats={[
            {
              label: "In current view",
              value: filtered.length.toLocaleString(),
              sub: `${lsc["prep-ongoing"]} prep ongoing · ${lsc.converted} converted`,
              info: info("admin.hero.in-view"),
              onClick: () => openLmps(filtered, "LMPs in current view", `${filtered.length} of ${all.length} total`),
            },
            {
              label: "Overall LMPs",
              value: all.length.toLocaleString(),
              sub: `${all.filter(isConverted).length} converted across all processes`,
              info: info("admin.hero.overall"),
              onClick: () => openLmps(all, "All LMPs", `${all.length} processes`),
            },
            {
              label: "Conversion",
              value: `${conversionRate.toFixed(1)}%`,
              sub: `${converted} of ${filtered.length} in view`,
              accent: "success",
              info: info("admin.hero.conversion"),
              onClick: () => openLmps(filtered.filter(isConverted), "Converted LMPs", `${converted} of ${filtered.length} in view`),
            },
          ]}
          rightSlot={
            <StatusMiniDonut
              total={filtered.length}
              segments={liveStatusSegments}
            />
          }
          footer={
            <StatusStrip
              total={filtered.length}
              onSegmentClick={(s) => openStatus(s.status)}
              segments={liveStatusSegments}
            />
          }
        />
      </LxGrid>

      {/* Live snapshot strip — flag counts across all in-scope LMPs */}
      <RecentSnapshotStrip rows={filtered} todaySet={todaySet} onItemClick={openSnapshot} />

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
        <RecentActivityCard limit={20} span={5} />
      </LxGrid>

      {/* ─────── SECTION 2: POC Operational Load ─────── */}
      <LxSection eyebrow="People" title="Prep POC capacity map" info={info("admin.heatmap")} hint="Live from POC DB · every active Prep POC linked to any LMP via prep role." />
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader
            eyebrow="Prep POCs"
            title="Prep POC × LMP workload"
            hint="Live from POC DB + LMP DB · active Prep POCs only."
            info={info("admin.heatmap")}
            right={capacityLoading ? <span className="text-[11px]" style={{ color: "var(--lx-text-3)" }}>Loading…</span> : <LxLivePill />}
          />
          {capacityPocs.length === 0 && !capacityLoading ? (
            <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--lx-text-3)" }}>
              No active Prep POCs found.
            </div>
          ) : (
            <LxHeatmap
              rowLabels={capacityPocs}
              onCellClick={onHeatmapCell}
              columns={[
                { label: "Total LMP (till today)", accent: "teal",    info: info("admin.heatmap.col.total") },
                { label: "Prep Load (Active)",     accent: "ai",      info: info("admin.heatmap.col.prep-load") },
                { label: "Support Load (Active)",  accent: "info",    info: info("admin.heatmap.col.support") },
                { label: "In-domain Load",         accent: "success", info: info("admin.heatmap.col.in-domain") },
                { label: "Cross-domain Load",      accent: "orange",  info: info("admin.heatmap.col.cross") },
                { label: "Not Started",            accent: "neutral", info: info("admin.heatmap.col.not-started") },
                { label: "Prep Ongoing",           accent: "info",    info: info("admin.heatmap.col.prep-ongoing") },
                { label: "Prep Done",              accent: "teal",    info: info("admin.heatmap.col.prep-done") },
                { label: "Hold",                   accent: "yellow",  info: info("admin.heatmap.col.hold") },
                { label: "Converted",              accent: "success", info: info("admin.heatmap.col.converted") },
                { label: "Not Converted",          accent: "risk",    info: info("admin.heatmap.col.not-conv") },
                { label: "Other Reasons",          accent: "orange",  info: info("admin.heatmap.col.other") },
              ]}
              values={heatmapMatrix}
              loadTotals={loadTotals}
              primaryIndex={1}
            />
          )}
        </LxCard>
      </LxGrid>

      {/* ─────── SECTION 4: Domain load (live from domains table) ─────── */}
      <LxSection eyebrow="Domains" title="Where is the load concentrated?" info={info("admin.domain.bar")} hint="Active load by domain — with total processes and conversion rate from the domains database." />
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader eyebrow="Active load" title="Domain load (ranked)"
            info={info("admin.domain.bar")}
            hint="Bar length reflects active LMPs. Chips show total processes and conversion rate." />
          {(() => {
            type DomainRow = { name: string; total_lmps: number; active_lmps: number; converted_lmps: number; conversion_rate: number };
            const rows = (domainRows as DomainRow[])
              .filter((d) => d.name && d.name.toLowerCase() !== "unmapped")
              .map((d) => ({
                label: d.name,
                value: Number(d.active_lmps ?? 0),
                total: Number(d.total_lmps ?? 0),
                converted: Number(d.converted_lmps ?? 0),
                conv: Number(d.conversion_rate ?? 0),
              }))
              .sort((a, b) => b.value - a.value);
            return (
              <LxRankedBar
                accent="info"
                maxItems={12}
                rows={rows}
                onRowClick={(r) => {
                  const cd = (domainRows as any[]).map((d) => ({ id: d?.id ?? "", name: d?.name ?? "", slug: d?.slug ?? "", aliases: Array.isArray(d?.aliases) ? d.aliases : [] })).filter((d) => d.name);
                  const matched = all.filter((p) => (resolveDomainName(p.domain, cd) ?? "Unmapped") === r.label);
                  openLmps(matched, `${r.label} · LMPs`, `${r.value} active`);
                }}
                chips={(r) => {
                  const meta = rows.find((x) => x.label === r.label);
                  if (!meta) return null;
                  return (
                    <span className="flex items-center gap-1.5 text-[10.5px] font-medium">
                      <span className="px-1.5 py-[1px] rounded-full" style={{ background: "var(--lx-soft)", color: "var(--lx-text-2)" }}>
                        {meta.total} total
                      </span>
                      <span className="px-1.5 py-[1px] rounded-full" style={{ background: "rgba(106,158,98,0.14)", color: "var(--lx-success, #6A9E62)" }}>
                        {meta.conv.toFixed(1)}% conv
                      </span>
                    </span>
                  );
                }}
              />
            );
          })()}
        </LxCard>
      </LxGrid>

      {/* ─────── SECTION 4.5: Student analytics ─────── */}
      <LxSection
        eyebrow="Student analytics"
        title="Student distribution, participation, and inactivity snapshot"
        info={info("admin.students.in-process")}
      />

      {/* Row 1 — metrics strip */}
      <LxGrid>
        <LxKpi span={2} label="Total students"        accent="info"    value={totalStudentsDb}
          sub="Live · students DB" info={info("admin.students.total-db")}
          onClick={() => setDrill({ kind: "students", title: "All students", subtitle: "Live students DB", rows: studentsInBucket(studentRoster, { bucket: "all" }) })} />
        <LxKpi span={2} label="In current view"       accent="teal"    value={studentStats.totalStudents}
          sub="Unique in selected scope" info={info("admin.students.in-view")} />
        <LxKpi span={2} label="In Process (Unique)"   accent="success" value={studentStats.activeStudents}
          sub="At least 1 process" info={info("admin.students.in-process")}
          onClick={() => setDrill({ kind: "students", title: "Students in process", subtitle: "≥ 1 active LMP", rows: studentsInBucket(studentRoster, { bucket: "active" }) })} />
        <LxKpi span={2} label="Single Process"        accent="success" value={studentStats.singleProcess}
          sub="Exactly 1 process" info={info("admin.students.single")}
          onClick={() => setDrill({ kind: "students", title: "Students with a single process", rows: studentsInBucket(studentRoster, { bucket: "single" }) })} />
        <LxKpi span={2} label="Multiple Processes"    accent="ai"      value={studentStats.multipleProcesses}
          sub="2+ processes" info={info("admin.students.multiple")}
          onClick={() => setDrill({ kind: "students", title: "Students with multiple processes", rows: studentsInBucket(studentRoster, { bucket: "multiple" }) })} />
        <LxKpi span={2} label="Inactive (0 Process)"  accent="risk"    value={studentStats.inactiveStudents}
          sub="Zero processes" info={info("admin.students.inactive")}
          onClick={() => setDrill({ kind: "students", title: "Inactive students", subtitle: "Zero active LMPs", rows: studentsInBucket(studentRoster, { bucket: "inactive" }) })} />
      </LxGrid>

      {/* Row 2 — cohort distribution */}
      <LxGrid>
        {Object.keys(studentStats.cohortAgg).length === 0 ? (
          <LxCard span={12}>
            <div className="px-4 py-8 text-center text-[12px]" style={{ color: "var(--lx-text-3)" }}>
              No students in DB yet.
            </div>
          </LxCard>
        ) : (
          Object.entries(studentStats.cohortAgg ?? {})
            .filter(([, c]) => c && typeof c === "object")
            .sort((a, b) => ((b[1]?.total ?? 0) - (a[1]?.total ?? 0)))
            .map(([cohort, c]) => {
              const inProcess = c.single + c.multiple;
              const pct = (n: number) => (c.total ? (n / c.total) * 100 : 0);
              const openCohort = (bucket: "single" | "multiple" | "inactive" | "all", subtitle: string) =>
                setDrill({ kind: "students", title: `${cohort} · ${subtitle}`, rows: studentsInBucket(studentRoster, { cohort, bucket }) });
              return (
                <LxCard key={cohort} span={6}>
                  <LxCardHeader
                    eyebrow="Cohort"
                    title={cohort}
                    info={info("admin.students.cohort")}
                    hint={`${c.total} total · ${inProcess} in process · ${c.inactive} inactive`}
                  />
                  <LxStackedBar
                    onSegmentClick={(s) => {
                      if (s.label === "Single Process")        openCohort("single", "single process");
                      else if (s.label === "Multiple Processes") openCohort("multiple", "multiple processes");
                      else if (s.label === "Inactive")          openCohort("inactive", "inactive");
                    }}
                    segments={[
                      { label: "Single Process",     value: c.single,   accent: "success", info: info("admin.students.single") },
                      { label: "Multiple Processes", value: c.multiple, accent: "info",    info: info("admin.students.multiple") },
                      { label: "Inactive",           value: c.inactive, accent: "risk",    info: info("admin.students.inactive") },
                    ]}
                  />
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[11.5px]" style={{ color: "var(--lx-text-3)" }}>
                    <button onClick={() => openCohort("single", "single process")} className="text-left rounded-md hover:bg-[var(--lx-soft)] -mx-1 px-1 py-1 transition-colors">
                      <div className="uppercase tracking-[0.5px] text-[10px]">Single</div>
                      <div className="mt-0.5"><span className="font-semibold" style={{ color: "var(--lx-text)" }}>{c.single}</span> · {pct(c.single).toFixed(0)}%</div>
                    </button>
                    <button onClick={() => openCohort("multiple", "multiple processes")} className="text-left rounded-md hover:bg-[var(--lx-soft)] -mx-1 px-1 py-1 transition-colors">
                      <div className="uppercase tracking-[0.5px] text-[10px]">Multiple</div>
                      <div className="mt-0.5"><span className="font-semibold" style={{ color: "var(--lx-text)" }}>{c.multiple}</span> · {pct(c.multiple).toFixed(0)}%</div>
                    </button>
                    <button onClick={() => openCohort("inactive", "inactive")} className="text-left rounded-md hover:bg-[var(--lx-soft)] -mx-1 px-1 py-1 transition-colors">
                      <div className="uppercase tracking-[0.5px] text-[10px]">Inactive</div>
                      <div className="mt-0.5"><span className="font-semibold" style={{ color: "var(--lx-text)" }}>{c.inactive}</span> · {pct(c.inactive).toFixed(0)}%</div>
                    </button>
                  </div>
                </LxCard>
              );
            })
        )}
      </LxGrid>

      {/* Row 3 — domain preference */}
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader
            eyebrow="Domain preference"
            title="Students by domain"
            info={info("admin.students.by-domain")}
            hint="Number of unique students participating per domain."
            right={
              <div className="inline-flex rounded-md p-0.5" style={{ background: "var(--lx-soft)", border: "1px solid var(--lx-border)" }}>
                {(["total", "active"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDomainPrefMode(m)}
                    className="px-2.5 h-7 text-[11.5px] font-medium rounded-[5px] transition-colors"
                    style={{
                      background: domainPrefMode === m ? "var(--lx-surface)" : "transparent",
                      color: domainPrefMode === m ? "var(--lx-text)" : "var(--lx-text-3)",
                      boxShadow: domainPrefMode === m ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                    }}
                  >
                    {m === "total" ? "Total students" : "Active only"}
                  </button>
                ))}
              </div>
            }
          />
          <LxRankedBar
            accent="info"
            maxItems={12}
            rows={[...(domainPrefMode === "active" ? studentStats.domainRowsActive : studentStats.domainRowsTotal)].sort((a, b) => b.value - a.value)}
            onRowClick={(r) => {
              const cd = (domainRows as any[]).map((d) => ({ id: d?.id ?? "", name: d?.name ?? "", slug: d?.slug ?? "", aliases: Array.isArray(d?.aliases) ? d.aliases : [] })).filter((d) => d.name);
              const matchedAll = studentRoster.filter((s) => (resolveDomainName(s.primaryDomain, cd) ?? "Unmapped") === r.label);
              const rows = domainPrefMode === "active"
                ? matchedAll.filter((s) => (s.activeLmpCount ?? 0) > 0)
                : matchedAll;
              setDrill({
                kind: "students",
                title: `${r.label} · students`,
                subtitle: `${rows.length} ${domainPrefMode === "active" ? "active" : "total"} students`,
                rows,
              });
            }}
          />
        </LxCard>
      </LxGrid>

      <LxAttentionStrip
        items={[
          { label: "Highest risk domain",  value: highestRiskDomainName,    accent: "risk",   info: info("attention.highest-risk-domain"),
            onClick: () => openLmps(lmpsForDomain(filtered, highestRiskDomainName), `${highestRiskDomainName} · LMPs`) },
          { label: "Most overloaded POC",  value: mostOverloadedPocName,    accent: "orange", info: info("attention.most-overloaded-poc"),
            onClick: () => openLmps(lmpsForPoc(all, mostOverloadedPocName, "any"), `${mostOverloadedPocName} · LMPs`) },
          { label: "Pending offers",       value: attentionPendingOffers,   accent: "yellow", info: info("attention.pending-offers"),
            onClick: () => openLmps(lmpsByStatus(all, "Offer Received"), "Pending offers", "All LMPs awaiting offer outcome") },
          { label: "Missing prep docs",    value: attentionMissingPrepDocs, accent: "ai",     info: info("attention.missing-prep-docs") },
          { label: "Overloaded POCs",      value: overloadedPocsCount,      accent: "info",   info: info("attention.overloaded-pocs"),
            onClick: () => setDrill({
              kind: "pocs",
              title: "Overloaded POCs",
              subtitle: "Active load exceeds threshold",
              rows: attentionPocs.filter((p) => p.active > p.threshold).map((p) => ({ name: p.name, activeLoad: p.active, threshold: p.threshold })),
            }) },
        ]}
      />

      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </LuminaShell>
  );
}

type StatusSegment = {
  status: ActiveLmpStatus;
  label: string;
  value: number;
  accent: LxAccent;
};

function StatusMiniDonut({
  total, segments,
}: {
  total: number;
  segments: StatusSegment[];
}) {
  const safe = segments.reduce((s, x) => s + x.value, 0) || 1;
  let cursor = 0;
  const stops = segments.map((s) => {
    const pct = (s.value / safe) * 100;
    const start = cursor; cursor += pct;
    return `${LX_HEX[s.accent]} ${start}% ${cursor}%`;
  });
  return (
    <div className="relative shrink-0" style={{ width: 132, height: 132 }} aria-hidden>
      <div
        className="h-full w-full rounded-full"
        style={{ background: stops.length ? `conic-gradient(${stops.join(", ")})` : "rgba(26,25,22,0.15)" }}
      />
      <div
        className="absolute inset-[14px] rounded-full grid place-items-center text-center"
        style={{ background: "rgba(255,255,255,0.85)", border: "1px solid rgba(26,25,22,0.08)" }}
      >
        <div>
          <div className="text-[22px] font-semibold leading-none" style={{ color: "var(--lx-text)" }}>{total}</div>
          <div className="text-[9.5px] font-semibold uppercase tracking-[0.7px] mt-1" style={{ color: "rgba(26,25,22,0.62)" }}>
            Processes
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusStrip({
  total, segments, onSegmentClick,
}: {
  total: number;
  segments: StatusSegment[];
  onSegmentClick?: (s: StatusSegment) => void;
}) {
  const safe = total || 1;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2.5">
      {segments.map((s) => {
        const pct = (s.value / safe) * 100;
        const color = LX_HEX[s.accent];
        const clickable = !!onSegmentClick;
        return (
          <div
            key={s.label}
            className="rounded-xl px-3 py-2.5 flex flex-col gap-1 transition-shadow"
            style={{
              background: "rgba(255,255,255,0.6)",
              border: "1px solid rgba(26,25,22,0.08)",
              borderLeft: `3px solid ${color}`,
              cursor: clickable ? "pointer" : undefined,
            }}
            onClick={clickable ? () => onSegmentClick!(s) : undefined}
            role={clickable ? "button" : undefined}
            tabIndex={clickable ? 0 : undefined}
            onKeyDown={(e) => {
              if (clickable && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault(); onSegmentClick!(s);
              }
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: color }} />
              <div className="text-[10px] font-semibold uppercase tracking-[0.6px] truncate" style={{ color: "rgba(26,25,22,0.62)" }}>
                {s.label}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-[20px] font-semibold leading-none" style={{ color: "var(--lx-text)" }}>{s.value}</div>
              <div className="text-[11.5px] font-semibold tabular-nums" style={{ color }}>{pct.toFixed(0)}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
