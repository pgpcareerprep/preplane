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

const COPILOT_AI = "services/orchestrator/copilot/chat_handler.ts";
const COPILOT_PROVIDERS = "services/orchestrator/copilot/providers.ts";
const COPILOT_REQUEST = "services/orchestrator/copilot/requestContext.ts";
const VOICE_COPILOT = "services/orchestrator/voice_handler.ts";
const COPILOT_PAGE = "src/pages/CopilotPage.tsx";
const VOICE_DICTATION = "src/components/copilot/VoiceDictation.tsx";

describe("copilot-ai provider router", () => {
  it("defines buildProviderList function", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("export function buildProviderList(");
  });

  it("buildProviderList is called with all three key vars", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("buildProviderList(GEMINI_API_KEY, OPENROUTER_API_KEY, GROK_API_KEY)");
  });

  it("stores AI provider config in the request-scoped ALS store", () => {
    const req = read(COPILOT_REQUEST);
    const index = read(COPILOT_AI);
    expect(req).toContain("export type AiProviderState");
    expect(req).toContain("export function aiProvider()");
    expect(index).not.toContain("let REQUEST_PROVIDERS");
    expect(index).not.toContain("let AI_GATEWAY_URL");
    expect(index).not.toContain("single-threaded event loop");
  });

  it("callSynthesis iterates request-scoped providers not a single provider", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("requestState().ai.providers");
    expect(src).toContain("for (const prov of providers)");
  });

  it("callToolModel iterates request-scoped providers with cross-provider fallback", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("export async function callToolModel(");
    expect(src).toContain("for (const prov of providers)");
  });

  it("tool-calling loop uses callToolModel not direct fetch", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("await callToolModel(");
    expect(src).not.toContain("for (const fallbackModel of fallbacks)");
  });

  it("returns ALL_AI_PROVIDERS_UNAVAILABLE error code when all providers fail", () => {
    const src = read(COPILOT_AI);
    expect(src).toContain("ALL_AI_PROVIDERS_UNAVAILABLE");
    expect(src).toContain("status: 503");
  });

  it("provider priority: Gemini first, then OpenRouter, then Grok", () => {
    const src = read(COPILOT_PROVIDERS);
    const geminiFirst = src.indexOf('name: "Gemini"');
    const openrouterSecond = src.indexOf('name: "OpenRouter"');
    const grokThird = src.indexOf('name: "Grok"');
    expect(geminiFirst).toBeGreaterThan(-1);
    expect(openrouterSecond).toBeGreaterThan(geminiFirst);
    expect(grokThird).toBeGreaterThan(openrouterSecond);
  });

  it("circuit breaker is checked per provider before attempting", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("isCircuitOpen(prov.name)");
  });

  it("records failure for retryable errors", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("recordFailure(prov.name)");
  });

  it("records success after a successful provider call", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("recordSuccess(prov.name)");
  });

  it("RETRYABLE_HTTP set covers expected status codes", () => {
    const src = read(COPILOT_PROVIDERS);
    expect(src).toContain("408");
    expect(src).toContain("429");
    expect(src).toContain("500");
    expect(src).toContain("502");
    expect(src).toContain("503");
    expect(src).toContain("504");
  });
});

describe("voice-copilot provider router", () => {
  it("delegates tool-model calls to shared callToolModel via voiceCallModel", () => {
    const src = read(VOICE_COPILOT);
    expect(src).toContain("voiceCallModel");
    expect(src).toContain("await callToolModel(");
    expect(src).toContain("buildProviderList(");
    expect(src).not.toContain("const PROVIDERS:");
    expect(src).not.toContain("for (const provider of PROVIDERS)");
  });

  it("voice-copilot returns 503 (not 200) when all providers fail", () => {
    const src = read(VOICE_COPILOT);
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
