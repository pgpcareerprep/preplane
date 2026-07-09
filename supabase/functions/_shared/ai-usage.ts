// Shared helper that records one row into `public.ai_usage_events` per AI call.
// Fire-and-forget: failures here must NEVER break the user request.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Module-level admin client (service role) — bypasses RLS for inserts.
let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _client;
}

export type AiFeature =
  | "copilot"
  | "copilot_web_search"
  | "voice"
  | `voice-${string}` // per-provider voice usage, e.g. voice-gemini
  | "tts"
  | "parse_jd"
  | "embeddings"
  | "mentor_search";

export interface LogAiUsageInput {
  userId?: string | null;
  feature: AiFeature;
  model?: string | null;
  promptTokens?: number | null;
  responseTokens?: number | null;
  totalTokens?: number | null;
  latencyMs?: number | null;
  status?: string;          // ok | error | rate_limited | credits_exhausted | fallback
  errorMessage?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AiBudgetReservation {
  allowed: boolean;
  reason?: string;
  requests_used?: number;
  request_limit?: number;
  tokens_used?: number;
  token_limit?: number;
  reset_at?: string;
}

export async function reserveAiRequest(
  userId: string,
  model?: string | null,
): Promise<AiBudgetReservation> {
  const { data, error } = await getClient().rpc("reserve_ai_request", {
    p_user_id: userId,
    p_model: model ?? null,
  });
  if (error) throw new Error(`AI budget reservation failed: ${error.message}`);
  return data as AiBudgetReservation;
}

/**
 * Crude token estimate when the upstream API doesn't return one.
 * Rule of thumb: ~4 characters per token for English text.
 */
export function estimateTokens(text?: string | null): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

/**
 * Record a single AI usage event. Errors are swallowed and logged to console.
 * Safe to `await` or to fire-and-forget — never throws.
 */
export async function logAiUsage(input: LogAiUsageInput): Promise<void> {
  try {
    const prompt = input.promptTokens ?? 0;
    const response = input.responseTokens ?? 0;
    const total = input.totalTokens ?? (prompt + response);
    const row = {
      user_id: input.userId ?? null,
      feature: input.feature,
      model: input.model ?? null,
      prompt_tokens: prompt,
      response_tokens: response,
      total_tokens: total,
      latency_ms: input.latencyMs ?? null,
      status: input.status ?? "ok",
      error_message: input.errorMessage ?? null,
      request_id: input.requestId ?? null,
      metadata: input.metadata ?? {},
    };
    const { error } = await getClient().from("ai_usage_events").insert(row);
    if (error) {
      console.warn("[ai-usage] insert failed:", error.message);
    }
    if (input.userId && total > 0) {
      const { error: budgetError } = await getClient().rpc("record_ai_tokens", {
        p_user_id: input.userId,
        p_tokens: total,
        p_model: input.model ?? null,
      });
      if (budgetError) {
        console.warn("[ai-usage] budget token update failed:", budgetError.message);
      }
    }
  } catch (e) {
    console.warn("[ai-usage] log threw:", (e as Error).message);
  }
}
