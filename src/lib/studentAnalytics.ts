/**
 * Pure helpers for student participation, opted-out detection, and analytics.
 * All functions are side-effect-free and testable without DOM or Supabase.
 */

export const OPTED_OUT_STATUSES = new Set([
  "opted out",
  "opt out",
  "opted-out",
  "opt-out",
  "withdrawn",
  "dropout",
  "drop out",
  "dropped out",
  "not interested",
  "deferred",
]);

export function normalizePlacementStatus(status: string | null | undefined): string {
  return (status ?? "").trim().toLowerCase();
}

export function isOptedOutStatus(status: string | null | undefined): boolean {
  return OPTED_OUT_STATUSES.has(normalizePlacementStatus(status));
}

/** Stable identity key — prefers UUID id, then email, then name as last resort. */
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

export type DomainPreferenceRow = {
  domain: string;
  primaryPref: number;
  secondaryPref: number;
  totalInterested: number;
  eligible: number;
  inProcess: number;
  converted: number;
};

export type PocMovementRow = {
  pocId: string;
  pocName: string;
  activeLmps: number;
  shortlisted: number;
  advancedRounds: number;
  offers: number;
  converted: number;
  convPct: number | null;
};
