import { useState } from "react";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader, LxSection,
  LxHero, LxKpi, LxStackedBar, LxAttentionStrip, LX_HEX,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters } from "./filters/useLmpFilters";
import { useRole } from "@/lib/rolesContext";
import { motion } from "framer-motion";
import {
  isConverted, isDormant, statusCounts, type Process, type ProcessStatus,
} from "@/lib/lmpProcessQueries";
import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";

import { useTodayDailyLogIds } from "@/lib/hooks/useTodayDailyLogIds";
import { ActionRequiredCard } from "./sections/ActionRequiredCard";
import { RecentSnapshotStrip } from "./sections/RecentSnapshotStrip";
import { RecentActivityCard } from "./sections/RecentActivityCard";
import { LxDrillDown, type DrillState } from "@/components/insights/LxDrillDown";
import { info } from "@/lib/dashboardInfo";
import { lmpsByStatus, lmpsActive, lmpsRisk, snapshotDrill, lmpsByPlacementStep } from "@/lib/dashboardDrill";
import { useLmpRows } from "@/lib/sheets/hooks";
import { isUserOperationalPoc, isUserPocOnRecord } from "@/lib/lmpViewingContext";

const STATUS_ACCENT: Record<Process["status"], { hex: string; soft: string; fg: string }> = {
  Ongoing:          { hex: LX_HEX.info,    soft: "rgba(74,142,232,0.12)",  fg: LX_HEX.info },
  "Offer Received": { hex: LX_HEX.yellow,  soft: "rgba(247,211,68,0.18)",  fg: "var(--lx-text)" },
  Converted:        { hex: LX_HEX.success, soft: "rgba(106,158,98,0.12)",  fg: LX_HEX.success },
  "On Hold":        { hex: LX_HEX.ai,      soft: "rgba(139,92,246,0.12)",  fg: LX_HEX.ai },
  Dormant:          { hex: LX_HEX.orange,  soft: "rgba(227,131,48,0.10)",  fg: "var(--lx-text)" },
  Closed:           { hex: LX_HEX.risk,    soft: "rgba(240,112,64,0.12)",  fg: LX_HEX.risk },
};

function StatusPill({ s }: { s: Process["status"] }) {
  const a = STATUS_ACCENT[s];
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10.5px] font-medium border"
      style={{ background: a.soft, color: a.fg, borderColor: `${a.hex}55` }}>
      {s}
    </span>
  );
}

export function PocLmpDashboard() {

  const { user } = useRole();
  // Live realtime — POC dashboard refreshes as their LMPs / candidates change.
  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();
  useRealtimeInvalidate("lmp_processes", [["lmp_rows"], ["db-lmp-processes"]]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["lmp_rows"]]);
  useRealtimeInvalidate("poc_profiles" as never, [["lmp_rows"], ["poc_profiles_registry"]]);
  const todaySet = useTodayDailyLogIds();
  const { processes: liveProcesses } = useLiveProcesses();
  // Always use the signed-in POC's canonical name. Never borrow another
  // POC's identity just because the current user owns zero rows yet.
  const pocName = (user.pocProfileName ?? user.name ?? user.email ?? "").trim();

  const { filtered, filters, set } = useLmpFilters({ role: "poc", userName: pocName, data: liveProcesses.length ? liveProcesses : undefined });

  const total = filtered.length || 1;
  const converted = filtered.filter(isConverted).length;
  const conversionRate = (converted / total) * 100;
  const ongoing = filtered.filter((r) => r.status === "Ongoing").length;
  const offer = filtered.filter((r) => r.status === "Offer Received").length;
  const risk =
    filtered.filter((r) => r.status === "On Hold").length +
    filtered.filter(isDormant).length +
    filtered.filter((r) => r.status === "Closed").length;

  const sc = statusCounts(filtered);

  // Task completion
  const prepDone = filtered.filter((r) => r.prepDoc === "Sent").length;
  const mentorDone = filtered.filter((r) => r.mentorAligned === "Yes").length;
  const roundDone = filtered.filter((r) =>
    r.placementProgress === "R1" || r.placementProgress === "R2" ||
    r.placementProgress === "R3" || r.placementProgress === "Offer" ||
    r.placementProgress === "Converted",
  ).length;
  const finished = filtered.filter((r) => r.status === "Closed" || isConverted(r));
  const outcomeLogged = finished.filter((r) =>
    (r.status === "Closed" && r.closedReason) ||
    (isConverted(r) && r.convertNames),
  ).length;

  const checklist = [
    { label: "Confirm selection",   done: filtered.filter((r) => r.placementProgress !== "Not Started").length, total: filtered.length },
    { label: "Share prep doc",      done: prepDone,        total: filtered.length },
    { label: "Align mentors",       done: mentorDone,      total: filtered.length },
    { label: "Track rounds",        done: roundDone,       total: filtered.length },
    { label: "Close & log outcome", done: outcomeLogged,   total: finished.length },
  ];

  // Domain & assignment breakdown (user-specific via allocationTags)
  const { data: lmpRows = [] } = useLmpRows();
  const myLmpRowById = new Map(
    lmpRows.filter(r => isUserPocOnRecord(r, pocName)).map(r => [r.id, r])
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

  // Active processes
  const activeRows = filtered
    .filter((r) => r.status === "Ongoing" || r.status === "Offer Received" || r.status === "On Hold")
    .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
    .slice(0, 12);

  const [drill, setDrill] = useState<DrillState | null>(null);
  const openLmps = (rows: Process[], title: string, subtitle?: string) =>
    setDrill({ kind: "lmps", title, subtitle, rows });
  const openStatus = (st: ProcessStatus) =>
    openLmps(lmpsByStatus(filtered, st), `${st} · my LMPs`, `${filtered.length} in my scope`);
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
        crumb="POC · DASHBOARD"
        title="My workload"
        subtitle={`Processes where Prep, Support, or Outreach POC = ${pocName}`}
        right={<LxLivePill />}
      />

      <LxLmpFilters filters={filters} set={set} pocOptions={[pocName]} />

      {/* SECTION 1 — Personal hero + KPIs */}
      <LxGrid>
        <LxHero
          eyebrow="My Conversion"
          title="My final-conversion rate across owned processes"
          primaryValue={`${conversionRate.toFixed(1)}%`}
          primaryLabel="my conversion"
          info={info("poc.hero.conversion")}
          onPrimaryClick={() => openLmps(filtered.filter(isConverted), "My converted LMPs", `${converted} of ${filtered.length}`)}
          statement={`${converted} of ${filtered.length} processes converted`}
          ringPct={conversionRate}
          variant="green"
          span={7}
        />
        <div className="col-span-12 md:col-span-5 grid grid-cols-12 gap-4">
          <LxKpi span={6} label="My active load" accent="info"   value={ongoing} sub="Status = Ongoing"
            info={info("poc.kpi.active")} onClick={() => openStatus("Ongoing")} />
          <LxKpi span={6} label="Offer received" accent="yellow" value={offer}   sub="Awaiting outcome"
            info={info("poc.kpi.offer")} onClick={() => openStatus("Offer Received")} />
          <LxKpi span={6} label="My risk load"   accent="risk"   value={risk}    sub="Hold + Dormant + Closed"
            info={info("poc.kpi.risk")} onClick={() => openLmps(lmpsRisk(filtered), "My risk load", `${risk} LMPs`)} />
          <LxKpi span={6} label="Total processes" accent="teal"  value={filtered.length} sub="In my scope"
            info={info("poc.kpi.total")} onClick={() => openLmps(filtered, "All my LMPs", `${filtered.length} processes`)} />
        </div>
      </LxGrid>

      {/* SECTION 1b — Domain & assignment breakdown */}
      <LxGrid>
        <LxKpi span={3} label="In-domain LMPs"  accent="success" value={inDomainProcs.length}   sub="Matches my domains"
          info={info("poc.kpi.indomain")}    onClick={() => openLmps(inDomainProcs,   "In-domain LMPs",    `${inDomainProcs.length} of ${filtered.length}`)} />
        <LxKpi span={3} label="Cross-domain"    accent="orange"  value={crossDomainProcs.length} sub="Outside my domains"
          info={info("poc.kpi.crossdomain")} onClick={() => openLmps(crossDomainProcs, "Cross-domain LMPs", `${crossDomainProcs.length} of ${filtered.length}`)} />
        <LxKpi span={3} label="Primary POC"     accent="teal"    value={primaryProcs.length}     sub="Prep / primary role"
          info={info("poc.kpi.primary")}     onClick={() => openLmps(primaryProcs,    "Primary POC LMPs",  `${primaryProcs.length} processes`)} />
        <LxKpi span={3} label="Support POC"     accent="ai"      value={supportProcs.length}     sub="Support / secondary role"
          info={info("poc.kpi.support")}     onClick={() => openLmps(supportProcs,    "Support POC LMPs",  `${supportProcs.length} processes`)} />
      </LxGrid>

      {/* Live snapshot strip — counts of overdue / pending / stale items */}
      <RecentSnapshotStrip rows={filtered} todaySet={todaySet} onItemClick={openSnapshot} />

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

      {/* SECTION 2 — Status distribution */}
      <LxSection eyebrow="My status" title="My process status distribution" info={info("poc.status-bar")} />
      <LxCard span={12}>
        <LxStackedBar
          onSegmentClick={(s) => openStatus(s.label as ProcessStatus)}
          segments={[
            { label: "Ongoing",        value: sc.Ongoing,            accent: "info" },
            { label: "Offer Received", value: sc["Offer Received"], accent: "yellow" },
            { label: "Converted",      value: sc.Converted,          accent: "success" },
            { label: "On Hold",        value: sc["On Hold"],        accent: "ai" },
            { label: "Dormant",        value: sc.Dormant,            accent: "orange" },
            { label: "Closed",         value: sc.Closed,             accent: "risk" },
          ]}
        />
      </LxCard>

      {/* SECTION 3 — Checklist + Active table */}
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
            hint="Ongoing, Offer Received, On Hold." />
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
                      <td className="px-2 py-1.5"><StatusPill s={r.status} /></td>
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


      <LxAttentionStrip
        items={[
          { label: "My conversion", value: `${conversionRate.toFixed(1)}%`, accent: "success", info: info("poc.hero.conversion"),
            onClick: () => openLmps(filtered.filter(isConverted), "My converted LMPs") },
          { label: "Active load",   value: ongoing,                          accent: "info",   info: info("poc.kpi.active"),
            onClick: () => openStatus("Ongoing") },
          { label: "Awaiting outcome", value: offer,                         accent: "yellow", info: info("poc.kpi.offer"),
            onClick: () => openStatus("Offer Received") },
          { label: "Risk load",     value: risk,                             accent: "risk",   info: info("poc.kpi.risk"),
            onClick: () => openLmps(lmpsRisk(filtered), "My risk load") },
        ]}
      />

      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </LuminaShell>
  );
}
