/** Canonical Next Progress Type values — must match Google Sheet column M validation exactly. */

export const NEXT_PROGRESS_TYPES = [
  "Follow - Up",
  "Interview",
  "Feedback",
  "Mentor Session",
  "Moved to next round",
  "Other",
] as const;

export type NextProgressType = (typeof NEXT_PROGRESS_TYPES)[number];

const LEGACY_FOLLOW_UP = new Set(["follow-up", "follow up"]);

function normKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normalize stored/UI values. Blank in → blank out. Legacy spellings → canonical list value. */
export function normalizeNextProgressType(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (NEXT_PROGRESS_TYPES.includes(s as NextProgressType)) return s;
  const key = normKey(s);
  if (LEGACY_FOLLOW_UP.has(key)) return "Follow - Up";
  if (key === "movement" || key === "moved to next round") return "Moved to next round";
  return s;
}

/** Value safe to write to Google Sheet column M (blank allowed). */
export function normalizeNextProgressTypeForSheet(raw?: string | null): string {
  const normalized = normalizeNextProgressType(raw);
  if (!normalized) return "";
  if (NEXT_PROGRESS_TYPES.includes(normalized as NextProgressType)) return normalized;
  return normalized;
}

export function isValidNextProgressType(raw?: string | null): boolean {
  const s = String(raw ?? "").trim();
  if (!s) return true;
  return NEXT_PROGRESS_TYPES.includes(normalizeNextProgressType(raw) as NextProgressType);
}
