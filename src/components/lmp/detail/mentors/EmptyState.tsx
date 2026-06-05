import { Search, Sparkles, Play, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

export function MentorsEmptyState({
  onRun,
  onAlign,
}: {
  onRun: () => void;
  onAlign?: () => void;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl surface-ai-aura border border-plum-200 shadow-md p-12 text-center">
      {/* Decorative blur orbs */}
      <div className="pointer-events-none absolute -top-16 -left-10 h-56 w-56 rounded-full bg-card/40 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-48 w-48 rounded-full bg-plum-400/30 blur-3xl" />

      {/* AI processing chip */}
      <div className="relative mx-auto inline-flex items-center gap-1.5 rounded-full glass-plum border border-white/60 px-3 py-1 mb-5">
        <span className="h-1.5 w-1.5 rounded-full bg-plum-400" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-plum-400">AI Processing</span>
      </div>

      <div className="relative mx-auto h-16 w-16 mb-4">
        <Search className="h-16 w-16 text-plum-400/80" strokeWidth={1.25} />
        <Sparkles className="absolute -top-1 -right-1 h-5 w-5 text-orange-500" strokeWidth={2} />
      </div>
      <h3 className="relative text-[22px] font-semibold text-n900 tracking-[-0.3px]">No mentor matches yet</h3>

      <p className="relative mt-1 text-[14px] text-n600 max-w-md mx-auto">
        Run the AI matching engine to find the best mentors, or pick one manually from the mentor pool.
      </p>

      <div className="relative mt-6 flex flex-col sm:flex-row justify-center gap-3 max-w-xl mx-auto">
        <button
          onClick={onRun}
          className={cn(
            "inline-flex items-center justify-center gap-2 rounded-lg text-[15px] font-medium px-6 py-3 shadow-md flex-1 transition-colors",
            "bg-orange-500 hover:bg-orange-600 text-white",
          )}
        >
          <Play className="h-4 w-4" strokeWidth={2.25} />
          Run AI Matching
        </button>
        {onAlign && (
          <button
            onClick={onAlign}
            className={cn(
              "inline-flex items-center justify-center gap-2 rounded-lg text-[15px] font-medium px-6 py-3 flex-1 transition-colors",
              "bg-card border border-plum-200 hover:bg-plum-50 text-plum-700",
            )}
          >
            <UserPlus className="h-4 w-4" strokeWidth={2.25} />
            Align Mentor
          </button>
        )}
      </div>
    </div>
  );
}
