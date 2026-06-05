import { useState } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function RemarksPopover({
  open, candidateName, fromRound, toRound, onCancel, onConfirm,
}: {
  open: boolean;
  candidateName: string;
  fromRound: string;
  toRound: string;
  onCancel: () => void;
  onConfirm: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState(false);
  const len = text.length;
  const valid = text.trim().length >= 10;
  const pct = Math.min(len / 500, 1);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { /* non-dismissable */ } }}>
      <DialogContent
        className="max-w-[360px] p-5 rounded-2xl shadow-xl border-n200"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.22 }}>
          <div className="text-[13px] text-n600">
            Moving: <span className="font-semibold text-n900">{candidateName}</span>
          </div>
          <div className="mt-1 text-[12px] text-n500">
            <span className="font-medium">{fromRound}</span> → <span className="font-medium text-orange-600">{toRound}</span>
          </div>

          <div className="mt-3">
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value.slice(0, 500)); setError(false); }}
              placeholder="Why are you moving this candidate? (min 10 chars)"
              className={cn(
                "w-full min-h-[100px] rounded-[10px] border bg-card px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none",
                error ? "border-coral-400" : "border-n300 focus:border-orange-400",
              )}
            />
            <div className="mt-1 flex items-center justify-between">
              {error ? (
                <span className="text-[11px] text-coral-600 font-medium">Minimum 10 characters required</span>
              ) : <span />}
              <div className="flex items-center gap-2">
                <div className="relative h-4 w-4">
                  <svg viewBox="0 0 16 16" className="h-4 w-4 -rotate-90">
                    <circle cx="8" cy="8" r="6" fill="none" stroke="hsl(var(--n200))" strokeWidth="2" />
                    <circle
                      cx="8" cy="8" r="6" fill="none" stroke="hsl(var(--orange-500))" strokeWidth="2"
                      strokeDasharray={`${pct * 37.7} 37.7`} strokeLinecap="round"
                    />
                  </svg>
                </div>
                <span className="text-[11px] text-n400 tabular-nums">{len} / 500</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button onClick={() => { setText(""); onCancel(); }} className="text-[13px] text-n500 hover:text-n800 px-3 py-2">
              ✕ Cancel
            </button>
            <button
              onClick={() => { if (!valid) { setError(true); return; } onConfirm(text.trim()); setText(""); }}
              className={cn(
                "rounded-md text-[13px] font-medium px-4 py-2 transition-colors",
                valid ? "bg-orange-500 hover:bg-orange-600 text-white" : "bg-n100 text-n400 cursor-not-allowed",
              )}
            >
              Confirm Move →
            </button>
          </div>
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}