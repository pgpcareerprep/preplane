import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopilotQuota, type QuotaSeverity } from "@/lib/hooks/useCopilotQuota";
import { cn } from "@/lib/utils";

function toneClasses(sev: QuotaSeverity) {
  switch (sev) {
    case "limit":
      return { text: "text-rose-600", bar: "bg-rose-500", track: "bg-rose-100" };
    case "critical":
      return { text: "text-rose-500", bar: "bg-rose-500", track: "bg-n100" };
    case "warn":
      return { text: "text-amber-600", bar: "bg-amber-500", track: "bg-n100" };
    default:
      return { text: "text-n500", bar: "bg-n400", track: "bg-n100" };
  }
}

interface CopilotUsageStripProps {
  className?: string;
  active?: boolean;
}

/**
 * Minimal in-composer usage strip.
 * Shows requests, tokens, two slim bars and local reset time.
 * No model or provider details are surfaced.
 */
export function CopilotUsageStrip({ className, active = false }: CopilotUsageStripProps) {
  const q = useCopilotQuota();
  const t = toneClasses(q.severity);

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          "hidden md:flex items-center gap-2 select-none",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("max-w-[150px] truncate rounded-full border border-n200 bg-white px-2.5 py-1 text-[10.5px] font-medium shadow-sm", active ? "text-orange-600 border-orange-200" : "text-n600")}>
              {active ? "Using " : ""}{q.model.split("/").pop()?.replace(/:free$/, "")}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">Current model: {q.model}</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 rounded-full border border-n200 bg-n50 px-2.5 py-1.5 min-w-[116px] cursor-default">
              <div className={cn("h-1.5 flex-1 overflow-hidden rounded-full", t.track)}>
                <div className={cn("h-full transition-all", t.bar)} style={{ width: `${q.percentRemaining}%` }} />
              </div>
              <span className={cn("text-[10.5px] font-semibold tabular-nums", t.text)}>{q.percentRemaining}% left</span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">
            Refreshes in {q.resetIn} ({q.resetLocal}). Daily allowance: {q.requestLimit} requests or {q.tokenLimit.toLocaleString()} tokens.
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Mobile-only compact pill (used inline on small screens). */
export function CopilotUsageMini({ className, active = false }: { className?: string; active?: boolean }) {
  const q = useCopilotQuota();
  const t = toneClasses(q.severity);
  return (
    <span
      className={cn(
        "md:hidden inline-flex items-center gap-1.5 rounded-full border border-n200 bg-card px-2 py-0.5 text-[11px] tabular-nums",
        t.text,
        className,
      )}
      title={`${q.model} · ${q.percentRemaining}% left · refreshes in ${q.resetIn}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.bar)} />
      {active ? q.model.split("/").pop()?.replace(/:free$/, "") : `${q.percentRemaining}%`}
    </span>
  );
}

// ── Back-compat aliases (old imports keep working but render the new strip) ──
export const CopilotQuotaBar = CopilotUsageStrip;
export const CopilotQuotaChip = CopilotUsageMini;
