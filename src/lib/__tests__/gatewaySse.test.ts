import { describe, expect, it } from "vitest";
import { assembleFromSse } from "@/lib/copilotEngine";
import { buildPlainSseResponse } from "../../../services/orchestrator/copilot/intentRouter";

describe("gateway SSE compatibility", () => {
  it("assembleFromSse parses buildPlainSseResponse output", () => {
    const text = "Hey Pat! 👋 I'm your LMP Co-Pilot.";
    const raw = buildPlainSseResponse(text);
    expect(assembleFromSse(raw)).toBe(text);
  });

  it("preserves :::blocks fences verbatim", () => {
    const text = [
      "Summary",
      "",
      ":::blocks",
      JSON.stringify([{ type: "text", content: "Block body" }]),
      ":::",
    ].join("\n");
    const raw = buildPlainSseResponse(text);
    const assembled = assembleFromSse(raw);
    expect(assembled).toContain(":::blocks");
    expect(assembled).toContain('"type":"text"');
  });

  it("terminates on [DONE] without leaking marker into content", () => {
    const raw = buildPlainSseResponse("done");
    expect(raw).toContain("data: [DONE]");
    expect(assembleFromSse(raw)).toBe("done");
    expect(assembleFromSse(raw)).not.toContain("[DONE]");
  });
});
