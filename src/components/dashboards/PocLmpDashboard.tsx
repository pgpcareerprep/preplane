import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader,
  LX_HEX,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters } from "./filters/useLmpFilters";
import { useViewer } from "@/lib/viewerContext";
import { motion } from "framer-motion";
import {
  calculatePocPerformanceConversionRate, lmpStatusCounts, type Process,
} from "@/lib/lmpProcessQueries";
import { canonicalLmpStatus, type CanonicalLmpStatus, type LmpStatus } from "@/types/lmp";
import { STATUS_META } from "@/lib/lmpTypes";
import { LmpStatusPill } from "@/components/lmp/LmpStatusPill";
import { useDashboardFilterOptions } from "@/lib/hooks/useDashboardFilterOptions";
import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";

import { useTodayDailyLogIds } from "@/lib/hooks/useTodayDailyLogIds";
import { ActionRequiredCard } from "./sections/ActionRequiredCard";
import { RecentActivityCard } from "./sections/RecentActivityCard";
import { LxDrillDown, type DrillState } from "@/components/insights/LxDrillDown";
import { info } from "@/lib/dashboardInfo";
import { snapshotDrill, lmpsByChecklistItem, countZeroCandidateLmps, buildConvertedCandidateCountByLmp } from "@/lib/dashboardDrill";
import { EXECUTION_CHECKLIST_DEFS, type ChecklistSheetKey } from "@/lib/lmpChecklist";
import { useLmpRows } from "@/lib/sheets/hooks";
import { isUserOperationalPoc } from "@/lib/lmpViewingContext";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { PocOverviewHeroCard } from "@/components/dashboard/poc/PocOverviewHeroCard";
import { PocMyLoadCards } from "@/components/dashboard/poc/PocMyLoadCards";
import { PocOperationalFlags } from "@/components/dashboard/poc/PocOperationalFlags";
import type { ReactNode } from "react";

export type PocLmpDashboardProps = {
  pocIdOverride?: string | null;
  pocNameOverride?: string;
  sourceLabel?: string;
  headerExtra?: ReactNode;
};

const ACTIVE_LMP_STATUSES = new Set<LmpStatus>(["not-started", "prep-ongoing", "ongoing", "prep-done"]);

function StatusPill({ label, slug }: { label: string; slug: string }) {
  return <LmpStatusPill status={label} slug={slug} />;
}

export function PocLmpDashboard({
  pocIdOverride,
  pocNameOverride,
  sourceLabel,
  headerExtra,
}: PocLmpDashboardProps = {}) {

  const { effectiveUser, effectivePocId, isViewAsActive } = useViewer();
  const { activePocLmpIdsMap } = useEligiblePrepPocs();
  const activePocId = pocIdOverride ?? effectivePocId ?? null;
  // Live realtime — POC dashboard refreshes as their LMPs / candidates change.
  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();
  useRealtimeInvalidate("lmp_processes", [["lmp_rows"], ["db-lmp-processes"]]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["lmp_rows"]]);
  useRealtimeInvalidate("poc_profiles" as never, [["lmp_rows"], ["poc_profiles_registry"]]);
  const todaySet = useTodayDailyLogIds();
  const { processes: liveProcesses } = useLiveProcesses();
  const { data: lmpRows = [] } = useLmpRows();
  const pocName = (
    pocNameOverride
    ?? effectiveUser.pocProfileName
    ?? effectiveUser.name
    ?? effectiveUser.email
    ?? ""
  ).trim();

  // Same ownership rules as the LMP board: prep/support UUID on the record, then names.
  const pocScopedProcesses = useMemo(() => {
    const rowById = new Map(lmpRows.map((r) => [r.id, r]));
    return liveProcesses.filter((p) => {
      const rec = rowById.get(p.processId);
      if (rec) return isUserOperationalPoc(rec, pocName, activePocId);
      if (activePocId && activePocLmpIdsMap.get(activePocId)?.has(p.processId)) return true;
      return false;
    });
  }, [liveProcesses, lmpRows, pocName, activePocId, activePocLmpIdsMap]);

  const { filtered, filters, set } = useLmpFilters({
    role: "admin",
    userName: pocName,
    data: pocScopedProcesses,
  });
  const filteredIds = useMemo(() => new Set(filtered.map((r) => r.processId)), [filtered]);
  const filteredRecords = useMemo(() => lmpRows.filter((r) => filteredIds.has(r.id)), [filteredIds, lmpRows]);

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

  const { domainOptions, statusOptions, typeOptions } = useDashboardFilterOptions();

  const totalLmpCount = filteredRecords.length;
  const lsc = lmpStatusCounts(filteredRecords);
  const convertedCount = filteredRecords.filter((r) => r.status === "converted" || r.status === "offer-received").length;
  const notConvertedCount = filteredRecords.filter((r) => r.status === "not-converted").length;
  const eligibleCount = convertedCount + notConvertedCount;
  const conversionRate = calculatePocPerformanceConversionRate(
    convertedCount,
    notConvertedCount,
  ) ?? 0;

  const recordsById = useMemo(
    () => new Map(filteredRecords.map((r) => [r.id, r])),
    [filteredRecords],
  );

  const checklist = EXECUTION_CHECKLIST_DEFS.map((def) => ({
    label: def.label,
    sheetKey: def.sheetKey,
    done: filteredRecords.filter((r) => !!r[def.sheetKey]).length,
    total: filteredRecords.length,
  }));

  // Domain & assignment breakdown (user-specific via allocationTags)
  const myLmpRowById = new Map(
    lmpRows.filter(r => isUserOperationalPoc(r, pocName, activePocId)).map(r => [r.id, r])
  );
  const inDomainProcs  = filtered.filter(p => myLmpRowById.get(p.processId)?.allocationTags?.includes("In-Domain") ?? false);
  const crossDomainProcs = filtered.filter(p => myLmpRowById.get(p.processId)?.allocationTags?.includes("Cross-Domain") ?? false);
  const primaryProcs = filtered.filter(p => {
    const r = myLmpRowById.get(p.processId);
    if (!r || !pocName) return false;
    const pn = (r.prepPoc?.name ?? r.domainPrepPoc?.name ?? "").toLowerCase().trim();
    const un = pocName.toLowerCase().trim();
    return pn === un || (pn.split(/\s+/)[0].length >= 3 && pn.split(/\s+/)[0] === un.split(/\s+/)[0]);
  });
  const supportProcs = filtered.filter(p => {
    const r = myLmpRowById.get(p.processId);
    if (!r || !pocName) return false;
    const sn = (r.supportPoc?.name ?? r.behavioralPrepPoc?.name ?? "").toLowerCase().trim();
    const un = pocName.toLowerCase().trim();
    return sn === un || (sn.split(/\s+/)[0].length >= 3 && sn.split(/\s+/)[0] === un.split(/\s+/)[0]);
  });

  const activeRowIds = useMemo(
    () => new Set(
      filteredRecords
        .filter((r) => ACTIVE_LMP_STATUSES.has(r.status) || r.status === "hold")
        .map((r) => r.id),
    ),
    [filteredRecords],
  );
  const activeRows = filtered
    .filter((p) => activeRowIds.has(p.processId))
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 12);

  const [drill, setDrill] = useState<DrillState | null>(null);
  const openLmps = (rows: Process[], title: string, subtitle?: string) =>
    setDrill({ kind: "lmps", title, subtitle, rows });
  const openCanonicalStatus = (status: CanonicalLmpStatus) => {
    const ids = new Set(
      filteredRecords
        .filter((row) => canonicalLmpStatus(row.status) === status)
        .map((row) => row.id),
    );
    openLmps(
      filtered.filter((row) => ids.has(row.processId)),
      `${STATUS_META[status].label} · my LMPs`,
      `${filtered.length} in my scope`,
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
    openLmps(rows, `My ${title.toLowerCase()}`, `${rows.length} of ${filtered.length} in my scope`);
  };
  const openChecklist = (
    sheetKey: ChecklistSheetKey,
    label: string,
    which: "done" | "pending",
  ) => {
    const split = lmpsByChecklistItem(filtered, recordsById, sheetKey);
    openLmps(split[which], `${label} · ${which === "done" ? "completed" : "pending"}`, `${split[which].length} LMPs`);
  };

  return (
    <LuminaShell>
      <LxPageHeader
        crumb={
          sourceLabel ? "ADMIN · MY POC"
          : isViewAsActive ? "VIEW AS · POC DASHBOARD"
          : "POC · DASHBOARD"
        }
        title={sourceLabel ?? (isViewAsActive ? `${pocName}'s LMP Health` : "My LMP Health")}
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
        pocOptions={[pocName]}
        domainOptions={domainOptions}
        statusOptions={statusOptions}
        typeOptions={typeOptions}
      />

      {/* Combined hero — conversion + summary + status distribution */}
      <PocOverviewHeroCard
        conversionPct={conversionRate}
        convertedCount={convertedCount}
        eligibleCount={eligibleCount}
        totalLmpCount={totalLmpCount}
        lsc={lsc}
        conversionInfo={info("poc.hero.conversion")}
        onConversionClick={() => openCanonicalStatus("converted")}
        onStatusClick={openCanonicalStatus}
      />

      <PocMyLoadCards
        inDomainCount={inDomainProcs.length}
        crossDomainCount={crossDomainProcs.length}
        primaryPocCount={primaryProcs.length}
        supportPocCount={supportProcs.length}
        inDomainInfo={info("poc.kpi.indomain")}
        crossDomainInfo={info("poc.kpi.crossdomain")}
        primaryInfo={info("poc.kpi.primary")}
        supportInfo={info("poc.kpi.support")}
        onInDomainClick={() => openLmps(inDomainProcs, "In-domain LMPs", `${inDomainProcs.length} of ${totalLmpCount}`)}
        onCrossDomainClick={() => openLmps(crossDomainProcs, "Cross-domain LMPs", `${crossDomainProcs.length} of ${totalLmpCount}`)}
        onPrimaryClick={() => openLmps(primaryProcs, "Primary POC LMPs", `${primaryProcs.length} processes`)}
        onSupportClick={() => openLmps(supportProcs, "Support POC LMPs", `${supportProcs.length} processes`)}
      />

      <PocOperationalFlags
        rows={filtered}
        todaySet={todaySet}
        zeroCandidateCount={zeroCandidateLmpsCount}
        convertedCandidateCountByLmp={convertedCandidateCountByLmp}
        onItemClick={openSnapshot}
      />

      {/* Checklist + Active table */}
      <LxGrid>
        <LxCard span={5}>
          <LxCardHeader eyebrow="My checklist" title="LMP task completion"
            info={info("poc.checklist")}
            hint="Click any row to drill into completed / pending LMPs." />
          <ul className="space-y-3.5">
            {checklist.map((row, i) => {
              const pct = row.total ? (row.done / row.total) * 100 : 0;
              const accent = pct >= 80 ? "success" : pct >= 60 ? "yellow" : "risk";
              return (
                <li key={row.sheetKey}>
                  <div className="flex items-baseline justify-between text-[12.5px] mb-1.5">
                    <button onClick={() => openChecklist(row.sheetKey, row.label, "pending")} className="text-left hover:underline" style={{ color: "var(--lx-text-2)" }}>{row.label}</button>
                    <span className="font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>
                      <button onClick={() => openChecklist(row.sheetKey, row.label, "done")} className="hover:underline">{row.done}</button>
                      <span style={{ color: "var(--lx-text-3)" }}> / {row.total}</span>
                      <span className="ml-2 font-semibold" style={{ color: LX_HEX[accent] }}>{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden cursor-pointer"
                    onClick={() => openChecklist(row.sheetKey, row.label, "pending")}
                    style={{ background: "var(--lx-soft)" }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.55, delay: i * 0.05, ease: [0, 0, 0.2, 1] }}
                      className="h-full rounded-full"
                      style={{ background: LX_HEX[accent] }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </LxCard>

        <LxCard span={7}>
          <LxCardHeader eyebrow="My active processes" title="Active & pending"
            info={info("poc.active-table")}
            hint="Not started, prep ongoing, prep done, and on hold." />
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full text-[12px] border-separate border-spacing-y-1.5">
              <thead>
                <tr>
                  {["Company","Role","Status","Prep %","Prep doc","Next action"].map((h) => (
                    <th key={h} className="text-left font-medium px-2 py-1 text-[11px] uppercase tracking-[0.5px]"
                      style={{ color: "var(--lx-text-3)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => {
                  const next =
                    r.placementProgress === "Offer" ? "Confirm outcome" :
                    r.prepDoc !== "Sent" ? "Share prep doc" :
                    r.mentorAligned !== "Yes" ? "Align mentor" :
                    r.placementProgress === "Not Started" ? "Confirm selection" :
                    "Update round";
                  return (
                    <tr key={r.processId} className="cursor-pointer hover:bg-[var(--lx-soft)]"
                      onClick={() => openLmps([r], `${r.company} · ${r.role}`)}>
                      <td className="px-2 py-1.5 truncate max-w-[140px]" style={{ color: "var(--lx-text)" }}>{r.company}</td>
                      <td className="px-2 py-1.5 truncate max-w-[120px]" style={{ color: "var(--lx-text-2)" }}>{r.role}</td>
                      <td className="px-2 py-1.5"><StatusPill label={r.displayStatus} slug={r.filterStatus} /></td>
                      <td className="px-2 py-1.5 font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>{r.prepProgress}%</td>
                      <td className="px-2 py-1.5">
                        {r.prepDoc === "Sent"
                          ? <span style={{ color: LX_HEX.success }}>Sent</span>
                          : <span style={{ color: LX_HEX.risk }}>Missing</span>}
                      </td>
                      <td className="px-2 py-1.5" style={{ color: "var(--lx-text-2)" }}>{next}</td>
                    </tr>
                  );
                })}
                {activeRows.length === 0 && (
                  <tr><td colSpan={6} className="px-2 py-6 text-center" style={{ color: "var(--lx-text-3)" }}>No active processes.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </LxCard>
      </LxGrid>

      {/* Action required + Recent activity */}
      <LxGrid>
        <ActionRequiredCard
          rows={filtered}
          todaySet={todaySet}
          title="Your action items"
          eyebrow="Pending actions"
          span={7}
        />
        <RecentActivityCard lmpIds={filtered.map((r) => r.processId)} limit={12} span={5} />
      </LxGrid>

      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </LuminaShell>
  );
}
