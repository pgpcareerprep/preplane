// Keep model routing in one importable module so tests can guard against
// retired IDs. OpenRouter free-model availability changes frequently, so the
// maintained free router is always the final fallback.
export const GEMINI_TOOL_MODEL = "gemini-2.5-flash-lite";
export const GEMINI_TOOL_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
] as const;
export const GEMINI_SYNTHESIS_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export const OPENROUTER_TOOL_MODEL = "qwen/qwen3-coder:free";
export const OPENROUTER_SYNTHESIS_MODELS = [
  "qwen/qwen3-coder:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "openrouter/free",
] as const;

export const GROK_TOOL_MODEL = "grok-3-mini";
export const GROK_SYNTHESIS_MODELS = ["grok-3-mini"] as const;
