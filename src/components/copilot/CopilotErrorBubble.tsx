import { AlertTriangle, RotateCcw } from "lucide-react";

interface CopilotErrorBubbleProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Inline error alert rendered in the assistant message slot when a
 * request fails (network, timeout, 5xx). Replaces plain-text "⚠️ …"
 * fallbacks with a clear, actionable bubble.
 */
export function CopilotErrorBubble({ message, onRetry, retryLabel = "Retry" }: CopilotErrorBubbleProps) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2.5 text-[13px] text-rose-700">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-rose-500" aria-hidden />
      <div className="flex-1 min-w-0">
        <p className="leading-snug">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-card border border-rose-200 text-rose-600 text-[12px] font-medium hover:bg-rose-100 transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          {retryLabel}
        </button>
      )}
    </div>
  );
}
