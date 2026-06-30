import { describe, it, expect } from "vitest";
import { parseBlocks, type CopilotBlock } from "@/lib/copilotBlocks";
import {
  blockToLines,
  isCopilotMultiReportPdfRequest,
  isCopilotPdfExportRequest,
  resolveCopilotReportSections,
} from "@/lib/copilot/copilotPdfExport";

describe("blockToLines (PDF export)", () => {
  it("renders case-study-card fields", () => {
    const block: CopilotBlock = {
      type: "case-study-card",
      company: "Stripe",
      role: "Product Manager",
      domain: "PM",
      situation: "Stripe is expanding into SMB lending.",
      prompt: "Should Stripe launch this product?",
      rubric: [{ criterion: "Structure", weight: 0.25, description: "Clear framework" }],
      model_answer_outline: ["Clarify objective", "Size market"],
    };
    const lines = blockToLines(block);
    expect(lines.some((l) => l.includes("Stripe"))).toBe(true);
    expect(lines.some((l) => l.includes("Situation:"))).toBe(true);
    expect(lines.some((l) => l.includes("Rubric"))).toBe(true);
    expect(lines.some((l) => l.includes("Outline:"))).toBe(true);
  });

  it("renders pipeline-card stages", () => {
    const block: CopilotBlock = {
      type: "pipeline-card",
      title: "Candidate Pipeline",
      entity: "Aditya → Google PM",
      stages: [{ name: "Applied", count: 10 }, { name: "R1", count: 5, active: true }],
      current_stage: "R1",
    };
    const lines = blockToLines(block);
    expect(lines).toContain("Candidate Pipeline");
    expect(lines.some((l) => l.includes("Applied: 10"))).toBe(true);
  });

  it("renders info-card fields", () => {
    const block: CopilotBlock = {
      type: "info-card",
      title: "Google · PM Intern",
      fields: [{ label: "Domain", value: "Product" }, { label: "Status", value: "Ongoing" }],
      status: { label: "Ongoing", color: "orange" },
    };
    const lines = blockToLines(block);
    expect(lines.some((l) => l.includes("Domain: Product"))).toBe(true);
    expect(lines.some((l) => l.includes("Status: Ongoing"))).toBe(true);
  });

  it("returns empty for unknown block types", () => {
    const { blocks } = parseBlocks(`:::blocks\n${JSON.stringify([{ type: "plan-card", plan_id: "p", goal: "g", steps: [] }])}\n:::`);
    expect(blockToLines(blocks[0])).toEqual([]);
  });

  it("preserves executive-summary regression", () => {
    const block: CopilotBlock = { type: "executive-summary", content: "Pipeline is healthy." };
    expect(blockToLines(block)).toEqual(["Pipeline is healthy."]);
  });
});

describe("PDF export intent detection", () => {
  it("single-message export for download this as pdf", () => {
    expect(isCopilotPdfExportRequest("download this as pdf")).toBe(true);
    expect(isCopilotMultiReportPdfRequest("download this as pdf")).toBe(false);
  });

  it("multi-report for combine last N answers", () => {
    expect(isCopilotMultiReportPdfRequest("combine the last 2 answers into a pdf")).toBe(true);
    expect(isCopilotPdfExportRequest("combine the last 2 answers into a pdf")).toBe(false);
  });

  it("resolves last N assistant sections", () => {
    const result = resolveCopilotReportSections("combine the last 2 answers into a pdf", [
      { role: "assistant", content: "First answer" },
      { role: "assistant", content: "Second answer" },
      { role: "assistant", content: "Third answer" },
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sections).toHaveLength(2);
      expect(result.sections[0].content).toBe("Second answer");
      expect(result.sections[1].content).toBe("Third answer");
    }
  });

  it("clarifies ambiguous multi-report requests", () => {
    const result = resolveCopilotReportSections("build me a report on unknown topic xyz", [
      { role: "assistant", content: "Unrelated analytics summary" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.clarify).toMatch(/last 2 answers/i);
  });
});

describe("PDF details fence leak guard", () => {
  it("second parseBlocks pass recovers blocks from leftover fence in plainText", () => {
    const inner = JSON.stringify([{ type: "text", content: "Should not leak raw JSON" }]);
    const content = `:::blocks\n${JSON.stringify([{ type: "executive-summary", content: "Summary only" }])}\n:::\n:::blocks\n${inner}\n:::`;
    const first = parseBlocks(content);
    expect(first.blocks).toHaveLength(1);
    expect(first.plainText).toContain(":::blocks");

    const second = parseBlocks(first.plainText);
    expect(second.blocks.some((b) => b.type === "text")).toBe(true);
    expect(second.plainText).not.toContain(":::blocks");
  });

  it("stripBlocksFence removes unparseable fence spans", () => {
    const leaky = 'Some intro\n:::blocks\n[{"broken": true}\n:::\nTail text';
    const stripped = leaky.replace(/:::blocks[\s\S]*?:::/g, "").trim();
    expect(stripped).not.toContain(":::blocks");
    expect(stripped).toContain("Some intro");
    expect(stripped).toContain("Tail text");
  });
});
