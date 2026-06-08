export type DocumentLink = {
  id: string;
  label: string;
  url: string;
  source_type: "general_document" | "execution_checklist";
  checklist_item_id?: string;
  checklist_item_label?: string;
  created_at?: string;
  updated_at?: string;
};

export type DocumentAddContext =
  | { source_type: "general_document" }
  | {
      source_type: "execution_checklist";
      checklist_item_id: string;
      checklist_item_label: string;
    };

export type DocumentLinkInput = {
  label: string;
  url: string;
};

export function normalizeDocuments(docs: unknown): DocumentLink[] {
  if (!Array.isArray(docs)) return [];
  return docs
    .map((d: any, i: number): DocumentLink => ({
      id: d?.id ?? `legacy-${i}-${(d?.url ?? "").slice(0, 16)}`,
      label: String(d?.label ?? "Document"),
      url: String(d?.url ?? ""),
      source_type:
        d?.source_type === "execution_checklist"
          ? "execution_checklist"
          : "general_document",
      checklist_item_id: d?.checklist_item_id,
      checklist_item_label: d?.checklist_item_label,
      created_at: d?.created_at,
      updated_at: d?.updated_at,
    }))
    .filter((d) => d.url);
}
