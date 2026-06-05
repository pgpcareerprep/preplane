import { useEffect, useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  type ChecklistNote,
  addChecklistNote,
  updateChecklistNote,
  deleteChecklistNote,
  useChecklistNotes,
} from "@/lib/lmpExecutionEngine";

function formatTs(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return "";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ChecklistNotesModal({
  open,
  onOpenChange,
  lmpId,
  itemId,
  itemLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lmpId: string;
  itemId: string;
  itemLabel: string;
}) {
  const notes = useChecklistNotes(lmpId, itemId);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setDraft("");
      setEditingId(null);
      setEditDraft("");
    }
  }, [open]);

  const onAdd = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      await addChecklistNote(lmpId, itemId, itemLabel, draft);
      setDraft("");
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (n: ChecklistNote) => {
    setEditingId(n.id);
    setEditDraft(n.text);
  };

  const saveEdit = async (n: ChecklistNote) => {
    if (!editDraft.trim() || busy) return;
    setBusy(true);
    try {
      await updateChecklistNote(lmpId, itemId, itemLabel, n.id, editDraft);
      setEditingId(null);
      setEditDraft("");
    } finally {
      setBusy(false);
    }
  };

  const removeNote = async (n: ChecklistNote) => {
    if (busy) return;
    if (!confirm("Delete this note?")) return;
    setBusy(true);
    try {
      await deleteChecklistNote(lmpId, itemId, itemLabel, n.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Notes · <span className="text-n600 font-normal">{itemLabel}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {notes.length === 0 && (
            <p className="text-[12.5px] text-n500 italic">
              No notes yet. Add the first one below.
            </p>
          )}
          {notes.map((n) => {
            const isEditing = editingId === n.id;
            return (
              <div
                key={n.id}
                className="rounded-lg border border-n200 bg-card p-3 group"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      rows={3}
                      autoFocus
                      className="text-[13px]"
                    />
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditDraft("");
                        }}
                        className="h-7 px-2 rounded-md text-[11px] text-n600 hover:bg-n100 inline-flex items-center gap-1"
                      >
                        <X className="h-3 w-3" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(n)}
                        disabled={!editDraft.trim() || editDraft.trim() === n.text || busy}
                        className={cn(
                          "h-7 px-2.5 rounded-md text-[11px] font-medium inline-flex items-center gap-1",
                          !editDraft.trim() || editDraft.trim() === n.text || busy
                            ? "bg-n200 text-n500 cursor-not-allowed"
                            : "bg-n900 text-white",
                        )}
                      >
                        <Check className="h-3 w-3" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-[13px] text-n800 whitespace-pre-wrap leading-relaxed">
                      {n.text}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="text-[10.5px] text-n400">
                        {n.author}
                        {formatTs(n.updated_at) && <> · {formatTs(n.updated_at)}</>}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => startEdit(n)}
                          className="h-6 w-6 rounded-md inline-flex items-center justify-center text-n500 hover:text-n800 hover:bg-n100"
                          aria-label="Edit note"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeNote(n)}
                          className="h-6 w-6 rounded-md inline-flex items-center justify-center text-n500 hover:text-red-600 hover:bg-red-50"
                          aria-label="Delete note"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-n200 pt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note…"
            rows={3}
            className="text-[13px]"
          />
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={onAdd}
              disabled={!draft.trim() || busy}
              className={cn(
                "h-8 px-3 rounded-md text-[12px] font-medium",
                !draft.trim() || busy
                  ? "bg-n200 text-n500 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600 text-white",
              )}
            >
              Add note
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
