import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  copilotChatUrl,
  copilotPendingUrl,
  isCopilotGatewayEnabled,
  voiceCopilotUrl,
  voiceSpeakUrl,
} from "@/lib/copilotGateway";

describe("copilotGateway URL resolution", () => {
  const env = import.meta.env;

  beforeEach(() => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_COPILOT_GATEWAY_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to legacy edge functions when gateway flag is unset", () => {
    expect(isCopilotGatewayEnabled()).toBe(false);
    expect(copilotChatUrl()).toBe("https://example.supabase.co/functions/v1/copilot-ai");
    expect(copilotPendingUrl()).toBe("https://example.supabase.co/functions/v1/copilot-ai");
    expect(voiceCopilotUrl()).toBe("https://example.supabase.co/functions/v1/voice-copilot");
    expect(voiceSpeakUrl()).toBe("https://example.supabase.co/functions/v1/voice-speak");
  });

  it("routes to gateway when VITE_COPILOT_GATEWAY_URL is set", () => {
    vi.stubEnv("VITE_COPILOT_GATEWAY_URL", "http://localhost:8080/");
    expect(isCopilotGatewayEnabled()).toBe(true);
    expect(copilotChatUrl()).toBe("http://localhost:8080/copilot");
    expect(copilotPendingUrl()).toBe("http://localhost:8080/copilot/pending");
    expect(voiceCopilotUrl()).toBe("http://localhost:8080/voice");
    expect(voiceSpeakUrl()).toBe("http://localhost:8080/voice/speak");
  });
});
