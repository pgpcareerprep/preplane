import { describe, it, expect } from "vitest";
import { parseBlocks, isIncompleteBlocksFence } from "@/lib/copilotBlocks";

describe("parseBlocks (Copilot acceptance suite)", () => {
  it("returns empty blocks and original text when no fence is present", () => {
    const { blocks, plainText } = parseBlocks("Hello, no blocks here.");
    expect(blocks).toEqual([]);
    expect(plainText).toBe("Hello, no blocks here.");
  });

  it("hides a dangling blocks marker instead of rendering it", () => {
    const { blocks, plainText, fenceDetected } = parseBlocks("There are no converted processes.\n:::blocks");
    expect(blocks).toEqual([]);
    expect(plainText).toBe("There are no converted processes.");
    expect(fenceDetected).toBe(true);
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

  it("normalizes table blocks missing headers/rows so renderers never crash", () => {
    const content = `:::blocks\n${JSON.stringify([
      { type: "table", title: "LMP processes" },
    ])}\n:::`;
    const { blocks } = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("table");
    if (blocks[0].type === "table") {
      expect(blocks[0].headers).toEqual([]);
      expect(blocks[0].rows).toEqual([]);
    }
  });

  it("normalizes plan-card blocks missing steps", () => {
    const content = `:::blocks\n${JSON.stringify([
      { type: "plan-card", plan_id: "p1", goal: "Find mentors" },
    ])}\n:::`;
    const { blocks } = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    if (blocks[0].type === "plan-card") {
      expect(blocks[0].steps).toEqual([]);
    }
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

  it("accepts cv-gap-card with ATS payload fields", () => {
    const content = `:::blocks\n${JSON.stringify([
      {
        type: "cv-gap-card",
        candidate_name: "Priya Sharma",
        lmp_company: "Google",
        lmp_role: "PM Intern",
        ats_score: 72,
        grade: "B",
        missing_mandatory: ["SQL"],
        missing_preferred: ["Tableau"],
        top_recommendations: ["Add quantified project outcomes", "Highlight SQL coursework"],
      },
    ])}\n:::`;
    const { blocks } = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("cv-gap-card");
    if (blocks[0].type === "cv-gap-card") {
      expect(blocks[0].ats_score).toBe(72);
      expect(blocks[0].missing_mandatory).toEqual(["SQL"]);
    }
  });

  it("accepts case-study-card with brief fields", () => {
    const content = `:::blocks\n${JSON.stringify([
      {
        type: "case-study-card",
        company: "Stripe",
        role: "Product Manager",
        domain: "PM",
        situation: "Stripe is expanding into SMB lending.",
        prompt: "Should Stripe launch this product?",
        rubric: [{ criterion: "Structure", weight: 0.25, description: "Clear framework" }],
        model_answer_outline: ["Clarify objective", "Size market", "Recommend go/no-go"],
      },
    ])}\n:::`;
    const { blocks } = parseBlocks(content);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("case-study-card");
    if (blocks[0].type === "case-study-card") {
      expect(blocks[0].company).toBe("Stripe");
      expect(blocks[0].rubric).toHaveLength(1);
    }
  });
});

describe("truncated :::blocks stream handling", () => {
  const truncated =
    ':::blocks [{"type":"executive-summary", "content": "Uber - Supply Manager (B2B ETS) is currently prep-ongoing. The primary Prep';

  it("detects incomplete fence without closing :::", () => {
    expect(isIncompleteBlocksFence(truncated)).toBe(true);
    expect(isIncompleteBlocksFence(':::blocks\n[{"type":"text","content":"ok"}]\n:::')).toBe(false);
  });

  it("salvages executive-summary from truncated stream", () => {
    const { blocks, fenceDetected } = parseBlocks(truncated);
    expect(fenceDetected).toBe(true);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("executive-summary");
    if (blocks[0].type === "executive-summary") {
      expect(blocks[0].content).toContain("Uber - Supply Manager");
    }
  });
});
