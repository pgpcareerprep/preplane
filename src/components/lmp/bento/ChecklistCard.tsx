import { useMemo, useState, useCallback, useEffect } from "react";
import { Check, MessageSquare, Paperclip, FileSpreadsheet, ChevronDown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChecklistNotes } from "@/lib/lmpExecutionEngine";
import { DocumentLinkModal, type DocumentLinkInput } from "./DocumentLinkModal";
import { ChecklistNotesModal } from "./ChecklistNotesModal";
import type { DocumentLink, DocumentAddContext } from "./DocumentsCard";
import { useLmpProcesses } from "@/lib/hooks/useDbData";
import { useLmpPermission } from "@/lib/hooks/usePermissions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EXECUTION_CHECKLIST_DEFS } from "@/lib/lmpChecklist";

type CheckItem = {
  id: string;
  label: string;
  owner?: string;
  done: boolean;
  sheetKey: string;
  note?: string;
};

const CHECKLIST_DEFS = EXECUTION_CHECKLIST_DEFS;

export type SheetChecklistValues = {
  mentorAligned?: boolean;
  prepDocShared?: boolean;
  assignmentReview?: boolean;
  mockDoneByPoc?: boolean;
};

export function ChecklistCard({
  lmpId,
  mode = "action",
  sheetValues,
  onToggle,
  documents,
  onAddDocuments,
  onUpdateDocument,
  onRemoveDocument,
}: {
  lmpId: string;
  mode?: "action" | "summary";
  sheetValues?: SheetChecklistValues;
  onToggle?: (sheetKey: string, newValue: boolean) => void;
  /** Full documents list for the LMP — pin state derives from this. */
  documents?: DocumentLink[];
  onAddDocuments?: (links: DocumentLinkInput[], ctx: DocumentAddContext) => void;
  onUpdateDocument?: (id: string, patch: DocumentLinkInput) => void;
  onRemoveDocument?: (id: string) => void;
}) {
  const { data: lmpRows = [] } = useLmpProcesses({ includeArchived: true });
  const permissionRow = (lmpRows as any[]).find(
    (row) => row.id === lmpId || row.lmp_code === lmpId,
  );
  const { canOperateLmp } = useLmpPermission({
    prep_poc: permissionRow?.prep_poc,
    support_poc: permissionRow?.support_poc,
    outreach_poc: permissionRow?.outreach_poc,
    prep_poc_id: permissionRow?.prep_poc_id,
    support_poc_id: permissionRow?.support_poc_id,
    outreach_poc_ids: permissionRow?.outreach_poc_ids,
  });
  const effectiveMode = mode === "summary" || !canOperateLmp ? "summary" : "action";
  // Local optimistic overrides keyed by sheetKey. Lets the tick visibly flip
  // on the very first click, independent of when the parent cache /
  // pendingChecklist round-trip lands. Each override is cleared once the
  // upstream sheetValues catches up to the same value.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOverrides((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const k of keys) {
        const upstream = !!(sheetValues as any)?.[k];
        if (upstream === prev[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [sheetValues]);

  const items = useMemo<CheckItem[]>(
    () =>
      CHECKLIST_DEFS.map((def) => ({
        ...def,
        done:
          def.sheetKey in overrides
            ? overrides[def.sheetKey]
            : !!(sheetValues as any)?.[def.sheetKey],
      })),
    [sheetValues, overrides],
  );

  const [notesModalFor, setNotesModalFor] = useState<{ id: string; label: string } | null>(null);
  const [linkModalFor, setLinkModalFor] = useState<{ id: string; label: string } | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(true);

  const linksByItem = useMemo(() => {
    const map = new Map<string, DocumentLink[]>();
    for (const d of documents ?? []) {
      if (d.source_type !== "execution_checklist" || !d.checklist_item_id) continue;
      const arr = map.get(d.checklist_item_id) ?? [];
      arr.push(d);
      map.set(d.checklist_item_id, arr);
    }
    return map;
  }, [documents]);

  const handleToggle = useCallback(
    (item: CheckItem) => {
      const next = !item.done;
      // Flip locally first so the checkbox updates in this same render.
      setOverrides((p) => ({ ...p, [item.sheetKey]: next }));
      onToggle?.(item.sheetKey, next);
    },
    [onToggle],
  );

  const linksEnabled = !!onAddDocuments;

  if (effectiveMode === "summary") {
    const done = items.filter((i) => i.done).length;
    const total = items.length;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return (
      <div className="rounded-2xl bg-n50/40 border border-n200 p-4">
        <button
          type="button"
          onClick={() => setSummaryExpanded((v) => !v)}
          className="w-full flex items-center justify-between mb-2 text-left"
          aria-expanded={summaryExpanded}
        >
          <h4 className="text-[13px] font-semibold text-n800">Execution Checklist</h4>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <FileSpreadsheet className="h-3 w-3 text-emerald-500" />
              <span className="text-[11px] text-n500 tabular-nums">{done} / {total}</span>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-n500 transition-transform", summaryExpanded && "rotate-180")} />
          </div>
        </button>
        <div className="h-1 rounded-full bg-n200/70 overflow-hidden mb-2">
          <div className="h-full bg-orange-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        {summaryExpanded && (
        <ul className="space-y-1">
          {items.map((it) => {
            const links = linksByItem.get(it.id) ?? [];
            return (
              <li key={it.id} className="flex items-center gap-2 py-1">
                <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", it.done ? "bg-emerald-500" : "bg-orange-500")} />
                <span className={cn("text-[12.5px] flex-1 truncate", it.done ? "text-n400 line-through" : "text-n800")}>
                  {it.label}
                </span>
                {it.owner && (
                  <span className="text-[10px] text-n500 bg-n100 rounded-full px-1.5 py-[1px]">{it.owner}</span>
                )}
                {links.length > 0 && (
                  <ChecklistLinksPopover links={links} count={links.length} />
                )}
              </li>
            );
          })}
        </ul>
        )}
      </div>
    );
  }

  return (
    <>
      <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-[13px] font-semibold text-n800">Execution Checklist</h4>
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-full px-2 py-[2px]">
            <FileSpreadsheet className="h-3 w-3" />
            Synced
          </span>
        </div>
        <ul className="space-y-1">
          {items.map((it) => (
            <ChecklistRow
              key={it.id}
              item={it}
              lmpId={lmpId}
              links={linksByItem.get(it.id) ?? []}
              linksEnabled={linksEnabled}
              onToggle={() => handleToggle(it)}
              onOpenNotes={() => setNotesModalFor({ id: it.id, label: it.label })}
              onOpenLinks={() => setLinkModalFor({ id: it.id, label: it.label })}
            />
          ))}
        </ul>
      </div>

      {notesModalFor && (
        <ChecklistNotesModal
          open={true}
          onOpenChange={(v) => !v && setNotesModalFor(null)}
          lmpId={lmpId}
          itemId={notesModalFor.id}
          itemLabel={notesModalFor.label}
        />
      )}

      {linkModalFor && (
        <DocumentLinkModal
          open={true}
          onOpenChange={(v) => !v && setLinkModalFor(null)}
          mode="execution_checklist"
          checklistItemLabel={linkModalFor.label}
          existingLinks={linksByItem.get(linkModalFor.id) ?? []}
          onSave={(links) =>
            onAddDocuments?.(links, {
              source_type: "execution_checklist",
              checklist_item_id: linkModalFor.id,
              checklist_item_label: linkModalFor.label,
            })
          }
          onUpdate={onUpdateDocument}
          onDelete={onRemoveDocument}
        />
      )}
    </>
  );
}

function ChecklistLinksPopover({ links, count }: { links: DocumentLink[]; count: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-0.5 text-orange-600 hover:text-orange-700 hover:bg-orange-50 rounded px-1 py-0.5 transition-colors"
          title={`${count} attached link${count > 1 ? "s" : ""}`}
          aria-label={`View ${count} attached link${count > 1 ? "s" : ""}`}
        >
          <Paperclip className="h-3 w-3" />
          {count > 1 && <span className="text-[10px] tabular-nums">{count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <p className="text-[11px] font-medium text-n700 mb-1.5 px-1">Attached links</p>
        <ul className="space-y-1 max-h-48 overflow-y-auto">
          {links.map((link) => (
            <li key={link.id}>
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12px] text-orange-600 hover:bg-orange-50 hover:text-orange-700 truncate"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                <span className="truncate">{link.label || link.url}</span>
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function ChecklistRow({
  item,
  lmpId,
  links,
  linksEnabled,
  onToggle,
  onOpenNotes,
  onOpenLinks,
}: {
  item: CheckItem;
  lmpId: string;
  links: DocumentLink[];
  linksEnabled: boolean;
  onToggle: () => void;
  onOpenNotes: () => void;
  onOpenLinks: () => void;
}) {
  const notes = useChecklistNotes(lmpId, item.id);
  const hasNotes = notes.length > 0;
  const filled = links.length > 0;

  return (
    <li className="group rounded-md px-1.5 py-1.5 hover:bg-n50 transition-colors">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "h-4 w-4 rounded-[4px] border flex items-center justify-center transition-colors shrink-0",
            item.done
              ? "bg-n900 border-n900 text-white"
              : "bg-card border-n300 hover:border-n500",
          )}
        >
          {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
        <span
          className={cn(
            "text-[12.5px] flex-1 truncate",
            item.done ? "text-n400 line-through" : "text-n800",
          )}
        >
          {item.label}
        </span>
        {item.owner && (
          <span className="text-[10px] text-n500 bg-n100 rounded-full px-1.5 py-[1px]">
            {item.owner}
          </span>
        )}
        <button
          type="button"
          onClick={onOpenNotes}
          className={cn(
            "h-6 inline-flex items-center gap-0.5 px-1 rounded-md transition-colors",
            hasNotes
              ? "text-orange-600 bg-orange-50 hover:bg-orange-100"
              : "h-6 w-6 justify-center text-n400 hover:text-n700 hover:bg-n100 opacity-0 group-hover:opacity-100",
          )}
          aria-label={hasNotes ? `View ${notes.length} note${notes.length > 1 ? "s" : ""}` : "Add note"}
          title={hasNotes ? `${notes.length} note${notes.length > 1 ? "s" : ""}` : "Add note"}
        >
          <MessageSquare className={cn("h-3 w-3", hasNotes && "fill-orange-500 stroke-orange-600")} />
          {hasNotes && notes.length > 1 && (
            <span className="text-[10px] font-semibold tabular-nums">{notes.length}</span>
          )}
        </button>
        {linksEnabled && (
          <button
            type="button"
            onClick={onOpenLinks}
            className={cn(
              "h-6 inline-flex items-center gap-0.5 px-1 rounded-md transition-colors",
              filled
                ? "text-orange-600 bg-orange-50 hover:bg-orange-100"
                : "h-6 w-6 justify-center text-n400 hover:text-n700 hover:bg-n100 opacity-0 group-hover:opacity-100",
            )}
            aria-label={
              filled
                ? `Manage ${links.length} attached link${links.length > 1 ? "s" : ""}`
                : "Attach link"
            }
            title={
              filled
                ? `${links.length} link${links.length > 1 ? "s" : ""} attached`
                : "Attach link"
            }
          >
            <Paperclip className="h-3 w-3" />
            {filled && links.length > 1 && (
              <span className="text-[10px] font-semibold tabular-nums">{links.length}</span>
            )}
          </button>
        )}
      </div>
    </li>
  );
}
