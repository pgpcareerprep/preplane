/** Canonical list of LMP statuses considered "active" (not closed/cancelled). */
export const ACTIVE_LMP_STATUSES: string[] = [
  "ongoing",
  "not-started",
  "not_started",
  "Not Started",
  "Ongoing",
  // The LMP Tracker uses "prep-ongoing" for in-flight processes — count it as active.
  "prep-ongoing",
  "prep_ongoing",
  "prep ongoing",
  "Prep Ongoing",
];

export type LmpStatusNormalized =
  | "ongoing"
  | "not_started"
  | "prep_ongoing"
  | "closed"
  | "cancelled"
  | "converted"
  | "unknown";

/** Normalize a raw status string from the DB / sheet into a canonical token. */
export function normalizeLmpStatus(raw: string | null | undefined): LmpStatusNormalized {
  const s = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "ongoing") return "ongoing";
  if (s === "not_started") return "not_started";
  if (s === "prep_ongoing" || s === "prep_on_going") return "prep_ongoing";
  if (s === "converted" || s.startsWith("converted")) return "converted";
  if (s === "closed" || s === "done" || s === "completed") return "closed";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  return "unknown";
}

export function isActiveLmpStatus(raw: string | null | undefined): boolean {
  const n = normalizeLmpStatus(raw);
  return n === "ongoing" || n === "not_started" || n === "prep_ongoing";
}
