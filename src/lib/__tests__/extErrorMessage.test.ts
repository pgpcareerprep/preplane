import { describe, expect, it } from "vitest";
import {
  extEmptyResultMessage,
  extFetchedZeroMessage,
  geminiKeyRejectedMessage,
  isGeminiKeyError,
} from "@/lib/extErrorMessage";

describe("extErrorMessage", () => {
  it("uses neutral copy for no_results", () => {
    expect(extEmptyResultMessage({ onlyExt: true, reason: "no_results" })).toContain(
      "No mentors matched this role",
    );
    expect(extEmptyResultMessage({ onlyExt: true, reason: "no_results" })).not.toContain("GEMINI_API_KEY");
  });

  it("mentions GEMINI_API_KEY and upstream status for auth-shaped gemini errors", () => {
    expect(isGeminiKeyError("API key not valid. Please pass a valid API key.")).toBe(true);
    expect(isGeminiKeyError("Gemini 403: PERMISSION_DENIED")).toBe(true);
    expect(isGeminiKeyError("error: api_key_invalid")).toBe(true);
    const msg = extEmptyResultMessage({
      onlyExt: true,
      reason: "gemini_error",
      detail: "Gemini search API 400: API key not valid",
    });
    expect(msg).toContain("GEMINI_API_KEY");
    expect(msg).toContain("400");
    expect(msg).toContain("rejected by Gemini");
  });

  it("geminiKeyRejectedMessage includes truncated detail", () => {
    const msg = geminiKeyRejectedMessage("Gemini search API 403: PERMISSION_DENIED");
    expect(msg).toContain("403");
    expect(msg).toContain("GEMINI_API_KEY");
  });

  it("surfaces gemini API detail without blaming the key on quota errors", () => {
    const msg = extEmptyResultMessage({
      onlyExt: true,
      reason: "gemini_error",
      detail: "Gemini search API 429: Resource exhausted",
    });
    expect(msg).toContain("429");
    expect(msg).not.toContain("Fix GEMINI_API_KEY");
    expect(msg).not.toContain("rejected by Gemini");
  });

  it("formats fetched-zero toast from detail", () => {
    expect(
      extFetchedZeroMessage({ reason: "no_results", detail: "search providers returned nothing" }),
    ).toContain("search providers returned nothing");
  });

  it("fetched-zero key rejection includes detail", () => {
    const msg = extFetchedZeroMessage({
      reason: "gemini_error",
      detail: "Gemini 401: API_KEY_INVALID",
    });
    expect(msg).toContain("401");
    expect(msg).toContain("GEMINI_API_KEY");
  });
});
