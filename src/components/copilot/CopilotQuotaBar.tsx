import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCopilotModelDisplay, useCopilotQuota, type QuotaSeverity } from "@/lib/hooks/useCopilotQuota";
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

export type ActiveCopilotInference = {
  model: string;
  fallback?: boolean;
};

interface CopilotUsageStripProps {
  className?: string;
  active?: boolean;
  inference?: ActiveCopilotInference | null;
}

/**
 * Minimal in-composer usage strip.
 * Shows provider + model (from the live response when available) and daily quota.
 */
export function CopilotUsageStrip({ className, active = false, inference = null }: CopilotUsageStripProps) {
  const q = useCopilotQuota();
  const t = toneClasses(q.severity);
  const displayModel = inference?.model ?? q.model;
  const display = formatCopilotModelDisplay(displayModel, inference?.fallback);
  const quotaProvider = formatCopilotModelDisplay(q.model);

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
            <span className={cn(
              "max-w-[220px] truncate rounded-full border border-n200 bg-white px-2.5 py-1 text-[10.5px] font-medium shadow-sm",
              active ? "text-orange-600 border-orange-200" : inference?.fallback ? "text-amber-700 border-amber-200" : "text-n600",
            )}>
              {active ? "Using " : ""}{display.label}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">
            {inference
              ? `This response: ${display.label}`
              : `Last model: ${quotaProvider.label}`}
            {inference && inference.model !== q.model ? ` · Daily budget tracked on ${quotaProvider.label}` : ""}
          </TooltipContent>
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
export function CopilotUsageMini({
  className,
  active = false,
  inference = null,
}: {
  className?: string;
  active?: boolean;
  inference?: ActiveCopilotInference | null;
}) {
  const q = useCopilotQuota();
  const t = toneClasses(q.severity);
  const display = formatCopilotModelDisplay(inference?.model ?? q.model, inference?.fallback);
  return (
    <span
      className={cn(
        "md:hidden inline-flex items-center gap-1.5 rounded-full border border-n200 bg-card px-2 py-0.5 text-[11px] tabular-nums",
        t.text,
        className,
      )}
      title={`${display.label} · ${q.percentRemaining}% left · refreshes in ${q.resetIn}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.bar)} />
      {active ? display.shortModel : `${q.percentRemaining}%`}
    </span>
  );
}

// ── Back-compat aliases (old imports keep working but render the new strip) ──
export const CopilotQuotaBar = CopilotUsageStrip;
export const CopilotQuotaChip = CopilotUsageMini;
