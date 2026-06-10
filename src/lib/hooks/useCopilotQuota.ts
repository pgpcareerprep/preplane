import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const OPENROUTER_REQUEST_QUOTA = 200;
export const OPENROUTER_TOKEN_QUOTA = 500_000;

export type QuotaSeverity = "normal" | "warn" | "critical" | "limit";

export interface CopilotQuota {
  requestsUsed: number;
  requestsRemaining: number;
  tokensUsed: number;
  tokensRemaining: number;
  requestLimit: number;
  tokenLimit: number;
  provider: string;
  model: string;
  requestPercent: number;
  tokenPercent: number;
  percentUsed: number;
  percentRemaining: number;
  resetIn: string;
  severity: QuotaSeverity;
  isNearLimit: boolean;
  isAtLimit: boolean;
  /** Human reset label in the user's local timezone, e.g. "5:30 AM GMT+5:30". */
  resetLocal: string;
  /** UTC reference (tooltip). */
  resetUtc: string;
  /** Back-compat label used by older callers. */
  resetTime: string;
  isLoading: boolean;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function providerForModel(model: string): string {
  if (model.includes("/")) return "OpenRouter";
  if (/^gemini/i.test(model)) return "Gemini";
  if (/^grok/i.test(model)) return "xAI";
  return "AI gateway";
}

function computeResetLabels() {
  // Next midnight UTC.
  const next = new Date();
  next.setUTCHours(24, 0, 0, 0);
  let local = "midnight";
  try {
    local = next.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    local = next.toLocaleTimeString();
  }
  const remainingMs = Math.max(0, next.getTime() - Date.now());
  const hours = Math.floor(remainingMs / 3_600_000);
  const minutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const resetIn = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return { resetLocal: local, resetUtc: "00:00 UTC (midnight UTC)", resetIn };
}

export function useCopilotQuota(): CopilotQuota {
  const usageDate = todayUtc();

  const { data, isLoading } = useQuery({
    queryKey: ["copilot-quota", usageDate],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return null;

      const { data: budget, error } = await supabase
        .from("ai_daily_budgets")
        .select("requests_used,tokens_used,request_limit,token_limit,last_model")
        .eq("user_id", userId)
        .eq("usage_date", usageDate)
        .maybeSingle();

      if (error || !budget) return null;
      return {
        requests: budget.requests_used,
        tokens: budget.tokens_used,
        requestLimit: budget.request_limit,
        tokenLimit: budget.token_limit,
        model: budget.last_model || "qwen/qwen3-coder:free",
      };
    },
  });

  const requestsUsed = data?.requests ?? 0;
  const tokensUsed = data?.tokens ?? 0;
  const model = data?.model || "qwen/qwen3-coder:free";
  const provider = providerForModel(model);
  const requestLimit = data?.requestLimit ?? OPENROUTER_REQUEST_QUOTA;
  const tokenLimit = data?.tokenLimit ?? OPENROUTER_TOKEN_QUOTA;
  const requestsRemaining = Math.max(0, requestLimit - requestsUsed);
  const tokensRemaining = Math.max(0, tokenLimit - tokensUsed);

  const requestPercent = Math.min(100, (requestsUsed / requestLimit) * 100);
  const tokenPercent = Math.min(100, (tokensUsed / tokenLimit) * 100);
  const percentUsed = Math.max(requestPercent, tokenPercent);
  const percentRemaining = Math.max(0, Math.round(100 - percentUsed));

  const severity: QuotaSeverity =
    percentUsed >= 100 ? "limit" :
    percentUsed >= 90 ? "critical" :
    percentUsed >= 70 ? "warn" : "normal";

  const { resetLocal, resetUtc, resetIn } = computeResetLabels();

  return {
    requestsUsed,
    requestsRemaining,
    tokensUsed,
    tokensRemaining,
    requestLimit,
    tokenLimit,
    provider,
    model,
    requestPercent,
    tokenPercent,
    percentUsed,
    percentRemaining,
    severity,
    isNearLimit: severity === "warn" || severity === "critical",
    isAtLimit: severity === "limit",
    resetLocal,
    resetUtc,
    resetIn,
    resetTime: `Resets at ${resetLocal}`,
    isLoading,
  };
}
