/**
 * Pure helpers for student participation, opted-out detection, and analytics.
 * All functions are side-effect-free and testable without DOM or Supabase.
 */

export const OPTED_OUT_STATUSES = new Set([
  // Spec-required exact values
  "opted out",
  "opt out",
  "opted-out",
  "opt-out",
  "placement opt out",
  "withdrawn",
  "not participating",
  "deferred",
  "defaulted",
  // Additional safe values kept from previous iteration
  "dropout",
  "drop out",
  "dropped out",
  "not interested",
]);

export function normalizePlacementStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

export function isOptedOutStatus(status: string | null | undefined): boolean {
  return OPTED_OUT_STATUSES.has(normalizePlacementStatus(status));
}

/** Stable identity key for a student roster entry. Prefers UUID id → email → name. */
export function getStudentIdentityKey(student: {
  id?: string | null;
  email?: string | null;
  name: string;
}): string {
  if (student.id) return `id:${student.id}`;
  const e = (student.email ?? "").trim().toLowerCase();
  if (e) return `email:${e}`;
  return `name:${student.name.trim().toLowerCase()}`;
}

/** Stable identity key for an lmp_candidate row. Prefers student_id → email → student_name. */
export function getCandidateIdentityKey(candidate: {
  studentId?: string | null;
  email?: string | null;
  studentName: string;
}): string {
  if (candidate.studentId) return `id:${candidate.studentId}`;
  const e = (candidate.email ?? "").trim().toLowerCase();
  if (e) return `email:${e}`;
  return `name:${candidate.studentName.trim().toLowerCase()}`;
}

/** 11-column domain preference vs placement outcome row. */
export type DomainPreferenceRow = {
  domain: string;
  primaryInterested: number;
  primaryConverted: number;
  primaryFulfilledPct: number | null;
  secondaryInterested: number;
  secondaryConverted: number;
  secondaryFulfilledPct: number | null;
  totalUniqueInterested: number;
  currentlyInDomainProcess: number;
  totalConverted: number;
  interestToPlacementPct: number | null;
};

/** POC lens row — one row per POC × role combination. */
export type PocMovementRow = {
  pocKey: string;
  pocName: string;
  role: string;
  activeLmps: number;
  uniqueStudents: number;
  r1: number;
  r2: number;
  r3: number;
  offers: number;
  converted: number;
  convPct: number | null;
};
