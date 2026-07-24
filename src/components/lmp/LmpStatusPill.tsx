import { cn } from "@/lib/utils";
import { STATUS_META, STATUSES, type LmpStatus } from "@/lib/lmpTypes";
import { canonicalLmpStatus } from "@/types/lmp";

/** Map common display labels (and aliases) → canonical slug. */
const LABEL_TO_SLUG: Record<string, LmpStatus> = {
  ...Object.fromEntries(STATUSES.map((s) => [STATUS_META[s].label.toLowerCase(), s])),
  "on hold": "hold",
  ongoing: "prep-ongoing",
  "offer received": "converted",
  dormant: "other-reasons",
  closed: "other-reasons",
  "other reasons": "other-reasons",
};

/** Resolve a display label or DB/filter slug to a canonical LmpStatus. */
export function resolveLmpStatusSlug(raw?: string | null): LmpStatus | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed in STATUS_META) return canonicalLmpStatus(trimmed as LmpStatus);
  const lower = trimmed.toLowerCase();
  if (lower in LABEL_TO_SLUG) return LABEL_TO_SLUG[lower];
  const kebab = lower.replace(/[\s_]+/g, "-");
  if (kebab in STATUS_META) return canonicalLmpStatus(kebab as LmpStatus);
  return null;
}

/**
 * Lumina status pill — uses `.pill` + `STATUS_META[].pill` (same as LMP board / StickyHeader).
 * Pass either a display label (`status`) or a slug (`slug`); slug wins when both are set.
 */
export function LmpStatusPill({
  status,
  slug,
  className,
}: {
  status?: string | null;
  slug?: string | null;
  className?: string;
}) {
  const resolved = resolveLmpStatusSlug(slug || status);
  if (!resolved) {
    return (
      <span className={cn("pill", "pill-not-started", className)}>
        {status?.trim() || "—"}
      </span>
    );
  }
  const meta = STATUS_META[resolved];
  return <span className={cn("pill", meta.pill, className)}>{meta.label}</span>;
}
