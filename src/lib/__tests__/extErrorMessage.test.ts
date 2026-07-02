import { describe, expect, it } from "vitest";
import {
  extEmptyResultMessage,
  extFetchedZeroMessage,
  isGeminiKeyError,
} from "@/lib/extErrorMessage";

describe("extErrorMessage", () => {
  it("uses neutral copy for no_results", () => {
    expect(extEmptyResultMessage({ onlyExt: true, reason: "no_results" })).toContain(
      "No mentors matched this role",
    );
    expect(extEmptyResultMessage({ onlyExt: true, reason: "no_results" })).not.toContain("GEMINI_API_KEY");
  });

  it("mentions GEMINI_API_KEY only for auth-shaped gemini errors", () => {
    expect(isGeminiKeyError("API key not valid. Please pass a valid API key.")).toBe(true);
    expect(
      extEmptyResultMessage({
        onlyExt: true,
        reason: "gemini_error",
        detail: "Gemini search API 400: API key not valid",
      }),
    ).toContain("GEMINI_API_KEY");
  });

  it("surfaces gemini API detail without blaming the key", () => {
    const msg = extEmptyResultMessage({
      onlyExt: true,
      reason: "gemini_error",
      detail: "Gemini search API 429: Resource exhausted",
    });
    expect(msg).toContain("429");
    expect(msg).not.toContain("GEMINI_API_KEY");
  });

  it("formats fetched-zero toast from detail", () => {
    expect(
      extFetchedZeroMessage({ reason: "no_results", detail: "search providers returned nothing" }),
    ).toContain("search providers returned nothing");
  });
});
