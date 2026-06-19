/** Human-readable labels for DB-backed dashboard filter values. */

export const STATUS_FILTER_LABELS: Record<string, string> = {
  "not-started": "Not Started",
  "prep-ongoing": "Prep Ongoing",
  "ongoing": "Prep Ongoing",
  "prep-done": "Prep Done",
  "offer-received": "Offer Received",
  "converted": "Converted",
  "hold": "On Hold",
  "on-hold": "On Hold",
  "not-converted": "Not Converted",
  "dormant": "Dormant",
  "closed": "Closed",
  "other-reasons": "Other Reasons",
  "converted-na": "Converted NA",
};

export function labelForStatusSlug(slug: string): string {
  const key = slug.trim().toLowerCase();
  return STATUS_FILTER_LABELS[key] ?? slug
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function labelForTypeRaw(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

const STATUS_SORT_ORDER = [
  "not-started",
  "prep-ongoing",
  "ongoing",
  "prep-done",
  "offer-received",
  "converted",
  "hold",
  "on-hold",
  "not-converted",
  "dormant",
  "closed",
  "other-reasons",
  "converted-na",
];

export function sortStatusSlugs(slugs: string[]): string[] {
  return [...slugs].sort((a, b) => {
    const ai = STATUS_SORT_ORDER.indexOf(a);
    const bi = STATUS_SORT_ORDER.indexOf(b);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return a.localeCompare(b);
  });
}
