import { useEffect, useMemo, useState } from "react";
import { Link2, Plus, Trash2, ExternalLink, Pencil, Check, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { DocumentLink } from "./DocumentsCard";

export type DocumentLinkInput = { label: string; url: string };

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: "general_document" | "execution_checklist";
  checklistItemLabel?: string;
  /** When present and non-empty, modal opens in "manage" view. */
  existingLinks?: DocumentLink[];
  onSave: (links: DocumentLinkInput[]) => void;
  onUpdate?: (id: string, patch: DocumentLinkInput) => void;
  onDelete?: (id: string) => void;
};

function isValidUrl(v: string): boolean {
  try {
    new URL(v.trim());
    return true;
  } catch {
    return false;
  }
}

type Draft = { label: string; url: string; error?: string };

export function DocumentLinkModal({
  open,
  onOpenChange,
  mode,
  checklistItemLabel,
  existingLinks,
  onSave,
  onUpdate,
  onDelete,
}: Props) {
  const hasExisting = !!existingLinks && existingLinks.length > 0;
  const [drafts, setDrafts] = useState<Draft[]>([{ label: "", url: "" }]);
  const [showAdder, setShowAdder] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>({ label: "", url: "" });

  // Reset on open
  useEffect(() => {
    if (open) {
      setDrafts([{ label: "", url: "" }]);
      setShowAdder(false);
      setEditingId(null);
      setEditDraft({ label: "", url: "" });
    }
  }, [open]);

  const existingUrls = useMemo(
    () => new Set((existingLinks ?? []).map((d) => d.url.trim().toLowerCase())),
    [existingLinks],
  );

  const validateDrafts = (rows: Draft[]): Draft[] => {
    const seen = new Set<string>();
    return rows.map((r) => {
      const url = r.url.trim();
      const label = r.label.trim();
      if (!label) return { ...r, error: "Label required" };
      if (!url) return { ...r, error: "URL required" };
      if (!isValidUrl(url)) return { ...r, error: "Invalid URL" };
      const key = url.toLowerCase();
      if (seen.has(key) || existingUrls.has(key)) return { ...r, error: "Duplicate URL" };
      seen.add(key);
      return { ...r, error: undefined };
    });
  };

  const canSaveAdd = drafts.length > 0 && drafts.every((r) => r.label.trim() && r.url.trim() && isValidUrl(r.url.trim())) && (() => {
    const seen = new Set<string>();
    for (const r of drafts) {
      const k = r.url.trim().toLowerCase();
      if (seen.has(k) || existingUrls.has(k)) return false;
      seen.add(k);
    }
    return true;
  })();

  const handleAddRow = () => setDrafts((d) => [...d, { label: "", url: "" }]);
  const handleRemoveRow = (i: number) =>
    setDrafts((d) => (d.length === 1 ? [{ label: "", url: "" }] : d.filter((_, idx) => idx !== i)));
  const handleChange = (i: number, patch: Partial<Draft>) =>
    setDrafts((d) => d.map((r, idx) => (idx === i ? { ...r, ...patch, error: undefined } : r)));

  const handleSaveNew = () => {
    const validated = validateDrafts(drafts);
    if (validated.some((r) => r.error)) {
      setDrafts(validated);
      return;
    }
    onSave(validated.map((r) => ({ label: r.label.trim(), url: r.url.trim() })));
    onOpenChange(false);
  };

  const title = mode === "execution_checklist"
    ? hasExisting
      ? `Attached Links — ${checklistItemLabel ?? "Checklist item"}`
      : `Attach Link — ${checklistItemLabel ?? "Checklist item"}`
    : "Add Document Link";

  // ────────── MANAGE VIEW ──────────
  if (hasExisting && !showAdder) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" />
              {title}
            </DialogTitle>
          </DialogHeader>

          <ul className="flex flex-col gap-2 py-2 max-h-[60vh] overflow-y-auto">
            {existingLinks!.map((link) => {
              const isEditing = editingId === link.id;
              return (
                <li
                  key={link.id}
                  className="rounded-lg border border-n200 p-3 flex flex-col gap-2"
                >
                  {isEditing ? (
                    <>
                      <input
                        value={editDraft.label}
                        onChange={(e) => setEditDraft((d) => ({ ...d, label: e.target.value, error: undefined }))}
                        placeholder="Label"
                        className="rounded-md border border-n200 px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                      />
                      <input
                        value={editDraft.url}
                        onChange={(e) => setEditDraft((d) => ({ ...d, url: e.target.value, error: undefined }))}
                        placeholder="https://..."
                        className="rounded-md border border-n200 px-2 py-1.5 text-[13px] outline-none focus:border-primary"
                      />
                      {editDraft.error && (
                        <span className="text-[11px] text-destructive">{editDraft.error}</span>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setEditingId(null)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-muted-foreground hover:bg-muted/40"
                        >
                          <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                        <button
                          onClick={() => {
                            const label = editDraft.label.trim();
                            const url = editDraft.url.trim();
                            if (!label) return setEditDraft((d) => ({ ...d, error: "Label required" }));
                            if (!url || !isValidUrl(url)) return setEditDraft((d) => ({ ...d, error: "Invalid URL" }));
                            const dupe = (existingLinks ?? []).some(
                              (l) => l.id !== link.id && l.url.trim().toLowerCase() === url.toLowerCase(),
                            );
                            if (dupe) return setEditDraft((d) => ({ ...d, error: "Duplicate URL" }));
                            onUpdate?.(link.id, { label, url });
                            setEditingId(null);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          <Check className="h-3.5 w-3.5" /> Save
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-start gap-2">
                        <Link2 className="h-3.5 w-3.5 mt-1 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="text-[13px] font-medium text-n800 truncate">{link.label}</div>
                          <div className="text-[11.5px] text-muted-foreground truncate">{link.url}</div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-1">
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-primary hover:bg-primary/10"
                        >
                          <ExternalLink className="h-3.5 w-3.5" /> Open
                        </a>
                        <button
                          onClick={() => {
                            setEditingId(link.id);
                            setEditDraft({ label: link.label, url: link.url });
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-n700 hover:bg-muted/40"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={() => onDelete?.(link.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[12px] text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-lg border border-n200 px-4 py-2 text-[13px] hover:bg-muted/40"
            >
              Close
            </button>
            <button
              onClick={() => setShowAdder(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" /> Add another link
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ────────── ADD VIEW ──────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2 max-h-[60vh] overflow-y-auto">
          {drafts.map((row, i) => (
            <div key={i} className="rounded-lg border border-n200 p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  Link {i + 1}
                </span>
                {drafts.length > 1 && (
                  <button
                    onClick={() => handleRemoveRow(i)}
                    className="text-destructive hover:text-destructive/80"
                    aria-label="Remove row"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <input
                value={row.label}
                onChange={(e) => handleChange(i, { label: e.target.value })}
                placeholder="Label (e.g. Prep Guide)"
                className="rounded-md border border-n200 px-2 py-1.5 text-[13px] outline-none focus:border-primary"
              />
              <input
                value={row.url}
                onChange={(e) => handleChange(i, { url: e.target.value })}
                placeholder="https://..."
                className={cn(
                  "rounded-md border px-2 py-1.5 text-[13px] outline-none focus:border-primary",
                  row.error ? "border-destructive" : "border-n200",
                )}
              />
              {row.error && (
                <span className="text-[11px] text-destructive">{row.error}</span>
              )}
            </div>
          ))}

          <button
            onClick={handleAddRow}
            className="self-start inline-flex items-center gap-1 text-[12px] text-primary hover:text-primary/80"
          >
            <Plus className="h-3.5 w-3.5" /> Add another link
          </button>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button
            onClick={() => (hasExisting ? setShowAdder(false) : onOpenChange(false))}
            className="rounded-lg border border-n200 px-4 py-2 text-[13px] hover:bg-muted/40"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveNew}
            disabled={!canSaveAdd}
            className="rounded-lg bg-primary px-4 py-2 text-[13px] text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save {drafts.length > 1 ? `${drafts.length} links` : "link"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
