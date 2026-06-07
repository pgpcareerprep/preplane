import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Free-tier shared quota math (≈ 15 users):
//   Gemini Flash:  1,500 req/day ÷ 15 ≈ 100 req per user per day.
//   Gemini Flash:  ≈ 3,000 tokens per request × 100 = 300,000 tokens/user/day.
//   Groq Llama 3.3: 14,400 req/day ÷ 15 ≈ 960 voice requests/user/day.
export const DAILY_REQUEST_QUOTA = 100;
export const DAILY_TOKEN_QUOTA = 300_000;
export const VOICE_REQUEST_QUOTA = 960;

export type QuotaSeverity = "normal" | "warn" | "critical" | "limit";

export interface CopilotQuota {
  requestsUsed: number;
  requestsRemaining: number;
  tokensUsed: number;
  tokensRemaining: number;
  requestPercent: number;
  tokenPercent: number;
  percentUsed: number;
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

function todayUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
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
  return { resetLocal: local, resetUtc: "00:00 UTC (midnight UTC)" };
}

export function useCopilotQuota(): CopilotQuota {
  const usageDate = todayUtcDateString();

  const { data, isLoading } = useQuery({
    queryKey: ["copilot-quota", usageDate],
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const userId = userRes.user?.id;
      if (!userId) return { requests: 0, tokens: 0 };

      const { data: rows, error } = await supabase
        .from("copilot_daily_usage" as any)
        .select("requests_used, tokens_used")
        .eq("user_id", userId)
        .eq("usage_date", usageDate)
        .maybeSingle();

      if (error || !rows) return { requests: 0, tokens: 0 };
      const row = rows as unknown as { requests_used: number | null; tokens_used: number | null };
      return {
        requests: row.requests_used ?? 0,
        tokens: row.tokens_used ?? 0,
      };
    },
  });

  const requestsUsed = data?.requests ?? 0;
  const tokensUsed = data?.tokens ?? 0;
  const requestsRemaining = Math.max(0, DAILY_REQUEST_QUOTA - requestsUsed);
  const tokensRemaining = Math.max(0, DAILY_TOKEN_QUOTA - tokensUsed);

  const requestPercent = Math.min(100, (requestsUsed / DAILY_REQUEST_QUOTA) * 100);
  const tokenPercent = Math.min(100, (tokensUsed / DAILY_TOKEN_QUOTA) * 100);
  const percentUsed = Math.max(requestPercent, tokenPercent);

  const severity: QuotaSeverity =
    percentUsed >= 100 ? "limit" :
    percentUsed >= 90 ? "critical" :
    percentUsed >= 70 ? "warn" : "normal";

  const { resetLocal, resetUtc } = computeResetLabels();

  return {
    requestsUsed,
    requestsRemaining,
    tokensUsed,
    tokensRemaining,
    requestPercent,
    tokenPercent,
    percentUsed,
    severity,
    isNearLimit: severity === "warn" || severity === "critical",
    isAtLimit: severity === "limit",
    resetLocal,
    resetUtc,
    resetTime: `Resets at ${resetLocal}`,
    isLoading,
  };
}
