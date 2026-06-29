import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader,
  LxKpi, LxStackedBar, LX_HEX,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters } from "./filters/useLmpFilters";
import { useRole } from "@/lib/rolesContext";
import { lmpStatusCounts, type Process } from "@/lib/lmpProcessQueries";
import { canonicalLmpStatus } from "@/types/lmp";
import { STATUS_META } from "@/lib/lmpTypes";
import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { useTodayDailyLogIds } from "@/lib/hooks/useTodayDailyLogIds";
import { ActionRequiredCard } from "./sections/ActionRequiredCard";
import { RecentSnapshotStrip } from "./sections/RecentSnapshotStrip";
import { LxDrillDown, type DrillState } from "@/components/insights/LxDrillDown";
import { info } from "@/lib/dashboardInfo";
import { snapshotDrill, countZeroCandidateLmps, buildConvertedCandidateCountByLmp } from "@/lib/dashboardDrill";
import { useLmpRows } from "@/lib/sheets/hooks";
import { useDashboardFilterOptions } from "@/lib/hooks/useDashboardFilterOptions";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { LmpHealthSummaryCard, type ActiveLmpStatus } from "@/components/dashboard/LmpHealthSummaryCard";
import {
  countActiveLmps,
  countAllocatedDomains,
  countCompletedThisMonth,
  countPrepOngoing,
  sortRecentlyUpdated,
  taskStatusSegments,
} from "@/lib/allocatorDashboardMetrics";

function relativeTime(iso: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StatusPill({ slug }: { slug: string }) {
  const canonical = canonicalLmpStatus(slug as import("@/types/lmp").LmpStatus);
  const meta = STATUS_META[canonical];
  const hex = canonical === "converted" ? LX_HEX.success
    : canonical === "not-converted" ? LX_HEX.risk
    : canonical === "prep-ongoing" ? LX_HEX.info
    : LX_HEX.neutral;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border whitespace-nowrap"
      style={{ background: `${hex}1F`, color: "var(--lx-text)", borderColor: `${hex}55` }}
    >
      {meta?.label ?? slug}
    </span>
  );
}

export function AllocatorLmpDashboard({ headerExtra }: { headerExtra?: ReactNode }) {
  const { user } = useRole();
  const {
    domainOptions,
    statusOptions,
    typeOptions,
    prepPocOptions,
  } = useDashboardFilterOptions();
  const { pocLmpIdsMap } = useEligiblePrepPocs();

  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();
  useRealtimeInvalidate("lmp_processes", [["lmp_rows"], ["db-lmp-processes"]]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["lmp_rows"]]);
  useRealtimeInvalidate("poc_profiles" as never, [["lmp_rows"], ["poc_profiles_registry"]]);

  const { processes: liveProcesses } = useLiveProcesses();
  const { data: lmpRows = [] } = useLmpRows();
  const { filtered, filters, set } = useLmpFilters({
    role: "allocator",
    userName: user.name,
    data: liveProcesses.length ? liveProcesses : undefined,
    pocLmpIdsMap,
  });

  const todaySet = useTodayDailyLogIds();
  const filteredIds = useMemo(() => new Set(filtered.map((r) => r.processId)), [filtered]);
  const filteredRecords = useMemo(
    () => lmpRows.filter((r) => filteredIds.has(r.id)),
    [filteredIds, lmpRows],
  );

  const { data: allCandidateRows = [] } = useQuery({
    queryKey: ["lmp_candidates_all"],
    queryFn: async () => {
      const PAGE = 1000;
      let from = 0;
      const out: { lmpId: string; pipelineStage: string | null }[] = [];
      while (true) {
        const { data, error } = await supabase
          .from("lmp_candidates")
          .select("id, lmp_id, pipeline_stage")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(error.message);
        const rows = data ?? [];
        out.push(...rows.map((c) => ({
          lmpId: (c.lmp_id ?? "") as string,
          pipelineStage: (c.pipeline_stage ?? null) as string | null,
        })));
        if (rows.length < PAGE) break;
        from += PAGE;
      }
      return out;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  useRealtimeInvalidate("lmp_candidates" as never, [["lmp_candidates_all"]], {
    cachePrefixes: ['["db-lmp-candidates', '["db-lmp-candidate-counts'],
  });

  const filteredCandidates = useMemo(
    () => allCandidateRows.filter((c) => filteredIds.has(c.lmpId)),
    [allCandidateRows, filteredIds],
  );

  const candidateCountByLmp = useMemo(() => {
    const m = new Map<string, number>();
    filteredCandidates.forEach((c) => m.set(c.lmpId, (m.get(c.lmpId) ?? 0) + 1));
    return m;
  }, [filteredCandidates]);

  const convertedCandidateCountByLmp = useMemo(
    () => buildConvertedCandidateCountByLmp(filteredCandidates),
    [filteredCandidates],
  );

  const zeroCandidateLmpsCount = useMemo(
    () => countZeroCandidateLmps(filtered, candidateCountByLmp),
    [filtered, candidateCountByLmp],
  );

  const lsc = lmpStatusCounts(filteredRecords);
  const allocatedDomains = countAllocatedDomains(filteredRecords);
  const activeLmps = countActiveLmps(filteredRecords);
  const prepOngoing = countPrepOngoing(filteredRecords);
  const completedThisMonth = countCompletedThisMonth(filteredRecords);
  const recentLmps = useMemo(() => sortRecentlyUpdated(filteredRecords, 12), [filteredRecords]);
  const taskSegments = useMemo(() => taskStatusSegments(filteredRecords), [filteredRecords]);

  const [drill, setDrill] = useState<DrillState | null>(null);
  const openLmps = (rows: Process[], title: string, subtitle?: string) =>
    setDrill({ kind: "lmps", title, subtitle, rows });

  const openStatus = (status: ActiveLmpStatus) => {
    const ids = new Set(
      filteredRecords
        .filter((row) => canonicalLmpStatus(row.status) === status)
        .map((row) => row.id),
    );
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      `${STATUS_META[status].label} LMPs`,
      `${filtered.length} in current view`,
    );
  };

  const openActiveLmps = () => {
    const ids = new Set(
      filteredRecords
        .filter((r) => ["not-started", "prep-ongoing", "ongoing", "prep-done"].includes(r.status))
        .map((r) => r.id),
    );
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      "Active LMPs",
      `${activeLmps} in current view`,
    );
  };

  const openPrepOngoing = () => {
    const ids = new Set(
      filteredRecords
        .filter((r) => r.status === "prep-ongoing" || r.status === "ongoing")
        .map((r) => r.id),
    );
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      "Prep Ongoing LMPs",
      `${prepOngoing} in current view`,
    );
  };

  const openCompletedThisMonth = () => {
    const month = new Date().getMonth();
    const year = new Date().getFullYear();
    const ids = new Set(
      filteredRecords
        .filter((r) => {
          const completed = ["converted", "not-converted", "other-reasons", "closed"].includes(r.status);
          if (!completed) return false;
          const iso = r.closingDate || r.lastActivity || r.lastProgressUpdatedAt || "";
          const d = new Date(iso);
          return Number.isFinite(d.getTime()) && d.getMonth() === month && d.getFullYear() === year;
        })
        .map((r) => r.id),
    );
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      "Completed this month",
      `${completedThisMonth} in current view`,
    );
  };

  const openDomains = () => {
    setDrill({
      kind: "domains",
      title: "Allocated domains",
      rows: Array.from(new Set(filteredRecords.map((r) => r.domain).filter(Boolean)))
        .map((d) => ({
          name: d as string,
          value: filteredRecords.filter((r) => r.domain === d).length,
        })),
    });
  };

  const openTaskSegment = (key: (typeof taskSegments)[number]["drillKey"]) => {
    const ids = new Set(
      filteredRecords
        .filter((r) => {
          const c = canonicalLmpStatus(r.status);
          if (key === "not-started") return c === "not-started";
          if (key === "in-progress") return c === "prep-ongoing" || c === "prep-done";
          if (key === "completed") return c === "converted" || c === "not-converted";
          return c === "hold" || c === "other-reasons";
        })
        .map((r) => r.id),
    );
    const label = taskSegments.find((s) => s.drillKey === key)?.label ?? "LMPs";
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      label,
      `${ids.size} in current view`,
    );
  };

  const openSnapshot = (kind: Parameters<typeof snapshotDrill>[0]) => {
    const { rows, title } = snapshotDrill(
      kind,
      filtered,
      todaySet,
      candidateCountByLmp,
      convertedCandidateCountByLmp,
    );
    openLmps(rows, title, `${rows.length} of ${filtered.length} in view`);
  };

  return (
    <LuminaShell>
      <LxPageHeader
        crumb="ALLOCATOR · DASHBOARD"
        title="Allocator Dashboard"
        subtitle="Overview of allocated domains, active LMPs, process health, and pending actions."
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
      />

      <LxGrid>
        <LxKpi
          span={3}
          label="Allocated Domains"
          accent="orange"
          value={allocatedDomains}
          sub="Unique domains in scope"
          info={info("alloc.tracker.domains")}
          onClick={openDomains}
        />
        <LxKpi
          span={3}
          label="Active LMPs"
          accent="info"
          value={activeLmps}
          sub="Non-closed pipeline"
          info={info("snapshot.active-lmps")}
          onClick={openActiveLmps}
        />
        <LxKpi
          span={3}
          label="Prep Ongoing"
          accent="teal"
          value={prepOngoing}
          sub="Prep / ongoing stage"
          info={info("alloc.tracker.ongoing")}
          onClick={openPrepOngoing}
        />
        <LxKpi
          span={3}
          label="Completed This Month"
          accent="success"
          value={completedThisMonth}
          sub="Converted / closed"
          info={info("alloc.tracker.converted")}
          onClick={openCompletedThisMonth}
        />
      </LxGrid>

      <LmpHealthSummaryCard
        total={filteredRecords.length}
        lsc={lsc}
        isLoading={false}
        onStatusClick={openStatus}
      />

      <LxGrid>
        <LxCard span={7}>
          <LxCardHeader
            eyebrow="Pipeline"
            title="Tasks by status"
            hint="Process count grouped by operational stage."
          />
          <LxStackedBar
            segments={taskSegments.map((s) => ({
              label: s.label,
              value: s.value,
              accent: s.accent,
            }))}
            onSegmentClick={(seg) => {
              const match = taskSegments.find((s) => s.label === seg.label);
              if (match) openTaskSegment(match.drillKey);
            }}
          />
        </LxCard>

        <ActionRequiredCard
          rows={filtered}
          todaySet={todaySet}
          title="Alerts & notifications"
          eyebrow="Needs attention"
          limit={10}
          span={5}
          highOnly={false}
        />
      </LxGrid>

      <LxGrid>
        <LxCard span={8} className="overflow-hidden">
          <LxCardHeader
            eyebrow="Activity"
            title="Recently updated LMPs"
            hint="Sorted by latest update timestamp."
            right={
              <Link
                to="/lmp"
                className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-md transition-colors"
                style={{ color: "var(--lx-accent)", background: "var(--lx-soft)" }}
              >
                View all →
              </Link>
            }
          />
          {recentLmps.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px]" style={{ color: "var(--lx-text-3)" }}>
              No LMPs in current scope.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "var(--lx-border)", color: "var(--lx-text-3)" }}>
                    <th className="px-4 py-2 font-medium">LMP</th>
                    <th className="px-3 py-2 font-medium">Domain</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium hidden md:table-cell">Prep POC</th>
                    <th className="px-3 py-2 font-medium hidden lg:table-cell">Support POC</th>
                    <th className="px-3 py-2 font-medium">Updated</th>
                    <th className="px-3 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {recentLmps.map((row) => {
                    const updated = row.lastActivity || row.lastProgressUpdatedAt || row.createdAt || "";
                    const name = [row.company, row.role].filter(Boolean).join(" · ") || row.reqId || row.id;
                    return (
                      <tr
                        key={row.id}
                        className="border-b last:border-0"
                        style={{ borderColor: "var(--lx-border)" }}
                      >
                        <td className="px-4 py-2.5 font-medium" style={{ color: "var(--lx-text)" }}>
                          {name}
                        </td>
                        <td className="px-3 py-2.5" style={{ color: "var(--lx-text-2)" }}>
                          {row.domain || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <StatusPill slug={row.status} />
                        </td>
                        <td className="px-3 py-2.5 hidden md:table-cell" style={{ color: "var(--lx-text-2)" }}>
                          {row.prepPoc?.name || "—"}
                        </td>
                        <td className="px-3 py-2.5 hidden lg:table-cell" style={{ color: "var(--lx-text-2)" }}>
                          {row.supportPoc?.name || "—"}
                        </td>
                        <td className="px-3 py-2.5 font-mono tabular-nums whitespace-nowrap" style={{ color: "var(--lx-text-3)" }}>
                          {relativeTime(updated)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <Link
                            to={`/lmp/${row.id}`}
                            className="text-[11px] font-medium hover:underline"
                            style={{ color: "var(--lx-accent)" }}
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </LxCard>

        <LxCard span={4}>
          <LxCardHeader
            eyebrow="Flags"
            title="Quick alerts"
            hint="Tap a metric to drill into affected LMPs."
          />
          <RecentSnapshotStrip
            rows={filtered}
            todaySet={todaySet}
            zeroCandidateCount={zeroCandidateLmpsCount}
            convertedCandidateCountByLmp={convertedCandidateCountByLmp}
            onItemClick={openSnapshot}
          />
        </LxCard>
      </LxGrid>

      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </LuminaShell>
  );
}
