/** Canonical Next Progress Type values — must match Google Sheet column M validation exactly. */

export const NEXT_PROGRESS_TYPES = [
  "Follow - Up",
  "Interview",
  "Feedback",
  "Mentor Session",
  "Moved to next round",
  "Other",
] as const;

const LEGACY_FOLLOW_UP = new Set(["follow-up", "follow up", "follow-up"]);

function normKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeNextProgressType(raw?: string | null): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if ((NEXT_PROGRESS_TYPES as readonly string[]).includes(s)) return s;
  const key = normKey(s);
  if (LEGACY_FOLLOW_UP.has(key)) return "Follow - Up";
  if (key === "movement" || key === "moved to next round") return "Moved to next round";
  return s;
}

export function normalizeNextProgressTypeForSheet(raw?: string | null): string {
  const normalized = normalizeNextProgressType(raw);
  if (!normalized) return "";
  if ((NEXT_PROGRESS_TYPES as readonly string[]).includes(normalized)) return normalized;
  return normalized;
}
