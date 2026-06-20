/**
 * Tests for the cross-provider fallback router in copilot-ai.
 * These are structural tests that verify the provider list is built correctly
 * and the fallback semantics are correct, without needing live API keys.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf-8");

const COPILOT_AI = "supabase/functions/copilot-ai/index.ts";
const VOICE_COPILOT = "supabase/functions/voice-copilot/index.ts";
const COPILOT_PAGE = "src/pages/CopilotPage.tsx";
const VOICE_DICTATION = "src/components/copilot/VoiceDictation.tsx";

describe("copilot-ai provider router", () => {
  it("defines buildProviderList function", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("function buildProviderList(");
  });

  it("buildProviderList is called with all three key vars", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("buildProviderList(GEMINI_API_KEY, OPENROUTER_API_KEY, GROK_API_KEY)");
  });

  it("stores AI provider config in the request-scoped ALS store", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("type AiProviderState");
    expect(src).toContain("function aiProvider()");
    expect(src).not.toContain("let REQUEST_PROVIDERS");
    expect(src).not.toContain("let AI_GATEWAY_URL");
    expect(src).not.toContain("single-threaded event loop");
  });

  it("callSynthesis iterates request-scoped providers not a single provider", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("requestState().ai.providers");
    expect(src).toContain("for (const prov of providers)");
  });

  it("callToolModel iterates request-scoped providers with cross-provider fallback", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("async function callToolModel(");
    expect(src).toContain("for (const prov of providers)");
  });

  it("tool-calling loop uses callToolModel not direct fetch", () => {
    const src = read(COPILOT_AI);
    // The old pattern was a direct fetch(AI_GATEWAY_URL) in the tool loop
    // with a manual TOOL_FALLBACK_MODELS loop. Now it should use callToolModel.
    expect(src).toContain("await callToolModel(");
    // The old fallback loop should be gone
    expect(src).not.toContain("for (const fallbackModel of fallbacks)");
  });

  it("returns ALL_AI_PROVIDERS_UNAVAILABLE error code when all providers fail", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("ALL_AI_PROVIDERS_UNAVAILABLE");
    expect(src).toContain("status: 503");
  });

  it("provider priority: Gemini first, then OpenRouter, then Grok", () => {
    const src = read(COPILOT_AI);
    // buildProviderList adds Gemini first if geminiKey is present
    const geminiFirst = src.indexOf("name: \"Gemini\"");
    const openrouterSecond = src.indexOf("name: \"OpenRouter\"");
    const grokThird = src.indexOf("name: \"Grok\"");
    expect(geminiFirst).toBeGreaterThan(-1);
    expect(openrouterSecond).toBeGreaterThan(geminiFirst);
    expect(grokThird).toBeGreaterThan(openrouterSecond);
  });

  it("circuit breaker is checked per provider before attempting", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("isCircuitOpen(prov.name)");
  });

  it("records failure for retryable errors", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("recordFailure(prov.name)");
  });

  it("records success after a successful provider call", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("recordSuccess(prov.name)");
  });

  it("RETRYABLE_HTTP set covers expected status codes", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("408");
    expect(src).toContain("429");
    expect(src).toContain("500");
    expect(src).toContain("502");
    expect(src).toContain("503");
    expect(src).toContain("504");
  });
});

describe("voice-copilot provider router", () => {
  it("already uses a PROVIDERS array for cross-provider fallback", () => {
    const src = read(VOICE_COPILOT);
    expect(src).toContain("const PROVIDERS:");
    expect(src).toContain("for (const provider of PROVIDERS)");
  });

  it("voice-copilot returns 503 (not 200) when all providers fail", () => {
    const src = read(VOICE_COPILOT);
    // After fix: isProviderErr ? 503 : 500
    expect(src).toContain("status: isProviderErr ? 503 : 500");
  });

  it("voice-copilot exposes structured error code in response", () => {
    const src = read(VOICE_COPILOT);
    expect(src).toContain("ALL_AI_PROVIDERS_UNAVAILABLE");
    expect(src).toContain("VOICE_INTERNAL_ERROR");
  });
});

describe("frontend error handling", () => {
  it("CopilotPage handles ALL_AI_PROVIDERS_UNAVAILABLE code", () => {
    const src = read(COPILOT_PAGE);
    expect(src).toContain("ALL_AI_PROVIDERS_UNAVAILABLE");
    expect(src).toContain("resp.status === 503");
  });

  it("VoiceDictation handles structured error codes", () => {
    const src = read(VOICE_DICTATION);
    expect(src).toContain("ALL_AI_PROVIDERS_UNAVAILABLE");
    expect(src).toContain("resp.ok");
  });
});
