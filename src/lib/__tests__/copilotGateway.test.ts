import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  copilotChatUrl,
  copilotPendingUrl,
  isCopilotGatewayEnabled,
  PRODUCTION_COPILOT_GATEWAY_URL,
  voiceCopilotUrl,
  voiceSpeakUrl,
} from "@/lib/copilotGateway";

describe("copilotGateway URL resolution", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_COPILOT_GATEWAY_URL", "");
    vi.stubEnv("VITE_COPILOT_USE_LEGACY", "");
    vi.stubEnv("PROD", "");
    vi.stubEnv("DEV", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to legacy edge functions in dev when gateway flag is unset", () => {
    expect(isCopilotGatewayEnabled()).toBe(false);
    expect(copilotChatUrl()).toBe("https://example.supabase.co/functions/v1/copilot-ai");
    expect(copilotPendingUrl()).toBe("https://example.supabase.co/functions/v1/copilot-ai");
    expect(voiceCopilotUrl()).toBe("https://example.supabase.co/functions/v1/voice-copilot");
    expect(voiceSpeakUrl()).toBe("https://example.supabase.co/functions/v1/voice-speak");
  });

  it("routes to explicit gateway URL when VITE_COPILOT_GATEWAY_URL is set", () => {
    vi.stubEnv("VITE_COPILOT_GATEWAY_URL", "http://localhost:8080/");
    expect(isCopilotGatewayEnabled()).toBe(true);
    expect(copilotChatUrl()).toBe("http://localhost:8080/copilot");
    expect(copilotPendingUrl()).toBe("http://localhost:8080/copilot/pending");
    expect(voiceCopilotUrl()).toBe("http://localhost:8080/voice");
    expect(voiceSpeakUrl()).toBe("http://localhost:8080/voice/speak");
  });

  it("defaults to production gateway in prod builds", () => {
    vi.stubEnv("PROD", "true");
    vi.stubEnv("DEV", "");
    expect(isCopilotGatewayEnabled()).toBe(true);
    expect(copilotChatUrl()).toBe(`${PRODUCTION_COPILOT_GATEWAY_URL}/copilot`);
    expect(voiceSpeakUrl()).toBe(`${PRODUCTION_COPILOT_GATEWAY_URL}/voice/speak`);
  });

  it("VITE_COPILOT_USE_LEGACY=1 forces edge functions even in prod", () => {
    vi.stubEnv("PROD", "true");
    vi.stubEnv("DEV", "");
    vi.stubEnv("VITE_COPILOT_USE_LEGACY", "1");
    expect(isCopilotGatewayEnabled()).toBe(false);
    expect(copilotChatUrl()).toBe("https://example.supabase.co/functions/v1/copilot-ai");
  });
});
