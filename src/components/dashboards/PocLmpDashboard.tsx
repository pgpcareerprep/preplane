import { useMemo, useState } from "react";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader,
  LX_HEX,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters } from "./filters/useLmpFilters";
import { useViewer } from "@/lib/viewerContext";
import { motion } from "framer-motion";
import {
  calculateOutcomeConversionRate, lmpStatusCounts, type Process,
} from "@/lib/lmpProcessQueries";
import { canonicalLmpStatus, type CanonicalLmpStatus, type LmpStatus } from "@/types/lmp";
import { STATUS_META } from "@/lib/lmpTypes";
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
import { snapshotDrill, lmpsByPlacementStep } from "@/lib/dashboardDrill";
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
  const canonical = canonicalLmpStatus(slug as LmpStatus);
  const hex = canonical === "converted" ? LX_HEX.success
    : canonical === "not-converted" ? LX_HEX.risk
    : canonical === "prep-ongoing" ? LX_HEX.info
    : LX_HEX.neutral;
  const soft = `${hex}1F`;
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border"
      style={{ background: soft, color: "var(--lx-text)", borderColor: `${hex}55` }}>
      {label}
    </span>
  );
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

  const { domainOptions, statusOptions, typeOptions } = useDashboardFilterOptions();

  const convertedCount = filteredRecords.filter((r) => r.status === "converted" || r.status === "offer-received").length;
  const notConvertedCount = filteredRecords.filter((r) => r.status === "not-converted").length;
  const eligibleCount = convertedCount + notConvertedCount;
  const conversionRate = calculateOutcomeConversionRate(convertedCount, notConvertedCount);
  const totalLmpCount = filteredRecords.length;
  const lsc = lmpStatusCounts(filteredRecords);

  // Task completion
  const prepDone = filtered.filter((r) => r.prepDoc === "Sent").length;
  const mentorDone = filtered.filter((r) => r.mentorAligned === "Yes").length;
  const roundDone = filtered.filter((r) =>
    r.placementProgress === "R1" || r.placementProgress === "R2" ||
    r.placementProgress === "R3" || r.placementProgress === "Offer" ||
    r.placementProgress === "Converted",
  ).length;
  const finishedIds = useMemo(
    () => new Set(
      filteredRecords
        .filter((r) => {
          const bucket = canonicalLmpStatus(r.status);
          return bucket === "converted" || bucket === "not-converted" || bucket === "other-reasons";
        })
        .map((r) => r.id),
    ),
    [filteredRecords],
  );
  const finished = filtered.filter((p) => finishedIds.has(p.processId));
  const outcomeLogged = finished.filter((p) => {
    const rec = filteredRecords.find((r) => r.id === p.processId);
    if (!rec) return false;
    const bucket = canonicalLmpStatus(rec.status);
    if (bucket === "not-converted") return true;
    if (bucket === "converted") return !!p.convertNames;
    return bucket === "other-reasons";
  }).length;

  const checklist = [
    { label: "Confirm selection",   done: filtered.filter((r) => r.placementProgress !== "Not Started").length, total: filtered.length },
    { label: "Share prep doc",      done: prepDone,        total: filtered.length },
    { label: "Align mentors",       done: mentorDone,      total: filtered.length },
    { label: "Track rounds",        done: roundDone,       total: filtered.length },
    { label: "Close & log outcome", done: outcomeLogged,   total: finished.length },
  ];

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
  const openEligibleLmps = () => {
    const ids = new Set(
      filteredRecords
        .filter((r) => r.status === "converted" || r.status === "offer-received" || r.status === "not-converted")
        .map((r) => r.id),
    );
    openLmps(
      filtered.filter((p) => ids.has(p.processId)),
      "Eligible LMPs · outcomes",
      `${eligibleCount} with terminal outcome`,
    );
  };
  const openSnapshot = (kind: Parameters<typeof snapshotDrill>[0]) => {
    const { rows, title } = snapshotDrill(kind, filtered, todaySet);
    openLmps(rows, `My ${title.toLowerCase()}`, `${rows.length} of ${filtered.length} in my scope`);
  };
  const openChecklist = (
    step: "selected" | "prep-sent" | "mentor-aligned" | "round-tracked" | "outcome-logged",
    label: string,
    which: "done" | "pending",
  ) => {
    const split = lmpsByPlacementStep(filtered, step);
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
        title={sourceLabel ?? (isViewAsActive ? `${pocName}'s workload` : "My workload")}
        subtitle={`Processes where Prep or Support POC = ${pocName}`}
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
        onTotalClick={() => openLmps(filtered, "All my LMPs", `${totalLmpCount} processes`)}
        onConvertedClick={() => openCanonicalStatus("converted")}
        onEligibleClick={openEligibleLmps}
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

      <PocOperationalFlags rows={filtered} todaySet={todaySet} onItemClick={openSnapshot} />

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
              const stepKey = (
                i === 0 ? "selected" :
                i === 1 ? "prep-sent" :
                i === 2 ? "mentor-aligned" :
                i === 3 ? "round-tracked" : "outcome-logged"
              ) as Parameters<typeof openChecklist>[0];
              return (
                <li key={row.label}>
                  <div className="flex items-baseline justify-between text-[12.5px] mb-1.5">
                    <button onClick={() => openChecklist(stepKey, row.label, "pending")} className="text-left hover:underline" style={{ color: "var(--lx-text-2)" }}>{row.label}</button>
                    <span className="font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>
                      <button onClick={() => openChecklist(stepKey, row.label, "done")} className="hover:underline">{row.done}</button>
                      <span style={{ color: "var(--lx-text-3)" }}> / {row.total}</span>
                      <span className="ml-2 font-semibold" style={{ color: LX_HEX[accent] }}>{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden cursor-pointer"
                    onClick={() => openChecklist(stepKey, row.label, "pending")}
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
