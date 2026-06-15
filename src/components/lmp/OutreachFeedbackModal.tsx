import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAddOutreachFeedback } from "@/lib/hooks/useOutreachFeedback";
import { toast } from "sonner";

interface OutreachFeedbackModalProps {
  open: boolean;
  lmpId: string;
  onClose: () => void;
}

export function OutreachFeedbackModal({ open, lmpId, onClose }: OutreachFeedbackModalProps) {
  const [feedback, setFeedback] = useState("");
  const { mutate, isPending } = useAddOutreachFeedback();

  const handleSave = () => {
    if (!feedback.trim()) return;
    mutate(
      { lmpId, feedback: feedback.trim() },
      {
        onSuccess: () => {
          toast.success("Outreach feedback saved");
          setFeedback("");
          onClose();
        },
        onError: (e: any) => toast.error(e?.message || "Failed to save feedback"),
      },
    );
  };

  const handleSkip = () => {
    setFeedback("");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleSkip(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Outreach Feedback</DialogTitle>
        </DialogHeader>
        <Textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Add feedback received from outreach team..."
          rows={4}
          className="resize-none"
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleSkip} disabled={isPending}>
            Skip
          </Button>
          <Button onClick={handleSave} disabled={isPending || !feedback.trim()}>
            {isPending ? "Saving…" : "Save Feedback"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
