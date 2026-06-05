import { useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Candidate, RemarkEntry } from "@/lib/lmpProcessMutations";

export function RemarksDrawer({
  candidate, remarks, currentRound, open, onOpenChange, onAddNote,
}: {
  candidate: Candidate | null;
  remarks: RemarkEntry[];
  currentRound: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAddNote: (text: string) => void;
}) {
  const [note, setNote] = useState("");
  if (!candidate) return null;
  const items = remarks.filter((r) => r.candidateId === candidate.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:max-w-[400px] p-0 flex flex-col">
        <div className="px-5 pt-5 pb-3 border-b border-n200">
          <div className="flex items-center gap-3">
            <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold", candidate.color)}>
              {candidate.initials}
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-n900 truncate">{candidate.name} — Progress History</div>
              <div className="text-[12px] text-n500 truncate">{candidate.cohort} · Current Round: {currentRound}</div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {items.length === 0 && (
            <p className="text-[13px] text-n500 italic">No remarks yet.</p>
          )}
          {items.map((r) => (
            <div key={r.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-semibold", r.pocColor)}>
                  {r.pocInitials}
                </div>
                <div className="text-[13px] font-medium text-n800">{r.pocName}</div>
                <div className="ml-auto text-[11px] text-n400 tabular-nums">{r.timestamp}</div>
              </div>
              <div>
                {r.fromRound && r.toRound ? (
                  <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 text-orange-600 px-2 py-0.5 text-[10px] uppercase tracking-[0.5px] font-medium">
                    {r.fromRound} → {r.toRound}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n600 px-2 py-0.5 text-[10px] uppercase tracking-[0.5px] font-medium">
                    Note
                  </span>
                )}
              </div>
              <p className="text-[14px] text-n700 leading-[1.6]">{r.text}</p>
              <div className="h-px bg-n100" />
            </div>
          ))}
        </div>

        <div className="border-t border-n200 p-4 space-y-2">
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note (no round change)"
            className="w-full min-h-[80px] rounded-[10px] border border-n300 bg-card px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:border-orange-400"
          />
          <button
            disabled={note.trim().length < 3}
            onClick={() => { onAddNote(note.trim()); setNote(""); }}
            className={cn(
              "w-full rounded-md text-[13px] font-medium py-2 transition-colors",
              note.trim().length >= 3
                ? "bg-orange-500 hover:bg-orange-600 text-white"
                : "bg-n100 text-n400 cursor-not-allowed",
            )}
          >
            Post Note
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}