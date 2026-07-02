/** Shared EXT empty-result copy for mentorMatchRunner and MentorsTab. */

export type ExtEmptyReason = "gemini_error" | "no_results" | undefined;

export type ExtEmptyContext = {
  onlyExt: boolean;
  reason?: ExtEmptyReason;
  detail?: string | null;
};

const NEUTRAL_ONLY_EXT =
  "No mentors matched this role. Try broadening the role or adding skills/industry context.";

const NEUTRAL_MIXED =
  "External search returned no additional results. Showing MU/ALU results only.";

export function isGeminiApiBlocked(detail?: string | null): boolean {
  if (!detail) return false;
  const d = detail.toLowerCase();
  return (
    d.includes("are blocked") ||
    (d.includes("generativelanguage") && d.includes("permission_denied")) ||
    (d.includes("generativelanguage") && /\b403\b/.test(d) && d.includes("blocked"))
  );
}

export function isGeminiKeyError(detail?: string | null): boolean {
  if (!detail || isGeminiApiBlocked(detail)) return false;
  const d = detail.toLowerCase();
  return (
    d.includes("api key") ||
    d.includes("api_key") ||
    d.includes("api_key_invalid") ||
    d.includes("permission_denied") ||
    d.includes("invalid key") ||
    d.includes("permission denied") ||
    d.includes("not configured") ||
    /\b401\b/.test(d) ||
    /\b403\b/.test(d)
  );
}

function truncateDetail(detail: string, max = 180): string {
  const t = detail.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

/** Actionable copy when Gemini rejects the configured API key (includes upstream detail). */
export function geminiKeyRejectedMessage(detail?: string | null, maxDetail = 160): string {
  const d = detail?.trim();
  if (!d) {
    return "External-only search found no mentors. Verify GEMINI_API_KEY in Supabase Edge Function secrets.";
  }
  return `External mentor search key was rejected by Gemini (${truncateDetail(d, maxDetail)}). Fix GEMINI_API_KEY in Supabase Edge Function secrets.`;
}

/** When the key exists but Google Cloud blocks server-side GenerateContent calls. */
export function geminiApiBlockedMessage(detail?: string | null, maxDetail = 120): string {
  const d = detail?.trim();
  const suffix = d ? ` (${truncateDetail(d, maxDetail)})` : "";
  return (
    `Gemini API is blocked for this key${suffix}. ` +
    "In Google Cloud Console → Credentials, edit the key: set Application restrictions to None (or allow server IPs), " +
    "and under API restrictions include Generative Language API. Then update GEMINI_API_KEY in Supabase secrets."
  );
}

function geminiFailureMessage(detail?: string | null): string {
  if (isGeminiApiBlocked(detail)) return geminiApiBlockedMessage(detail);
  if (isGeminiKeyError(detail)) return geminiKeyRejectedMessage(detail);
  const d = detail?.trim();
  if (d) return `External search failed (Gemini API): ${truncateDetail(d)}`;
  return "External search failed during Gemini discovery. Try again or include MU/ALU sources.";
}

/** Toast when EXT-only (or mixed) run ends with zero external mentors. */
export function extEmptyResultMessage(ctx: ExtEmptyContext): string {
  if (!ctx.onlyExt) return NEUTRAL_MIXED;

  if (ctx.reason === "gemini_error") {
    return geminiFailureMessage(ctx.detail);
  }

  if (ctx.detail?.trim()) {
    return `External search returned no mentors. ${truncateDetail(ctx.detail)}`;
  }

  return NEUTRAL_ONLY_EXT;
}

/** Toast when EXT fetched profiles but none ranked into suggestions. */
export function extFetchedZeroMessage(ctx: Pick<ExtEmptyContext, "reason" | "detail">): string {
  if (ctx.reason === "gemini_error") {
    return geminiFailureMessage(ctx.detail);
  }
  if (ctx.detail?.trim()) {
    return `External discovery returned no mentors. ${truncateDetail(ctx.detail)}`;
  }
  return "External discovery returned no mentors for this role — try broadening skills or adding company/industry context.";
}
