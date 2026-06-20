/** Zero-Spend Mode — default ON. Only free providers may run. */
export const ZERO_SPEND = true;

/** Default cache TTL for scraped pages and search results. */
export const CACHE_TTL_DAYS = 14;

/** Minimum confidence (0–100) to include a mentor in results. */
export const MIN_CONFIDENCE = 55;

/** Gemini free-tier model for extraction, validation, and re-ranking. */
export const GEMINI_FREE_MODEL = "gemini-2.0-flash";

export const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/** Paid keys that must never be invoked while ZERO_SPEND is true. */
export const FORBIDDEN_PAID_KEYS = [
  "BRAVE_API_KEY",
  "SERPER_API_KEY",
  "FIRECRAWL_API_KEY",
  "OPENROUTER_API_KEY",
  "GROK_API_KEY",
] as const;

/** Self-hosted Firecrawl is allowed only when explicitly configured. */
export const SELF_HOSTED_FIRECRAWL_ENV = "FIRECRAWL_SELF_HOST_URL";

export function detectForbiddenPaidKeys(): string[] {
  const found: string[] = [];
  for (const key of FORBIDDEN_PAID_KEYS) {
    const val = Deno.env.get(key)?.trim();
    if (val) found.push(key);
  }
  return found;
}

/** Warn loudly if paid keys are present — they will still be skipped at runtime. */
export function assertZeroSpendConfig(): void {
  if (!ZERO_SPEND) return;
  const found = detectForbiddenPaidKeys();
  if (found.length) {
    console.warn(
      `[zero-spend] FORBIDDEN paid keys detected but will NOT be called: ${found.join(", ")}. Remove them from env/Vault.`,
    );
  }
}

export function isProviderAllowed(free: boolean): boolean {
  if (!ZERO_SPEND) return true;
  return free;
}
