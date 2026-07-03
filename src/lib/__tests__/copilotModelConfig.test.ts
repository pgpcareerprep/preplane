import { describe, expect, it } from "vitest";
import {
  GEMINI_SYNTHESIS_MODELS,
  GEMINI_TOOL_FALLBACK_MODELS,
  GEMINI_TOOL_MODEL,
  OPENROUTER_SYNTHESIS_MODELS,
  OPENROUTER_TOOL_MODEL,
} from "../../../supabase/functions/copilot-ai/modelConfig";

const RETIRED_OPENROUTER_IDS = new Set([
  "deepseek/deepseek-chat-v3-0324:free",
  "meta-llama/llama-4-maverick:free",
  "google/gemini-2.0-flash-exp:free",
  "deepseek/deepseek-chat:free",
  "mistralai/mistral-7b-instruct:free",
]);

describe("Copilot model routing", () => {
  it("never configures known retired OpenRouter model IDs", () => {
    const configured = [OPENROUTER_TOOL_MODEL, ...OPENROUTER_SYNTHESIS_MODELS];
    expect(configured.filter((id) => RETIRED_OPENROUTER_IDS.has(id))).toEqual([]);
  });

  it("ends OpenRouter synthesis fallbacks on a concrete free model slug", () => {
    expect(OPENROUTER_SYNTHESIS_MODELS.at(-1)).toBe("meta-llama/llama-3.3-70b-instruct:free");
    expect(OPENROUTER_SYNTHESIS_MODELS).not.toContain("openrouter/free");
  });

  it("uses current stable Gemini models for direct-provider fallback", () => {
    const configured = [GEMINI_TOOL_MODEL, ...GEMINI_TOOL_FALLBACK_MODELS, ...GEMINI_SYNTHESIS_MODELS];
    expect(configured.every((id) => id.startsWith("gemini-2.5-"))).toBe(true);
  });
});
