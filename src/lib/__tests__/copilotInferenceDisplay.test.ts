import { describe, expect, it } from "vitest";
import { formatCopilotInferenceDisplay } from "../copilotInferenceDisplay";

describe("formatCopilotInferenceDisplay", () => {
  it("shows idle label before any turn", () => {
    expect(formatCopilotInferenceDisplay({ idle: true }).label).toBe("Auto · ready");
  });

  it("distinguishes fast path from query path", () => {
    expect(formatCopilotInferenceDisplay({ model: "deterministic", path: "FAST" }).label)
      .toBe("Fast path · no LLM");
    expect(formatCopilotInferenceDisplay({ model: "query-path", path: "QUERY" }).label)
      .toBe("Query path · no LLM");
  });

  it("labels command plane and local paths", () => {
    expect(formatCopilotInferenceDisplay({ model: "command-plane", path: "COMMAND" }).label)
      .toBe("Command plane · no LLM");
    expect(formatCopilotInferenceDisplay({ model: "deterministic", path: "LOCAL" }).label)
      .toBe("Local · no LLM");
  });

  it("formats Gemini and OpenRouter models for agent path", () => {
    expect(formatCopilotInferenceDisplay({ model: "gemini-2.5-flash", path: "AGENT" }).label)
      .toContain("Gemini");
    expect(formatCopilotInferenceDisplay({ model: "qwen/qwen3-coder:free", path: "AGENT" }).label)
      .toBe("OpenRouter · qwen3-coder");
  });
});
