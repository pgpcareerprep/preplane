import type { DocumentLink } from "@/components/lmp/bento/DocumentsCard";

/** Checklist item id used for "Prep doc shared" attachments (see ChecklistCard CHECKLIST_DEFS). */
export const PREP_DOC_CHECKLIST_ID = "ck-prepdoc";

/**
 * Resolve which URL should mirror into `lmp_processes.prep_doc_link`
 * (sheet column S — "Prep Doc Link"). Picks the most recently touched
 * execution_checklist entry attached to the Prep doc shared item.
 * Returns null when no such link exists, which clears col S.
 */
export function derivePrepDocLink(docs: DocumentLink[]): string | null {
  const prep = docs.filter(
    (d) =>
      d.source_type === "execution_checklist" &&
      d.checklist_item_id === PREP_DOC_CHECKLIST_ID &&
      d.url,
  );
  if (prep.length === 0) return null;
  const sorted = [...prep].sort((a, b) => {
    const ta = a.updated_at ?? a.created_at ?? "";
    const tb = b.updated_at ?? b.created_at ?? "";
    return tb.localeCompare(ta);
  });
  return sorted[0].url || null;
}

/** True when a DocumentLink belongs to the Prep doc shared checklist scope. */
export function isPrepDocLink(d: DocumentLink): boolean {
  return (
    d.source_type === "execution_checklist" &&
    d.checklist_item_id === PREP_DOC_CHECKLIST_ID
  );
}
