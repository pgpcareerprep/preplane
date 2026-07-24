/**
 * lmpFlags — derive actionable flags for an LMP Process row.
 * Pure functions, no React, no DB. Used by Action Required + Snapshot cards.
 */
import type { Process } from "@/lib/lmpProcessQueries";
import { daysSince } from "@/lib/lmpProcessQueries";
import { normalizeLmpStatus } from "@/lib/config/lmpStatus";
import { isProgressOverdue } from "@/lib/lmpOverdue";

export type LmpFlagKey =
  | "overdue"
  | "daily-progress-pending"
  | "stale"
  | "not-started-stale-4d"
  | "mentor-not-aligned"
  | "prep-doc-not-shared"
  | "mock-pending"
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
  "overdue":                 { key: "overdue",                 label: "Overdue",                priority: "high",   accent: "risk"    },
  "mentor-not-aligned":      { key: "mentor-not-aligned",      label: "Mentor not aligned",     priority: "high",   accent: "risk"    },
  "stale":                   { key: "stale",                   label: "Stale",                  priority: "high",   accent: "orange"  },
  "not-started-stale-4d":    { key: "not-started-stale-4d",    label: "Not Started 4D+",      priority: "high",   accent: "orange"  },
  "daily-progress-pending":  { key: "daily-progress-pending",  label: "Update due today",       priority: "medium", accent: "yellow"  },
  "prep-doc-not-shared":     { key: "prep-doc-not-shared",     label: "Prep doc not shared",    priority: "medium", accent: "orange"  },
  "mock-pending":            { key: "mock-pending",            label: "Mock pending",           priority: "medium", accent: "yellow"  },
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

export function computeFlags(p: Process, extras: FlagExtras): LmpFlag[] {
  const out: LmpFlag[] = [];
  const isActive = ACTIVE_STATUSES.has(p.status);
  const sinceUpdate = daysSince(p.lastProgressUpdatedAt || p.lastUpdated);

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

  // Stale — no meaningful update in more than 4 days
  if (isActive && sinceUpdate > 4) {
    out.push({ ...FLAG_META["stale"], reason: `No update in ${sinceUpdate} days` });
  }

  // Not Started 4D+ — still Not Started with no meaningful update in more than 4 days
  const sinceNotStartedUpdate = daysSinceLastMeaningfulUpdate(p, true);
  if (isNotStartedLmp(p) && sinceNotStartedUpdate > 4) {
    out.push({
      ...FLAG_META["not-started-stale-4d"],
      reason: `Not Started with no update in ${sinceNotStartedUpdate} days`,
    });
  }

  // Daily progress pending — active and no log today
  if (isActive && !extras.hasDailyLogToday) {
    out.push({ ...FLAG_META["daily-progress-pending"], reason: "No progress logged today" });
  }

  // Prep doc not shared — active and not sent
  if (isActive && p.prepDoc !== "Sent") {
    out.push({ ...FLAG_META["prep-doc-not-shared"], reason: "Prep doc not shared" });
  }

  // Mock pending — at R1 or later, mock not done
  const inRounds = ["R1", "R2", "R3", "Offer"].includes(p.placementProgress);
  if (isActive && inRounds && !p.mockDoneByPoc) {
    out.push({ ...FLAG_META["mock-pending"], reason: `In ${p.placementProgress}, mock not completed` });
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

export type SnapshotFlagKey =
  | "overdue"
  | "daily-progress-pending"
  | "mentor-not-aligned"
  | "prep-doc-not-shared"
  | "mock-pending"
  | "stale"
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
    "overdue": 0,
    "daily-progress-pending": 0,
    "mentor-not-aligned": 0,
    "prep-doc-not-shared": 0,
    "mock-pending": 0,
    "stale": 0,
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
