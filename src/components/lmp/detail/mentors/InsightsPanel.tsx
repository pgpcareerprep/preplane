import { Lightbulb, ArrowUpRight } from "lucide-react";

export function InsightsPanel({ topName }: { topName: string }) {
  return (
    <aside className="rounded-2xl bg-orange-50 border border-orange-200 p-5 sticky top-[140px]">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-orange-600" strokeWidth={2} />
        <h5 className="text-[13px] font-semibold text-orange-600 uppercase tracking-[0.5px]">Why Top Mentors Differ</h5>
      </div>

      <p className="mt-3 text-[13px] text-n700 leading-[1.6]">
        <span className="font-semibold text-n900">{topName}</span> stands out for direct experience at the same company plus the highest historical conversion rate. Layer-2 candidates trade company overlap for stronger strategic depth, while Layer-3 alumni bring industry context.
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Same company", "Higher conversion", "Best HR fit"].map((c) => (
          <span key={c} className="rounded-full bg-card border border-orange-200 text-orange-700 px-2 py-0.5 text-[11px] font-medium">
            {c}
          </span>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-1.5 text-[12px] font-medium text-orange-600">
        <ArrowUpRight className="h-3.5 w-3.5" />
        Top pick → see Rank 1 card
      </div>
    </aside>
  );
}