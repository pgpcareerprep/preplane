import { AlertTriangle } from "lucide-react";
import { UNMAPPABLE_FIELDS } from "@/lib/sheets/useLiveProcesses";

const FIELD_LABELS: Record<string, string> = {
  offerOutcome: "Offer Outcome",
  mentorAligned: "Mentor Aligned",
  placementProgress: "Placement Progress",
  prepProgress: "Prep Progress %",
  closedReason: "Closed Reason",
  r1Names: "R1 - Names",
  r2Names: "R2 - Names",
  r3Names: "R3 - Names",
  finalConvertedNumbers: "Final Converted Numbers",
  finalConvertedNames: "Converted Names",
};

/**
 * Banner that highlights fields which cannot be accurately mapped
 * from the Google Sheet and are estimated/inferred.
 */
export function UnmappedFieldsBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 flex items-start gap-3">
      <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-amber-800">
          Some fields are estimated or unavailable from the sheet
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {UNMAPPABLE_FIELDS.map((f) => (
            <span
              key={f}
              className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[10.5px] font-medium border border-amber-200"
            >
              {FIELD_LABELS[f] || f}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-amber-600">
          These columns are either missing from the sheet or have no data. Values shown are inferred from Status and other available fields.
        </p>
      </div>
    </div>
  );
}
