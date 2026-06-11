import type { DocumentLink } from "@/components/lmp/bento/DocumentsCard";

/** Checklist item id used for "Prep doc shared" attachments (see ChecklistCard CHECKLIST_DEFS). */
export const PREP_DOC_CHECKLIST_ID = "ck-prepdoc";

/**
 * Serialize ALL document links into `lmp_processes.prep_doc_link`
 * (sheet column S — "Prep Doc Link"). Returns all links formatted as
 * "Label: URL" per line (or just URL if label is missing/default), joined
 * by newline. Returns null when no links with URLs exist.
 */
export function derivePrepDocLink(docs: DocumentLink[]): string | null {
  const links = docs.filter((d) => d.url);
  if (links.length === 0) return null;
  return links
    .map((d) => {
      const label = d.label && d.label !== "Document" ? d.label.trim() : "";
      return label ? `${label}: ${d.url}` : d.url;
    })
    .join("\n");
}

/** True when a DocumentLink belongs to the Prep doc shared checklist scope. */
export function isPrepDocLink(d: DocumentLink): boolean {
  return (
    d.source_type === "execution_checklist" &&
    d.checklist_item_id === PREP_DOC_CHECKLIST_ID
  );
}
