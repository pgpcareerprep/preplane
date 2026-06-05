import { describe, it, expect } from "vitest";
import { parseBlocks } from "@/lib/copilotBlocks";

describe("parseBlocks (Copilot acceptance suite)", () => {
  it("returns empty blocks and original text when no fence is present", () => {
    const { blocks, plainText } = parseBlocks("Hello, no blocks here.");
    expect(blocks).toEqual([]);
    expect(plainText).toBe("Hello, no blocks here.");
  });

  it("parses a valid kpi-row block and strips the fence from text", () => {
    const content = `Here is your summary.\n:::blocks\n${JSON.stringify([
      { type: "kpi-row", items: [{ label: "Total", value: 42 }] },
    ])}\n:::`;
    const { blocks, plainText } = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("kpi-row");
    expect(plainText).toBe("Here is your summary.");
  });

  it("filters out unknown / malformed blocks instead of crashing", () => {
    const content = `:::blocks\n${JSON.stringify([
      { type: "totally-unknown-block", foo: 1 },
      { type: "text", content: "ok" },
      null,
      "not-an-object",
      { missing: "type" },
    ])}\n:::`;
    const { blocks } = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("text");
  });

  it("returns no blocks (rather than throwing) for malformed JSON mid-stream", () => {
    const content = `:::blocks\n[{"type":"kpi-row","items":[\n:::`;
    const { blocks } = parseBlocks(content);
    // Either empty or partially recovered — must NEVER throw.
    expect(Array.isArray(blocks)).toBe(true);
  });

  it("accepts the new plan-card and mentor-shortlist-card block types", () => {
    const content = `:::blocks\n${JSON.stringify([
      {
        type: "plan-card",
        plan_id: "p_1",
        goal: "Find mentors",
        steps: [{ id: "s1", title: "Resolve mentor", status: "pending" }],
      },
      {
        type: "mentor-shortlist-card",
        for_company: "Acme",
        for_role: "PM",
        shortlist: [],
      },
    ])}\n:::`;
    const { blocks } = parseBlocks(content);
    expect(blocks.map((b) => b.type)).toEqual([
      "plan-card",
      "mentor-shortlist-card",
    ]);
  });
});
