import { useMemo, useState } from "react";
import {
  LuminaShell, LxPageHeader, LxLivePill, LxGrid, LxCard, LxCardHeader, LxSection,
  LxHero, LxKpi, LxStackedBar, LxAttentionStrip, LX_HEX,
} from "@/components/insights/primitives";
import { LxLmpFilters } from "@/components/insights/LxFilters";
import { useLmpFilters, usePrepPocOptions } from "./filters/useLmpFilters";
import { useRole } from "@/lib/rolesContext";
import { completenessForRows, isConverted, requiredFieldsForRow, type Process } from "@/lib/lmpProcessQueries";
import { motion } from "framer-motion";
import { useLiveProcesses } from "@/lib/sheets/useLiveProcesses";
import { useLmpProcessesRealtime } from "@/lib/hooks/useLmpProcessesRealtime";
import { useLmpCandidatesRealtime } from "@/lib/hooks/useLmpCandidatesRealtime";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { Link } from "react-router-dom";
import { SyncIndicator } from "@/components/sheets/SyncIndicator";
import { useTodayDailyLogIds } from "@/lib/hooks/useTodayDailyLogIds";
import { ActionRequiredCard } from "./sections/ActionRequiredCard";
import { RecentSnapshotStrip } from "./sections/RecentSnapshotStrip";
import { RecentActivityCard } from "./sections/RecentActivityCard";
import { summarizeFlags } from "@/lib/lmpFlags";
import { LxDrillDown, type DrillState } from "@/components/insights/LxDrillDown";
import { info } from "@/lib/dashboardInfo";
import {
  lmpsMissingPrepDoc, lmpsStatusMissing, lmpsRoundGap, lmpsUnloggedOutcomes,
  lmpsByPlacementStep, snapshotDrill, lmpsByStatus, lmpsHighPriority,
} from "@/lib/dashboardDrill";

export function AllocatorLmpDashboard() {
  const { user } = useRole();
  const prepPocOptions = usePrepPocOptions();
  useLmpProcessesRealtime();
  useLmpCandidatesRealtime();
  useRealtimeInvalidate("lmp_processes", [["lmp_rows"], ["db-lmp-processes"]]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["lmp_rows"]]);
  useRealtimeInvalidate("poc_profiles" as never, [["lmp_rows"], ["poc_profiles_registry"]]);
  const { processes: liveProcesses } = useLiveProcesses();
  const { filtered, all, filters, set } = useLmpFilters({ role: "allocator", userName: user.name, data: liveProcesses.length ? liveProcesses : undefined });

  const todaySet = useTodayDailyLogIds();
  const completeness = useMemo(() => completenessForRows(filtered), [filtered]);

  // Quality KPIs
  const missingPrep = filtered.filter((r) => !r.prepDoc && (r.status === "Ongoing" || r.status === "Offer Received")).length;
  const roundGaps = filtered.filter((r) => {
    const latest = r.r3Shortlisted ? "R3" : r.r2Shortlisted ? "R2" : r.r1Shortlisted ? "R1" : null;
    if (!latest) return false;
    return r.placementProgress !== latest && !["Offer", "Converted"].includes(r.placementProgress);
  }).length;
  const unloggedOutcomes = filtered.filter((r) => {
    if (r.status === "Closed") return !r.closedReason;
    if (isConverted(r)) return !r.convertNames;
    return false;
  }).length;
  const statusMissing = filtered.filter((r) => !r.status).length;
  const totalIssues = filtered.reduce((s, r) => s + requiredFieldsForRow(r).missing.length, 0);

  // Compliance checklist
  const total = filtered.length;
  const finished = filtered.filter((r) => r.status === "Closed" || isConverted(r));
  const compliance = [
    { label: "Prep doc compliance",    done: filtered.filter((r) => r.prepDoc === "Sent").length, total },
    { label: "Mentor alignment",       done: filtered.filter((r) => r.mentorAligned === "Yes").length, total },
    { label: "Round tracking",         done: filtered.filter((r) => {
      const latest = r.r3Shortlisted ? "R3" : r.r2Shortlisted ? "R2" : r.r1Shortlisted ? "R1" : null;
      return !latest || r.placementProgress === latest || ["Offer", "Converted"].includes(r.placementProgress);
    }).length, total },
    { label: "Outcome logging",        done: finished.filter((r) =>
        (r.status === "Closed" && r.closedReason) || (isConverted(r) && r.convertNames),
      ).length, total: finished.length },
  ];

  const flagSummary = useMemo(() => summarizeFlags(filtered, todaySet), [filtered, todaySet]);

  const [drill, setDrill] = useState<DrillState | null>(null);
  const openLmps = (rows: Process[], title: string, subtitle?: string) =>
    setDrill({ kind: "lmps", title, subtitle, rows });
  const openSnapshot = (kind: Parameters<typeof snapshotDrill>[0]) => {
    const { rows, title } = snapshotDrill(kind, filtered, todaySet);
    openLmps(rows, title, `${rows.length} of ${filtered.length} in scope`);
  };

  return (
    <LuminaShell>
      <LxPageHeader
        crumb="MODERATOR · DASHBOARD"
        title="Data quality snapshot"
        subtitle="What's missing, stale, or incorrectly logged across all processes."
        right={<LxLivePill />}
      />

      <LxLmpFilters
        filters={filters}
        set={set}
        pocOptions={prepPocOptions}
        showPrepPoc
      />

      {/* SECTION 1 — Completeness Hero + KPI cluster */}
      <LxGrid>
        <LxHero
          eyebrow="Data completeness"
          title="Required fields filled across all in-scope processes"
          primaryValue={`${completeness.pct.toFixed(1)}%`}
          primaryLabel="overall completeness"
          info={info("alloc.hero.completeness")}
          statement={`${completeness.filled} of ${completeness.total} required fields filled`}
          ringPct={completeness.pct}
          variant="blue"
          span={7}
          onPrimaryClick={() => openLmps(filtered.filter((r) => requiredFieldsForRow(r).missing.length > 0), "LMPs with missing fields", `${filtered.length} in scope`)}
        />
        <div className="col-span-12 md:col-span-5 grid grid-cols-12 gap-4">
          <LxKpi span={6} label="Processes in scope" accent="info"   value={filtered.length} sub={`Of ${all.length} total`}
            info={info("alloc.kpi.in-scope")} onClick={() => openLmps(filtered, "Processes in scope")} />
          <LxKpi span={6} label="Total issues"       accent="risk"   value={totalIssues}     sub="Sum of missing fields"
            info={info("alloc.kpi.issues")} onClick={() => openLmps(filtered.filter((r) => requiredFieldsForRow(r).missing.length > 0), "LMPs with issues")} />
          <LxKpi span={6} label="Missing prep docs"  accent="orange" value={missingPrep}     sub="Ongoing or Offer"
            info={info("alloc.kpi.missing-prep")} onClick={() => openLmps(lmpsMissingPrepDoc(filtered), "Missing prep docs")} />
          <LxKpi span={6} label="Status missing"     accent="ai"     value={statusMissing}   sub="Required field blank"
            info={info("alloc.kpi.status-missing")} onClick={() => openLmps(lmpsStatusMissing(filtered), "Status missing")} />
        </div>
      </LxGrid>

      {/* SECTION 2 — Quality breakdown */}
      <LxSection eyebrow="Quality" title="Where data quality breaks" info={info("alloc.issue-mix")} hint="Top-level signals across the four most common gap types." />
      <LxGrid>
        <LxKpi span={3} label="Missing prep docs"  accent="risk"   value={missingPrep}      sub="Ongoing or Offer Received"
          info={info("alloc.kpi.missing-prep")} onClick={() => openLmps(lmpsMissingPrepDoc(filtered), "Missing prep docs")} />
        <LxKpi span={3} label="Round data gaps"    accent="yellow" value={roundGaps}        sub="Latest round vs progress"
          info={info("alloc.quality.round-gaps")} onClick={() => openLmps(lmpsRoundGap(filtered), "Round data gaps")} />
        <LxKpi span={3} label="Unlogged outcomes"  accent="risk"   value={unloggedOutcomes} sub="Closed/Converted blank"
          info={info("alloc.quality.unlogged")} onClick={() => openLmps(lmpsUnloggedOutcomes(filtered), "Unlogged outcomes")} />
        <LxKpi span={3} label="Status missing"     accent="ai"     value={statusMissing}    sub="Status field blank"
          info={info("alloc.kpi.status-missing")} onClick={() => openLmps(lmpsStatusMissing(filtered), "Status missing")} />
      </LxGrid>

      {/* Snapshot strip — live flag counts */}
      <RecentSnapshotStrip rows={filtered} todaySet={todaySet} onItemClick={openSnapshot} />

      {/* SECTION 3 — Compliance snapshot (full width now) */}
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader
            eyebrow="Compliance"
            title="Compliance snapshot"
            info={info("alloc.compliance")}
            hint="Click a row to see passing LMPs; click the label to see failing LMPs."
          />
          <ul className="space-y-3.5">
            {compliance.map((row, i) => {
              const pct = row.total ? (row.done / row.total) * 100 : 0;
              const accent = pct >= 80 ? "success" : pct >= 60 ? "yellow" : "risk";
              const stepKey = (
                i === 0 ? "prep-sent" :
                i === 1 ? "mentor-aligned" :
                i === 2 ? "round-tracked" : "outcome-logged"
              ) as Parameters<typeof lmpsByPlacementStep>[1];
              const openStep = (which: "done" | "pending") => {
                const split = lmpsByPlacementStep(filtered, stepKey);
                openLmps(split[which], `${row.label} · ${which === "done" ? "passing" : "failing"}`, `${split[which].length} LMPs`);
              };
              return (
                <li key={row.label}>
                  <div className="flex items-baseline justify-between text-[12.5px] mb-1.5">
                    <button onClick={() => openStep("pending")} className="text-left hover:underline" style={{ color: "var(--lx-text-2)" }}>{row.label}</button>
                    <span className="font-mono tabular-nums" style={{ color: "var(--lx-text)" }}>
                      <button onClick={() => openStep("done")} className="hover:underline">{row.done}</button>
                      <span style={{ color: "var(--lx-text-3)" }}> / {row.total}</span>
                      <span className="ml-2 font-semibold" style={{ color: LX_HEX[accent] }}>{pct.toFixed(0)}%</span>
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden cursor-pointer"
                    onClick={() => openStep("done")}
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
      </LxGrid>

      {/* SECTION 4 — Issue mix (stacked) */}
      <LxSection eyebrow="Issue mix" title="Where the gaps live" info={info("alloc.issue-mix")} hint="Distribution across the four most common gap types." />
      <LxCard span={12}>
        <LxStackedBar
          onSegmentClick={(s) => {
            if (s.label === "Missing prep")          openLmps(lmpsMissingPrepDoc(filtered), "Missing prep docs");
            else if (s.label === "Round gaps")       openLmps(lmpsRoundGap(filtered), "Round data gaps");
            else if (s.label === "Unlogged outcome") openLmps(lmpsUnloggedOutcomes(filtered), "Unlogged outcomes");
            else if (s.label === "Status missing")   openLmps(lmpsStatusMissing(filtered), "Status missing");
          }}
          segments={[
            { label: "Missing prep",     value: missingPrep,      accent: "risk" },
            { label: "Round gaps",       value: roundGaps,        accent: "yellow" },
            { label: "Unlogged outcome", value: unloggedOutcomes, accent: "orange" },
            { label: "Status missing",   value: statusMissing,    accent: "ai" },
          ]}
        />
      </LxCard>

      {/* ─── LMP Tracker summary ─── */}
      <LxSection eyebrow="LMP Tracker · Live" title="Process snapshot" />
      <LxGrid>
        <LxKpi span={3} label="Total LMPs" accent="info" value={filtered.length} sub="From LMP Tracker"
          info={info("alloc.tracker.total")} onClick={() => openLmps(filtered, "All LMPs in scope")} />
        <LxKpi span={3} label="Ongoing" accent="teal"
          value={filtered.filter((r) => r.status === "Ongoing").length}
          info={info("alloc.tracker.ongoing")} onClick={() => openLmps(lmpsByStatus(filtered, "Ongoing"), "Ongoing LMPs")}
          sub="Active processes" />
        <LxKpi span={3} label="Converted" accent="success"
          value={filtered.filter(isConverted).length} sub="Successfully placed"
          info={info("alloc.tracker.converted")} onClick={() => openLmps(filtered.filter(isConverted), "Converted LMPs")} />
        <LxKpi span={3} label="Domains" accent="orange"
          value={new Set(filtered.map((r) => r.domain).filter(Boolean)).size} sub="Unique domains"
          info={info("alloc.tracker.domains")}
          onClick={() => setDrill({
            kind: "domains",
            title: "Domains in scope",
            rows: Array.from(new Set(filtered.map((r) => r.domain).filter(Boolean)))
              .map((d) => ({ name: d as string, value: filtered.filter((r) => r.domain === d).length })),
          })} />
      </LxGrid>
      <LxGrid>
        <LxCard span={12}>
          <LxCardHeader eyebrow="Quick access" title="LMP Tracker records"
            right={
              <div className="flex items-center gap-3">
                <SyncIndicator queryKey={["sheets", "LMP Tracker"]} />
                <Link to="/lmp" className="text-[11.5px] font-medium px-2.5 py-1.5 rounded-md transition-colors"
                  style={{ color: "var(--lx-accent)", background: "var(--lx-soft)" }}>
                  View all LMPs →
                </Link>
              </div>
            }
          />
        </LxCard>
      </LxGrid>

      {/* Action required (allocation gaps focus) + Recent activity */}
      <LxGrid>
        <ActionRequiredCard
          rows={filtered}
          todaySet={todaySet}
          title="Allocation gaps"
          eyebrow="Pending actions"
          limit={10}
          span={7}
        />
        <RecentActivityCard limit={14} span={5} />
      </LxGrid>

      {/* Attention strip */}
      <LxAttentionStrip
        items={[
          { label: "Overall completeness", value: `${completeness.pct.toFixed(1)}%`,  accent: "info",   info: info("alloc.hero.completeness") },
          { label: "Total issues",         value: totalIssues,                         accent: "risk",   info: info("alloc.kpi.issues"),
            onClick: () => openLmps(filtered.filter((r) => requiredFieldsForRow(r).missing.length > 0), "LMPs with issues") },
          { label: "Action required",      value: flagSummary.total,                   accent: "orange", info: info("snapshot.high-priority"),
            onClick: () => openLmps(lmpsHighPriority(filtered, todaySet), "High-priority LMPs") },
          { label: "Missing prep",         value: missingPrep,                         accent: "yellow", info: info("alloc.kpi.missing-prep"),
            onClick: () => openLmps(lmpsMissingPrepDoc(filtered), "Missing prep docs") },
        ]}
      />

      <LxDrillDown state={drill} onClose={() => setDrill(null)} />
    </LuminaShell>
  );
}
