import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCopilotQuota, DAILY_REQUEST_QUOTA, DAILY_TOKEN_QUOTA, type QuotaSeverity } from "@/lib/hooks/useCopilotQuota";
import { cn } from "@/lib/utils";

function fmt(n: number) {
  return n.toLocaleString("en-US");
}

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
}

/**
 * Minimal in-composer usage strip.
 * Shows requests, tokens, two slim bars and local reset time.
 * No model or provider details are surfaced.
 */
export function CopilotUsageStrip({ className }: CopilotUsageStripProps) {
  const q = useCopilotQuota();
  const t = toneClasses(q.severity);

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          "hidden md:flex items-center gap-3 pr-2 select-none",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <div className="flex flex-col items-end gap-1 min-w-[140px]">
          <div className={cn("flex items-center gap-1.5 text-[11px] tabular-nums", t.text)}>
            <span>{q.requestsUsed} / {DAILY_REQUEST_QUOTA} req</span>
          </div>
          <div className={cn("h-1 w-[140px] overflow-hidden rounded-full", t.track)}>
            <div className={cn("h-full transition-all", t.bar)} style={{ width: `${q.requestPercent}%` }} />
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 min-w-[150px]">
          <div className={cn("flex items-center gap-1.5 text-[11px] tabular-nums", t.text)}>
            <span>{fmt(q.tokensUsed)} / {fmt(DAILY_TOKEN_QUOTA)} tk</span>
          </div>
          <div className={cn("h-1 w-[150px] overflow-hidden rounded-full", t.track)}>
            <div className={cn("h-full transition-all", t.bar)} style={{ width: `${q.tokenPercent}%` }} />
          </div>
        </div>

        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("text-[11px] cursor-default", t.text)}>
              Reset {q.resetLocal}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top">{q.resetUtc}</TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Mobile-only compact pill (used inline on small screens). */
export function CopilotUsageMini({ className }: { className?: string }) {
  const q = useCopilotQuota();
  const t = toneClasses(q.severity);
  return (
    <span
      className={cn(
        "md:hidden inline-flex items-center gap-1.5 rounded-full border border-n200 bg-card px-2 py-0.5 text-[11px] tabular-nums",
        t.text,
        className,
      )}
      title={`${q.requestsUsed}/${DAILY_REQUEST_QUOTA} req · ${fmt(q.tokensUsed)}/${fmt(DAILY_TOKEN_QUOTA)} tk · reset ${q.resetLocal}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", t.bar)} />
      {q.requestsUsed}/{DAILY_REQUEST_QUOTA}
    </span>
  );
}

// ── Back-compat aliases (old imports keep working but render the new strip) ──
export const CopilotQuotaBar = CopilotUsageStrip;
export const CopilotQuotaChip = CopilotUsageMini;
