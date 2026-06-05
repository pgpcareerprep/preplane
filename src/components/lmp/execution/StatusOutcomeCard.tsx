import { useState } from "react";
import { cn } from "@/lib/utils";
import { StatusDropdown } from "../StatusDropdown";
import type { LmpStatus } from "@/lib/lmpTypes";

type Outcome = "ongoing" | "converted" | "not-converted";

const OUTCOMES: { id: Outcome; label: string; cls: string }[] = [
  { id: "ongoing",       label: "Ongoing",       cls: "bg-orange-50 text-orange-700 border-orange-200" },
  { id: "converted",     label: "Converted",     cls: "bg-sage-50 text-sage-700 border-sage-200" },
  { id: "not-converted", label: "Not Converted", cls: "bg-coral-50 text-coral-700 border-coral-200" },
];

export function StatusOutcomeCard({
  status, onChangeStatus,
}: {
  status: LmpStatus;
  onChangeStatus: (s: LmpStatus) => void;
}) {
  const [outcome, setOutcome] = useState<Outcome>("ongoing");
  const [closingDate, setClosingDate] = useState<string>("");

  return (
    <div className="rounded-2xl bg-card border border-n200 shadow-sm p-5">
      <h4 className="text-[14px] font-semibold text-n900 mb-3">Status & Outcome</h4>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
            Current Status
          </div>
          <StatusDropdown value={status} onChange={onChangeStatus} size="md" />
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
            Converted Outcome
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOutcome(o.id)}
                className={cn(
                  "h-7 px-2.5 rounded-full border text-[11.5px] font-medium transition-colors",
                  outcome === o.id
                    ? o.cls
                    : "bg-card border-n200 text-n600 hover:border-n300",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
            Closing Date
          </div>
          <input
            type="date"
            value={closingDate}
            onChange={(e) => setClosingDate(e.target.value)}
            className="h-8 w-full rounded-md border border-n200 bg-card px-2 text-[12.5px] text-n800 focus:outline-none focus:border-orange-300"
          />
        </div>
      </div>
    </div>
  );
}