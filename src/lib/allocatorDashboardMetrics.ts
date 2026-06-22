import { lmpStatusCounts } from "@/lib/lmpProcessQueries";
import type { LmpRecord } from "@/lib/lmpTypes";
import type { LmpStatus } from "@/types/lmp";

const ACTIVE_LMP_STATUSES = new Set<LmpStatus>([
  "not-started",
  "prep-ongoing",
  "ongoing",
  "prep-done",
]);

const COMPLETED_STATUSES = new Set<LmpStatus>([
  "converted",
  "not-converted",
  "other-reasons",
  "closed",
]);

function parseIso(iso: string | undefined): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : 0;
}

export function countAllocatedDomains(records: LmpRecord[]): number {
  return new Set(records.map((r) => r.domain).filter(Boolean)).size;
}

export function countActiveLmps(records: LmpRecord[]): number {
  return records.filter((r) => ACTIVE_LMP_STATUSES.has(r.status)).length;
}

export function countPrepOngoing(records: LmpRecord[]): number {
  return lmpStatusCounts(records)["prep-ongoing"];
}

export function countCompletedThisMonth(records: LmpRecord[], now = new Date()): number {
  const month = now.getMonth();
  const year = now.getFullYear();
  return records.filter((r) => {
    if (!COMPLETED_STATUSES.has(r.status)) return false;
    const iso = r.closingDate || r.lastActivity || r.lastProgressUpdatedAt || "";
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return false;
    return d.getMonth() === month && d.getFullYear() === year;
  }).length;
}

export function sortRecentlyUpdated(records: LmpRecord[], limit = 12): LmpRecord[] {
  return [...records]
    .sort((a, b) => {
      const ta = parseIso(a.lastActivity || a.lastProgressUpdatedAt || a.createdAt);
      const tb = parseIso(b.lastActivity || b.lastProgressUpdatedAt || b.createdAt);
      return tb - ta;
    })
    .slice(0, limit);
}

export type TaskStatusSegment = {
  label: string;
  value: number;
  accent: "neutral" | "info" | "success" | "risk" | "yellow" | "orange";
  drillKey: "not-started" | "in-progress" | "completed" | "at-risk";
};

export function taskStatusSegments(records: LmpRecord[]): TaskStatusSegment[] {
  const lsc = lmpStatusCounts(records);
  return [
    { label: "Not Started", value: lsc["not-started"], accent: "neutral", drillKey: "not-started" },
    {
      label: "In Progress",
      value: lsc["prep-ongoing"] + lsc["prep-done"],
      accent: "info",
      drillKey: "in-progress",
    },
    {
      label: "Completed",
      value: lsc.converted + lsc["not-converted"],
      accent: "success",
      drillKey: "completed",
    },
    {
      label: "At Risk",
      value: lsc.hold + lsc["other-reasons"],
      accent: "risk",
      drillKey: "at-risk",
    },
  ];
}
