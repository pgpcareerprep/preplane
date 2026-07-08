/**
 * Pure helpers for student participation, opted-out detection, and analytics.
 * All functions are side-effect-free and testable without DOM or Supabase.
 */

import { resolveStageToRoundId } from "@/lib/pipelineStage";
import { normalizeConvertedName } from "@/lib/convertedStudentNames";

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
  return `name:${(student.name ?? "").trim().toLowerCase()}`;
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
  return `name:${(candidate.studentName ?? "").trim().toLowerCase()}`;
}

/** True when the candidate is in the LMP pipeline Converted column. */
export function isCandidatePipelineConverted(candidate: {
  pipelineStage?: string | null;
  pipeline_stage?: string | null;
} | null | undefined): boolean {
  if (!candidate) return false;
  const stage = candidate.pipelineStage ?? candidate.pipeline_stage ?? null;
  return resolveStageToRoundId(stage) === "converted";
}

/**
 * Canonical identity for deduping the same student across candidate rows and name fields.
 * Prefers student_id → email → normalized name.
 */
export function getCanonicalStudentIdentity(
  candidate: { studentId?: string | null; email?: string | null; studentName: string },
  student?: { id?: string | null; email?: string | null; name: string } | null,
): string {
  if (candidate.studentId) return `id:${candidate.studentId}`;
  if (student?.id) return `id:${student.id}`;
  const email = (student?.email ?? candidate.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const name = normalizeConvertedName(student?.name ?? candidate.studentName);
  if (name) return `name:${name}`;
  return getCandidateIdentityKey(candidate);
}

/** Normalized display name key for domain-level placed/opted comparisons. */
export function placedStudentNameKey(
  candidate: { studentId?: string | null; email?: string | null; studentName: string },
  student?: { id?: string | null; email?: string | null; name: string } | null,
): string {
  const rosterKey = getCandidateIdentityKey(candidate);
  const resolved =
    student ??
    (candidate.studentId ? { id: candidate.studentId, email: candidate.email, name: candidate.studentName } : null);
  const name = resolved?.name || candidate.studentName;
  return normalizeConvertedName(name);
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
