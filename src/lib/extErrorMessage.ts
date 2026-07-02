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

export function isGeminiKeyError(detail?: string | null): boolean {
  if (!detail) return false;
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

/** Toast when EXT-only (or mixed) run ends with zero external mentors. */
export function extEmptyResultMessage(ctx: ExtEmptyContext): string {
  if (!ctx.onlyExt) return NEUTRAL_MIXED;

  if (ctx.reason === "gemini_error") {
    if (isGeminiKeyError(ctx.detail)) return geminiKeyRejectedMessage(ctx.detail);
    const detail = ctx.detail?.trim();
    if (detail) {
      return `External search failed (Gemini API): ${truncateDetail(detail)}`;
    }
    return "External search failed during Gemini discovery. Try again or include MU/ALU sources.";
  }

  if (ctx.detail?.trim()) {
    return `External search returned no mentors. ${truncateDetail(ctx.detail)}`;
  }

  return NEUTRAL_ONLY_EXT;
}

/** Toast when EXT fetched profiles but none ranked into suggestions. */
export function extFetchedZeroMessage(ctx: Pick<ExtEmptyContext, "reason" | "detail">): string {
  if (ctx.reason === "gemini_error") {
    if (isGeminiKeyError(ctx.detail)) {
      return geminiKeyRejectedMessage(ctx.detail);
    }
    const detail = ctx.detail?.trim();
    if (detail) {
      return `External discovery failed (Gemini API): ${truncateDetail(detail)}`;
    }
  }
  if (ctx.detail?.trim()) {
    return `External discovery returned no mentors. ${truncateDetail(ctx.detail)}`;
  }
  return "External discovery returned no mentors for this role — try broadening skills or adding company/industry context.";
}
