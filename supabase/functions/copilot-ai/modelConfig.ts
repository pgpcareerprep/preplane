// Model routing — intent-based tiers.
// TIER A: Lightweight — greetings, simple status, confirmations
// TIER B: Standard   — tool-driven operational tasks (default)
// TIER C: Analysis   — JD/CV comparison, ATS, long reports, multi-record analytics

// ─── Gemini (primary) ──────────────────────────────────────────────────────
export const GEMINI_TOOL_MODEL = "gemini-2.5-flash-lite";   // Tier A/B tool calls
export const GEMINI_ANALYSIS_MODEL = "gemini-2.5-flash";    // Tier C heavy analysis

export const GEMINI_TOOL_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;

export const GEMINI_SYNTHESIS_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

// ─── OpenRouter (first fallback) ──────────────────────────────────────────
export const OPENROUTER_TOOL_MODEL = "qwen/qwen3-coder:free";
export const OPENROUTER_SYNTHESIS_MODELS = [
  "qwen/qwen3-coder:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "openrouter/free",
] as const;

// ─── Grok (final fallback) ────────────────────────────────────────────────
export const GROK_TOOL_MODEL = "grok-3-mini";
export const GROK_SYNTHESIS_MODELS = ["grok-3-mini"] as const;

// ─── Intent-to-tier mapping ───────────────────────────────────────────────
// Lightweight: no tools, tiny output, fast response expected
export const LIGHTWEIGHT_INTENTS = new Set([
  "greeting", "help", "general_chat", "voice_command",
] as const);

// Heavy analysis: longer context, reasoning, larger output
export const ANALYSIS_INTENTS = new Set([
  "report_generation", "analytics_query", "mentor_matching",
  "alumni_matching", "compare_progress", "poc_allocation",
] as const);

export type TaskTier = "lightweight" | "standard" | "analysis";

export function getTaskTier(intent: string): TaskTier {
  if (LIGHTWEIGHT_INTENTS.has(intent as any)) return "lightweight";
  if (ANALYSIS_INTENTS.has(intent as any)) return "analysis";
  return "standard";
}

/** Returns the best Gemini model for the given tier. */
export function geminiModelForTier(tier: TaskTier): string {
  return tier === "analysis" ? GEMINI_ANALYSIS_MODEL : GEMINI_TOOL_MODEL;
}

/** Max tokens per tier */
export const MAX_TOKENS_BY_TIER: Record<TaskTier, number> = {
  lightweight: 400,
  standard: 2048,
  analysis: 8192,
};
