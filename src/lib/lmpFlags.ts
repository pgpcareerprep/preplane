/**
 * lmpFlags — derive actionable flags for an LMP Process row.
 * Pure functions, no React, no DB. Used by Action Required + Snapshot cards.
 */
import type { Process } from "@/lib/lmpProcessQueries";
import { daysSince } from "@/lib/lmpProcessQueries";

export type LmpFlagKey =
  | "overdue"
  | "daily-progress-pending"
  | "status-stale-14d"
  | "mentor-pending-20d"
  | "prep-doc-pending"
  | "mock-pending"
  | "no-recent-activity";

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
  "mentor-pending-20d":      { key: "mentor-pending-20d",      label: "Mentor 20d+",            priority: "high",   accent: "risk"    },
  "status-stale-14d":        { key: "status-stale-14d",        label: "Stale 14d+",             priority: "high",   accent: "orange"  },
  "daily-progress-pending":  { key: "daily-progress-pending",  label: "Update due today",       priority: "medium", accent: "yellow"  },
  "prep-doc-pending":        { key: "prep-doc-pending",        label: "Prep doc pending",       priority: "medium", accent: "orange"  },
  "mock-pending":            { key: "mock-pending",            label: "Mock pending",           priority: "medium", accent: "yellow"  },
  "no-recent-activity":      { key: "no-recent-activity",      label: "No recent activity",     priority: "low",    accent: "info"    },
};

const PRIORITY_RANK: Record<LmpFlagPriority, number> = { high: 0, medium: 1, low: 2 };

const ACTIVE_STATUSES = new Set<Process["status"]>([
  "Ongoing", "Offer Received", "On Hold",
]);

export interface FlagExtras {
  /** True if a daily log was recorded for this LMP today. */
  hasDailyLogToday: boolean;
}

export function ageDaysOf(p: Process): number {
  return daysSince(p.dateCreated);
}

export function computeFlags(p: Process, extras: FlagExtras): LmpFlag[] {
  const out: LmpFlag[] = [];
  const isActive = ACTIVE_STATUSES.has(p.status);
  const age = ageDaysOf(p);
  const sinceUpdate = daysSince(p.lastProgressUpdatedAt || p.lastUpdated);

  // Overdue — past closing date while still active
  if (isActive && p.closingDate) {
    const closing = new Date(p.closingDate).getTime();
    if (Number.isFinite(closing) && closing < Date.now()) {
      out.push({ ...FLAG_META["overdue"], reason: `Past closing date (${p.closingDate.slice(0, 10)})` });
    }
  }

  // Mentor pending 20d+ — mentor not aligned, LMP older than 20 days
  if (isActive && p.mentorAligned !== "Yes" && age > 20) {
    out.push({ ...FLAG_META["mentor-pending-20d"], reason: `${age} days old, no mentor aligned` });
  }

  // Status stale 14d+ — no update in 14 days
  if (isActive && sinceUpdate > 14) {
    out.push({ ...FLAG_META["status-stale-14d"], reason: `No update in ${sinceUpdate} days` });
  }

  // Daily progress pending — active and no log today
  if (isActive && !extras.hasDailyLogToday) {
    out.push({ ...FLAG_META["daily-progress-pending"], reason: "No progress logged today" });
  }

  // Prep doc pending — active and not sent
  if (isActive && p.prepDoc !== "Sent") {
    out.push({ ...FLAG_META["prep-doc-pending"], reason: "Prep doc not shared" });
  }

  // Mock pending — at R1 or later, mock not done
  const inRounds = ["R1", "R2", "R3", "Offer"].includes(p.placementProgress);
  if (isActive && inRounds && !p.mockDoneByPoc) {
    out.push({ ...FLAG_META["mock-pending"], reason: `In ${p.placementProgress}, mock not completed` });
  }

  // No recent activity — informational
  if (isActive && sinceUpdate > 7 && sinceUpdate <= 14) {
    out.push({ ...FLAG_META["no-recent-activity"], reason: `No update in ${sinceUpdate} days` });
  }

  return out;
}

export type FlaggedRow = {
  process: Process;
  flags: LmpFlag[];
  age: number;
  topPriority: LmpFlagPriority;
};

export function flagRows(rows: Process[], todaySet: Set<string>): FlaggedRow[] {
  const out: FlaggedRow[] = [];
  for (const p of rows) {
    const flags = computeFlags(p, { hasDailyLogToday: todaySet.has(p.processId) });
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

export interface FlagSummary {
  total: number;
  high: number;
  byKey: Record<LmpFlagKey, number>;
}

export function summarizeFlags(rows: Process[], todaySet: Set<string>): FlagSummary {
  const byKey: Record<LmpFlagKey, number> = {
    "overdue": 0,
    "mentor-pending-20d": 0,
    "status-stale-14d": 0,
    "daily-progress-pending": 0,
    "prep-doc-pending": 0,
    "mock-pending": 0,
    "no-recent-activity": 0,
  };
  let total = 0;
  let high = 0;
  const flagged = flagRows(rows, todaySet);
  for (const r of flagged) {
    total += 1;
    if (r.topPriority === "high") high += 1;
    for (const f of r.flags) byKey[f.key] += 1;
  }
  return { total, high, byKey };
}
