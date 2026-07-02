import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("copilot phase 4 deterministic confirm", () => {
  const index = read("supabase/functions/copilot-ai/index.ts");
  const page = read("src/pages/CopilotPage.tsx");
  const card = read("src/components/copilot/CopilotConfirmationCard.tsx");
  const engine = read("src/lib/copilotEngine.ts");

  it("server short-circuits confirm/cancel with pending_action_id", () => {
    expect(index).toContain("deterministic_confirm");
    expect(index).toContain("cancelPendingAction");
    expect(index).toContain('executeTool("execute_pending"');
    expect(index).toContain("cancel_action === true");
  });

  it("client invokes deterministic pending actions", () => {
    expect(engine).toContain("invokeCopilotPendingAction");
    expect(engine).toContain("confirm_action: kind === \"confirm\"");
    expect(engine).toContain("cancel_action: kind === \"cancel\"");
    expect(page).toContain("handleConfirmPending");
    expect(page).toContain("handleCancelPending");
    expect(card).toContain("onConfirmPending");
    expect(card).toContain("onCancelPending");
  });
});

describe("voice phonetic glossary helpers", () => {
  it("builds alias lines from poc_profiles rows", async () => {
    const mod = await import("../../../supabase/functions/_shared/voicePhoneticGlossary.ts");
    const block = mod.buildVoiceNameNormalizationBlock([
      { name: "Ada Lovelace", aliases: ["ada", "lady ada"], primary_domain: "PM" },
    ]);
    expect(block).toContain("ada, lady ada -> Ada Lovelace");
  });
});

describe("copilot phase 5 voice glossary", () => {
  const voice = read("supabase/functions/voice-copilot/index.ts");

  it("removes hardcoded person names from voice system prompt", () => {
    expect(voice).not.toContain("Sonali Awasthi");
    expect(voice).not.toContain("Vidit Jain");
    expect(voice).not.toContain("kirti|kirti");
    expect(voice).toContain("buildVoiceNameNormalizationBlock");
    expect(voice).toContain("poc_profiles");
    expect(voice).toContain("aliases");
  });
});
