import type { ConfirmationCardBlock } from "@/lib/copilotBlocks";

const BAD_LITERALS = new Set(["undefined", "null", "nan"]);

/** Drop empty, nullish, or literal "undefined"/"null" display segments. */
export function sanitizeDisplaySegment(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s || BAD_LITERALS.has(s.toLowerCase())) return null;
  return s;
}

export function joinDisplaySegments(segments: unknown[], sep = " · "): string {
  const parts = segments.map(sanitizeDisplaySegment).filter((p): p is string => Boolean(p));
  return parts.join(sep);
}

/** Remove literal undefined/null segments from free text (e.g. "Acme – undefined"). */
export function scrubLabelText(text: unknown): string {
  const raw = sanitizeDisplaySegment(text);
  if (!raw) return "";
  return raw
    .replace(/\s*[–·|]\s*(undefined|null)\b/gi, "")
    .replace(/\b(undefined|null)\s*[–·|]\s*/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function sanitizeConfirmationCardBlock(
  block: ConfirmationCardBlock,
): ConfirmationCardBlock | null {
  const title = scrubLabelText(block.title) || "Confirm change";
  const description = scrubLabelText(block.description);
  if (!description) return null;

  const changes = (block.changes ?? [])
    .map((c) => {
      const field = sanitizeDisplaySegment(c.field);
      const to = sanitizeDisplaySegment(c.to);
      const from = sanitizeDisplaySegment(c.from);
      if (!field || to === null) return null;
      return {
        field,
        ...(from ? { from } : {}),
        to,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  return {
    ...block,
    title,
    description,
    changes: changes.length ? changes : undefined,
    sync_impact: scrubLabelText(block.sync_impact) || block.sync_impact,
  };
}

export function sanitizePendingActionSummary(summary: unknown): string {
  return scrubLabelText(summary) || "Confirm this change";
}
