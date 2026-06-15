import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useOutreachFeedback, useAddOutreachFeedback } from "@/lib/hooks/useOutreachFeedback";
import { toast } from "sonner";

interface OutreachFeedbackHistoryModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lmpId: string;
}

export function OutreachFeedbackHistoryModal({
  open,
  onOpenChange,
  lmpId,
}: OutreachFeedbackHistoryModalProps) {
  const { data: entries = [], isLoading } = useOutreachFeedback(open ? lmpId : null);
  const { mutate, isPending } = useAddOutreachFeedback();
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);

  const handleAdd = () => {
    if (!draft.trim()) return;
    mutate(
      { lmpId, feedback: draft.trim() },
      {
        onSuccess: () => {
          toast.success("Feedback added");
          setDraft("");
          setAdding(false);
        },
        onError: (e: any) => toast.error(e?.message || "Failed to add feedback"),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Outreach Feedback History</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-3 py-2 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-n400" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-n400 text-center py-8">No outreach feedback added yet.</p>
          ) : (
            entries.map((entry) => (
              <div
                key={entry.id}
                className="rounded-lg border border-n200 bg-n50 p-3 space-y-1"
              >
                <p className="text-[13px] text-n800 whitespace-pre-wrap">{entry.feedback}</p>
                <div className="flex items-center gap-2 text-[11px] text-n400">
                  <span>{entry.created_by_name || "Unknown"}</span>
                  <span>·</span>
                  <span>
                    {new Date(entry.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}{" "}
                    {new Date(entry.created_at).toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {adding ? (
          <div className="border-t border-n100 pt-3 space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Add feedback received from outreach team..."
              rows={3}
              className="resize-none text-[13px]"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAdding(false); setDraft(""); }}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={isPending || !draft.trim()}
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="border-t border-n100 pt-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1.5"
              onClick={() => setAdding(true)}
            >
              <MessageSquarePlus className="h-3.5 w-3.5" /> Add Feedback
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
