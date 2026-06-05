import { useMemo, useState } from "react";
import { FileText, Plus, Link2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { DocumentLinkModal, type DocumentLinkInput } from "./DocumentLinkModal";

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
  | { source_type: "execution_checklist"; checklist_item_id: string; checklist_item_label: string };

/** Tolerate legacy `{ label, url }` rows by synthesizing missing fields. */
export function normalizeDocuments(docs: unknown): DocumentLink[] {
  if (!Array.isArray(docs)) return [];
  return docs
    .map((d: any, i: number): DocumentLink => ({
      id: d?.id ?? `legacy-${i}-${(d?.url ?? "").slice(0, 16)}`,
      label: String(d?.label ?? "Document"),
      url: String(d?.url ?? ""),
      source_type:
        d?.source_type === "execution_checklist" ? "execution_checklist" : "general_document",
      checklist_item_id: d?.checklist_item_id,
      checklist_item_label: d?.checklist_item_label,
      created_at: d?.created_at,
      updated_at: d?.updated_at,
    }))
    .filter((d) => d.url);
}

interface DocumentsCardProps {
  mode?: "action" | "summary";
  documents?: DocumentLink[];
  onAdd?: (links: DocumentLinkInput[], ctx: DocumentAddContext) => void;
  onUpdate?: (id: string, patch: DocumentLinkInput) => void;
  onRemove?: (id: string) => void;
}

export function DocumentsCard({
  mode = "action",
  documents = [],
  onAdd,
  onUpdate,
  onRemove,
}: DocumentsCardProps) {
  const isSummary = mode === "summary";
  const [addOpen, setAddOpen] = useState(false);
  // Manage modal state: which group/scope is being managed.
  const [manage, setManage] = useState<
    | { kind: "general" }
    | { kind: "checklist"; itemId: string; itemLabel: string }
    | null
  >(null);

  const normalized = useMemo(() => documents, [documents]);

  const general = useMemo(
    () => normalized.filter((d) => d.source_type === "general_document"),
    [normalized],
  );

  const checklistGroups = useMemo(() => {
    const groups = new Map<string, { itemId: string; itemLabel: string; links: DocumentLink[] }>();
    for (const d of normalized) {
      if (d.source_type !== "execution_checklist") continue;
      const key = d.checklist_item_id ?? "unknown";
      if (!groups.has(key)) {
        groups.set(key, {
          itemId: key,
          itemLabel: d.checklist_item_label ?? "Checklist item",
          links: [],
        });
      }
      groups.get(key)!.links.push(d);
    }
    return Array.from(groups.values());
  }, [normalized]);

  const isEmpty = general.length === 0 && checklistGroups.length === 0;

  const manageLinks = useMemo(() => {
    if (!manage) return [];
    if (manage.kind === "general") return general;
    return normalized.filter(
      (d) => d.source_type === "execution_checklist" && d.checklist_item_id === manage.itemId,
    );
  }, [manage, general, normalized]);

  return (
    <>
      <div className="rounded-2xl border border-n200 bg-card p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span className="text-[13px] font-semibold">Documents</span>
            {isSummary && (
              <span className="text-[11px] text-muted-foreground/60 ml-1">View only</span>
            )}
          </div>
          {!isSummary && (
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1 text-[12px] text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Link
            </button>
          )}
        </div>

        {isEmpty ? (
          <p className="text-[13px] italic text-muted-foreground/60">No documents added yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {general.length > 0 && (
              <Section
                title="General Documents"
                links={general}
                onOpenManage={isSummary ? undefined : () => setManage({ kind: "general" })}
              />
            )}
            {checklistGroups.map((g) => (
              <Section
                key={g.itemId}
                title={g.itemLabel}
                subtitle="Execution Checklist"
                links={g.links}
                onOpenManage={
                  isSummary
                    ? undefined
                    : () => setManage({ kind: "checklist", itemId: g.itemId, itemLabel: g.itemLabel })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Add modal — General */}
      {!isSummary && (
        <DocumentLinkModal
          open={addOpen}
          onOpenChange={setAddOpen}
          mode="general_document"
          existingLinks={general}
          onSave={(links) => onAdd?.(links, { source_type: "general_document" })}
        />
      )}

      {/* Manage modal — General or per checklist group */}
      {!isSummary && manage && (
        <DocumentLinkModal
          open={true}
          onOpenChange={(v) => !v && setManage(null)}
          mode={manage.kind === "general" ? "general_document" : "execution_checklist"}
          checklistItemLabel={manage.kind === "checklist" ? manage.itemLabel : undefined}
          existingLinks={manageLinks}
          onSave={(links) => {
            if (manage.kind === "general") {
              onAdd?.(links, { source_type: "general_document" });
            } else {
              onAdd?.(links, {
                source_type: "execution_checklist",
                checklist_item_id: manage.itemId,
                checklist_item_label: manage.itemLabel,
              });
            }
          }}
          onUpdate={onUpdate}
          onDelete={onRemove}
        />
      )}
    </>
  );
}

function Section({
  title,
  subtitle,
  links,
  onOpenManage,
}: {
  title: string;
  subtitle?: string;
  links: DocumentLink[];
  onOpenManage?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <h5 className="text-[12px] font-semibold text-n800">{title}</h5>
          {subtitle && (
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">{subtitle}</span>
          )}
        </div>
        {onOpenManage && (
          <button
            onClick={onOpenManage}
            className="text-[11px] text-primary hover:text-primary/80"
          >
            Manage
          </button>
        )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {links.map((doc) => (
          <li
            key={doc.id}
            className={cn(
              "group flex items-center gap-2 text-[13px] rounded-lg px-2 py-1 hover:bg-muted/40 transition-colors",
            )}
          >
            <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <a
              href={doc.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline truncate min-w-0"
            >
              <span className="truncate">{doc.label}</span>
              <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
