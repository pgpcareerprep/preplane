/**
 * Pure derivation helpers for dashboard drill-downs.
 * Each helper returns the underlying Process[] / StudentRoster[] rows
 * behind a clickable metric so the LxDrillDown modal can list them.
 */
import type { Process, ProcessStatus } from "@/lib/lmpProcessQueries";
import { isConverted, isDormant } from "@/lib/lmpProcessQueries";
import { flagRows } from "@/lib/lmpFlags";
import type { LmpFlagKey } from "@/lib/lmpFlags";
import type { StudentDrillRow } from "@/components/insights/LxDrillDown";
import { isCandidatePipelineConverted, isOptedOutStatus } from "@/lib/studentAnalytics";

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/* ─────────── LMP filters ─────────── */
export function lmpsByStatus(rows: Process[], status: ProcessStatus): Process[] {
  return rows.filter((r) => r.status === status);
}

export function lmpsConverted(rows: Process[]): Process[] {
  return rows.filter(isConverted);
}

export function lmpsDormant(rows: Process[]): Process[] {
  return rows.filter(isDormant);
}

export function lmpsForPoc(
  rows: Process[],
  pocName: string,
  role: "prep" | "support" | "outreach" | "any" = "any",
): Process[] {
  const target = norm(pocName);
  if (!target) return [];
  return rows.filter((r) => {
    const prep = norm(r.prepPoc);
    const sup = norm(r.supportPoc);
    const out = norm(r.outreachPoc);
    if (role === "prep") return prep === target;
    if (role === "support") return sup === target;
    if (role === "outreach") return out === target;
    return prep === target || sup === target || out === target;
  });
}

export function lmpsForDomain(rows: Process[], domain: string): Process[] {
  const target = norm(domain);
  if (!target) return [];
  return rows.filter((r) => norm(r.domain) === target);
}

export function lmpsActive(rows: Process[]): Process[] {
  return rows.filter((r) => ["Ongoing", "Offer Received", "On Hold"].includes(r.status));
}

export function lmpsRisk(rows: Process[]): Process[] {
  return rows.filter((r) => r.status === "On Hold" || r.status === "Closed" || isDormant(r));
}

export function lmpsMissingPrepDoc(rows: Process[]): Process[] {
  return rows.filter((r) => r.prepDoc !== "Sent" && (r.status === "Ongoing" || r.status === "Offer Received"));
}

export type CandidatePipelineRow = {
  lmpId: string;
  pipelineStage?: string | null;
  pipeline_stage?: string | null;
};

export function buildConvertedCandidateCountByLmp(candidates: CandidatePipelineRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of candidates) {
    if (!isCandidatePipelineConverted(c)) continue;
    m.set(c.lmpId, (m.get(c.lmpId) ?? 0) + 1);
  }
  return m;
}

export function lmpsByFlag(
  rows: Process[],
  todaySet: Set<string>,
  key: LmpFlagKey,
  convertedCandidateCountByLmp?: Map<string, number>,
): Process[] {
  return flagRows(rows, todaySet, convertedCandidateCountByLmp)
    .filter((f) => f.flags.some((x) => x.key === key))
    .map((f) => f.process);
}

export function lmpsZeroCandidates(
  rows: Process[],
  candidateCountByLmp: Map<string, number>,
): Process[] {
  return rows.filter((r) => {
    if (!["Ongoing", "Offer Received", "On Hold"].includes(r.status)) return false;
    return (candidateCountByLmp.get(r.processId) ?? 0) === 0;
  });
}

export function countZeroCandidateLmps(
  rows: Process[],
  candidateCountByLmp: Map<string, number>,
): number {
  return lmpsZeroCandidates(rows, candidateCountByLmp).length;
}

/** Resolve a snapshot-strip key to a drill row set + human title. */
export function snapshotDrill(
  kind: "active" | "zero-candidates" | LmpFlagKey,
  rows: Process[],
  todaySet: Set<string>,
  candidateCountByLmp?: Map<string, number>,
  convertedCandidateCountByLmp?: Map<string, number>,
): { rows: Process[]; title: string } {
  if (kind === "active") return { rows: lmpsActive(rows), title: "Active LMPs" };
  if (kind === "zero-candidates") {
    const map = candidateCountByLmp ?? new Map<string, number>();
    return { rows: lmpsZeroCandidates(rows, map), title: "LMPs with zero candidates" };
  }
  const LABEL: Record<LmpFlagKey, string> = {
    "overdue":                "Overdue LMPs",
    "daily-progress-pending": "LMPs due for update today",
    "stale":                  "Stale LMPs",
    "not-started-stale-4d":   "Not Started LMPs not updated for 4+ days",
    "mentor-not-aligned":     "LMPs with mentor not aligned",
    "prep-doc-not-shared":    "LMPs where prep doc is not shared",
    "mock-pending":           "LMPs with mock pending",
    "converted-status-no-converted-candidate": "Converted LMPs with no converted candidate",
  };
  return {
    rows: lmpsByFlag(rows, todaySet, kind, convertedCandidateCountByLmp),
    title: LABEL[kind] ?? "LMPs",
  };
}

export function lmpsMentorPending(rows: Process[]): Process[] {
  return rows.filter((r) => r.mentorAligned !== "Yes" && (r.status === "Ongoing" || r.status === "Offer Received"));
}

export function lmpsByPlacementStep(
  rows: Process[],
  step: "selected" | "prep-sent" | "mentor-aligned" | "round-tracked" | "outcome-logged",
): { done: Process[]; pending: Process[] } {
  if (step === "selected") {
    return {
      done: rows.filter((r) => r.placementProgress !== "Not Started"),
      pending: rows.filter((r) => r.placementProgress === "Not Started"),
    };
  }
  if (step === "prep-sent") {
    return {
      done: rows.filter((r) => r.prepDoc === "Sent"),
      pending: rows.filter((r) => r.prepDoc !== "Sent"),
    };
  }
  if (step === "mentor-aligned") {
    return {
      done: rows.filter((r) => r.mentorAligned === "Yes"),
      pending: rows.filter((r) => r.mentorAligned !== "Yes"),
    };
  }
  if (step === "round-tracked") {
    const isTracked = (r: Process) =>
      ["R1", "R2", "R3", "Offer", "Converted"].includes(r.placementProgress);
    return { done: rows.filter(isTracked), pending: rows.filter((r) => !isTracked(r)) };
  }
  // outcome-logged
  const finished = rows.filter((r) => r.status === "Closed" || isConverted(r));
  return {
    done: finished.filter((r) => (r.status === "Closed" && !!r.closedReason) || (isConverted(r) && !!r.convertNames)),
    pending: finished.filter((r) => !((r.status === "Closed" && !!r.closedReason) || (isConverted(r) && !!r.convertNames))),
  };
}

/* ─────────── Allocator gap filters ─────────── */
export function lmpsRoundGap(rows: Process[]): Process[] {
  return rows.filter((r) => {
    const latest = r.r3Shortlisted ? "R3" : r.r2Shortlisted ? "R2" : r.r1Shortlisted ? "R1" : null;
    if (!latest) return false;
    return r.placementProgress !== latest && !["Offer", "Converted"].includes(r.placementProgress);
  });
}

export function lmpsUnloggedOutcomes(rows: Process[]): Process[] {
  return rows.filter((r) => {
    if (r.status === "Closed") return !r.closedReason;
    if (isConverted(r)) return !r.convertNames;
    return false;
  });
}

export function lmpsStatusMissing(rows: Process[]): Process[] {
  return rows.filter((r) => !r.status);
}

/* ─────────── Student filters ─────────── */
export type RosterRow = {
  id?: string | null;
  email?: string | null;
  name: string;
  cohort?: string;
  primaryDomain?: string;
  secondaryDomain?: string;
  rollNo?: string;
  studentCode?: string;
  phone?: string;
  lmpCount?: number;
  activeLmpCount?: number;
  placementStatus?: string | null;
};

export function studentsInBucket(
  roster: RosterRow[],
  opts: {
    cohort?: string;
    bucket?: "single" | "multiple" | "inactive" | "no-active" | "active" | "opted-out" | "eligible" | "all";
    domain?: string;
  } = {},
): StudentDrillRow[] {
  return roster.filter((s) => {
    if (opts.cohort && norm(s.cohort) !== norm(opts.cohort)) return false;
    if (opts.domain) {
      const d = norm(opts.domain);
      const pd = norm(s.primaryDomain);
      const sd = norm(s.secondaryDomain);
      if (pd !== d && sd !== d) return false;
    }
    const c = s.activeLmpCount ?? 0;
    const optedOut = isOptedOutStatus(s.placementStatus);
    if (opts.bucket === "opted-out") return optedOut;
    if (opts.bucket === "eligible") return !optedOut;
    // "inactive" and "no-active" both exclude opted-out students per spec
    if (opts.bucket === "inactive" || opts.bucket === "no-active") return c === 0 && !optedOut;
    if (opts.bucket === "single") return c === 1;
    if (opts.bucket === "multiple") return c >= 2;
    if (opts.bucket === "active") return c >= 1;
    return true;
  });
}

export function studentsByPrimaryDomain(roster: RosterRow[], domain: string): StudentDrillRow[] {
  return studentsInBucket(roster, { domain });
}
