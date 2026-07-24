/**
 * lmpFlags — derive actionable flags for an LMP Process row.
 * Pure functions, no React, no DB. Used by Action Required + Snapshot cards.
 */
import type { Process } from "@/lib/lmpProcessQueries";
import { daysSince } from "@/lib/lmpProcessQueries";
import { normalizeLmpStatus } from "@/lib/config/lmpStatus";
import { isProgressOverdue } from "@/lib/lmpOverdue";
import {
  LMP_INACTIVITY_DAYS,
  NO_PROGRESS_UPDATE_DAYS,
  STATUS_UNCHANGED_DAYS,
} from "@/lib/config/thresholds";

export type LmpFlagKey =
  | "overdue"
  | "not-started-stale-4d"
  | "mentor-not-aligned"
  | "no-progress-3d"
  | "status-unchanged-7d"
  | "inactive-20d"
  | "prep-doc-pending"
  | "mock-conducted"
  | "converted-status-no-converted-candidate";

export type LmpFlagPriority = "high" | "medium" | "low";
export type LmpFlagAccent = "risk" | "orange" | "yellow" | "success" | "info";

export interface LmpFlag {
  key: LmpFlagKey;
  label: string;
  priority: LmpFlagPriority;
  accent: LmpFlagAccent;
  reason: string;
}

export const FLAG_META: Record<LmpFlagKey, Omit<LmpFlag, "reason">> = {
  "overdue":                 { key: "overdue",                 label: "Overdue",                   priority: "high",   accent: "risk"    },
  "mentor-not-aligned":      { key: "mentor-not-aligned",      label: "Mentor not aligned",        priority: "high",   accent: "risk"    },
  "not-started-stale-4d":    { key: "not-started-stale-4d",    label: "Not Started 4D+",           priority: "high",   accent: "orange"  },
  "no-progress-3d":          { key: "no-progress-3d",          label: "No Updates > 3 Days",       priority: "high",   accent: "orange"  },
  "status-unchanged-7d":     { key: "status-unchanged-7d",     label: "Status Unchanged > 7 Days", priority: "high",   accent: "orange"  },
  "inactive-20d":            { key: "inactive-20d",            label: "Dormant",                   priority: "high",   accent: "orange"  },
  "prep-doc-pending":        { key: "prep-doc-pending",        label: "Prep Document",             priority: "medium", accent: "orange"  },
  "mock-conducted":          { key: "mock-conducted",          label: "Mock Conducted",            priority: "low",    accent: "success" },
  "converted-status-no-converted-candidate": {
    key: "converted-status-no-converted-candidate",
    label: "Converted but empty",
    priority: "high",
    accent: "risk",
  },
};

const PRIORITY_RANK: Record<LmpFlagPriority, number> = { high: 0, medium: 1, low: 2 };

const ACTIVE_STATUSES = new Set<Process["status"]>([
  "Ongoing", "Offer Received", "On Hold",
]);

export interface FlagExtras {
  /** True if a daily log was recorded for this LMP today. */
  hasDailyLogToday: boolean;
  /** Live converted-pipeline candidate counts keyed by LMP process id. */
  convertedCandidateCountByLmp?: Map<string, number>;
}

export function ageDaysOf(p: Process): number {
  return daysSince(p.dateCreated);
}

function isNotStartedLmp(p: Process): boolean {
  if (normalizeLmpStatus(p.filterStatus) === "not_started") return true;
  return normalizeLmpStatus(p.displayStatus) === "not_started";
}

function daysSinceLastMeaningfulUpdate(p: Process, fallbackToCreated = false): number {
  const iso = p.lastProgressUpdatedAt || p.lastUpdated || (fallbackToCreated ? p.dateCreated : "");
  return daysSince(iso);
}

function latestActivityIso(p: Process): string {
  let best = "";
  let bestTs = Number.NEGATIVE_INFINITY;
  for (const iso of [p.statusChangedAt, p.lastProgressUpdatedAt, p.checklistUpdatedAt]) {
    if (!iso) continue;
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts > bestTs) {
      bestTs = ts;
      best = iso;
    }
  }
  return best;
}

export function computeFlags(p: Process, extras: FlagExtras): LmpFlag[] {
  const out: LmpFlag[] = [];
  const isActive = ACTIVE_STATUSES.has(p.status);

  // Overdue — past next expected progress date with no update after that date
  if (isActive && isProgressOverdue(p.nextExpectedProgress, p.lastProgressUpdatedAt)) {
    out.push({
      ...FLAG_META["overdue"],
      reason: `Progress update overdue since ${p.nextExpectedProgress!.slice(0, 10)}`,
    });
  }

  // Mentor not aligned — active LMP without mentor alignment
  if (isActive && p.mentorAligned !== "Yes") {
    out.push({ ...FLAG_META["mentor-not-aligned"], reason: "Mentor not aligned" });
  }

  // Not Started 4D+ — still Not Started with no meaningful update in more than 4 days
  const sinceNotStartedUpdate = daysSinceLastMeaningfulUpdate(p, true);
  if (isNotStartedLmp(p) && sinceNotStartedUpdate > 4) {
    out.push({
      ...FLAG_META["not-started-stale-4d"],
      reason: `Not Started with no update in ${sinceNotStartedUpdate} days`,
    });
  }

  // No progress update in > 3 days (lastProgressUpdatedAt only — never lastUpdated)
  const sinceProgress = daysSince(p.lastProgressUpdatedAt || p.dateCreated);
  if (isActive && sinceProgress > NO_PROGRESS_UPDATE_DAYS) {
    out.push({
      ...FLAG_META["no-progress-3d"],
      reason: `No progress update in ${sinceProgress} days`,
    });
  }

  // Status unchanged > 7 days
  const sinceStatus = daysSince(p.statusChangedAt || p.dateCreated);
  if (isActive && sinceStatus > STATUS_UNCHANGED_DAYS) {
    out.push({
      ...FLAG_META["status-unchanged-7d"],
      reason: `Status unchanged for ${sinceStatus} days`,
    });
  }

  // Dormant / inactive — no status, progress, or checklist activity in > 20 days
  const lastActivity = latestActivityIso(p);
  const sinceActivity = daysSince(lastActivity || p.dateCreated);
  if (isActive && sinceActivity > LMP_INACTIVITY_DAYS) {
    out.push({
      ...FLAG_META["inactive-20d"],
      reason: `No status/progress/checklist activity in ${sinceActivity} days`,
    });
  }

  // Prep document pending — 'na' never counts
  if (isActive && p.prepDocStatus === "pending") {
    out.push({ ...FLAG_META["prep-doc-pending"], reason: "Prep document pending" });
  }

  // Mock conducted — achievement metric (mock marked complete)
  if (isActive && p.mockDoneByPoc) {
    out.push({ ...FLAG_META["mock-conducted"], reason: "1:1 mock completed" });
  }

  // Converted status mismatch — LMP marked Converted but no candidate in Converted pipeline
  if (p.status === "Converted") {
    const convertedCount = extras.convertedCandidateCountByLmp?.get(p.processId) ?? 0;
    if (convertedCount === 0) {
      out.push({
        ...FLAG_META["converted-status-no-converted-candidate"],
        reason: "LMP status is Converted but no candidate is in the Converted pipeline",
      });
    }
  }

  return out;
}

export type FlaggedRow = {
  process: Process;
  flags: LmpFlag[];
  age: number;
  topPriority: LmpFlagPriority;
};

export function flagRows(
  rows: Process[],
  todaySet: Set<string>,
  convertedCandidateCountByLmp?: Map<string, number>,
): FlaggedRow[] {
  const out: FlaggedRow[] = [];
  for (const p of rows) {
    const flags = computeFlags(p, {
      hasDailyLogToday: todaySet.has(p.processId),
      convertedCandidateCountByLmp,
    });
    if (!flags.length) continue;
    const topPriority = flags.reduce<LmpFlagPriority>(
      (acc, f) => (PRIORITY_RANK[f.priority] < PRIORITY_RANK[acc] ? f.priority : acc),
      "low",
    );
    out.push({ process: p, flags, age: ageDaysOf(p), topPriority });
  }
  // Sort: high priority first, then oldest first
  out.sort((a, b) => {
    const p = PRIORITY_RANK[a.topPriority] - PRIORITY_RANK[b.topPriority];
    if (p !== 0) return p;
    return b.age - a.age;
  });
  return out;
}

/** Snapshot strip keys — overdue is intentionally excluded (Action Required only). */
export type SnapshotFlagKey =
  | "no-progress-3d"
  | "status-unchanged-7d"
  | "inactive-20d"
  | "mentor-not-aligned"
  | "prep-doc-pending"
  | "mock-conducted"
  | "not-started-stale-4d"
  | "converted-status-no-converted-candidate";

export interface FlagSummary {
  byKey: Record<SnapshotFlagKey, number>;
}

export function summarizeFlags(
  rows: Process[],
  todaySet: Set<string>,
  convertedCandidateCountByLmp?: Map<string, number>,
): FlagSummary {
  const byKey: Record<SnapshotFlagKey, number> = {
    "no-progress-3d": 0,
    "status-unchanged-7d": 0,
    "inactive-20d": 0,
    "mentor-not-aligned": 0,
    "prep-doc-pending": 0,
    "mock-conducted": 0,
    "not-started-stale-4d": 0,
    "converted-status-no-converted-candidate": 0,
  };
  for (const p of rows) {
    const flags = computeFlags(p, {
      hasDailyLogToday: todaySet.has(p.processId),
      convertedCandidateCountByLmp,
    });
    for (const f of flags) {
      if (f.key in byKey) byKey[f.key as SnapshotFlagKey] += 1;
    }
  }
  return { byKey };
}
