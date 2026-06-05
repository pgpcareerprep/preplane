import { Sparkles } from "lucide-react";

export function ReviewModeBanner() {
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50 text-orange-700 px-4 py-3 text-[13px] flex items-start gap-2.5">
      <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
      <span>
        <span className="font-medium">Review your matches before shortlisting</span>
        {" — "}you can remove or reorder mentors here.
      </span>
    </div>
  );
}
