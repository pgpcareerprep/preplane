/**
 * Canonical LMP domain types & configuration constants.
 * Production code should import from here — NOT from the lmp.ts / mentor.ts / processes.ts modules.
 *
 * The modules also re-export these for backward compatibility while seed data
 * is phased out.
 */

export type Candidate = {
  id: string;
  studentId?: string;
  name: string;
  initials: string;
  color: string;
  cohort: string;
  roundId: string; // "pool" or round.id
};

export type Round = { id: string; name: string; type: string };

export type RemarkEntry = {
  id: string;
  candidateId: string;
  pocName: string;
  pocInitials: string;
  pocColor: string;
  timestamp: string;
  fromRound?: string;
  toRound?: string;
  text: string;
};

/**
 * Standard interview pipeline used when an LMP has no custom rounds saved.
 * This is a real product default (every process needs R1/R2/R3 stages),
 * not mock data.
 */
export const DEFAULT_ROUNDS: Round[] = [
  { id: "r1", name: "R1", type: "" },
  { id: "r2", name: "R2", type: "" },
  { id: "r3", name: "R3", type: "" },
  { id: "converted", name: "Converted", type: "Offer" },
];

export const ROUND_TYPES = [
  "HR Screening", "Technical Round", "Case Study", "Behavioural",
  "Group Discussion", "Assignment", "Presentation", "Converted Round",
  "Offer", "Waitlisted", "Rejected",
];

/**
 * Canonical LMP process status values (keyed by STATUS_META in lmp.ts).
 *
 * The 7 active values mirror the source sheet's status dropdown. The trailing
 * legacy values are kept in the union so historical rows and a few cards that
 * still reference them keep type-checking; they are NOT shown in the dropdown
 * (see `STATUSES` below) and the normalizer collapses them onto the active set.
 */
export type LmpStatus =
  // Active (sheet) values:
  | "not-started"
  | "prep-ongoing"
  | "prep-done"
  | "hold"
  | "converted"
  | "not-converted"
  | "other-reasons"
  // Legacy values (still valid in the union for backwards compat):
  | "ongoing"
  | "dormant"
  | "closed"
  | "converted-na"
  | "offer-received";

/** Status options surfaced in dropdowns / filters — matches sheet exactly. */
export const STATUSES: LmpStatus[] = [
  "not-started",
  "prep-ongoing",
  "prep-done",
  "hold",
  "converted",
  "not-converted",
  "other-reasons",
];
