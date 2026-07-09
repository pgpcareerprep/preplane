import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

/** Mirrors supabase/functions/_shared/viewAsRole.ts */
function moreRestrictiveRole(a: string, b: string): string {
  const PRIVILEGE: Record<string, number> = { poc: 0, allocator: 1, admin: 2 };
  const pa = PRIVILEGE[a] ?? 0;
  const pb = PRIVILEGE[b] ?? 0;
  return pa <= pb ? a : b;
}

describe("copilot phase 1 security wiring", () => {
  it("removes voiceCopilotBridge global from voice-copilot", () => {
    const voice = read("services/orchestrator/voice_handler.ts");
    expect(voice).not.toContain("voiceCopilotBridge");
    expect(voice).toContain("voiceRequestStateStorage");
    expect(voice).toContain("resolveViewAsEffectiveRole");
  });

  it("stages pending writes server-side in runtime", () => {
    const runtime = read("services/orchestrator/copilot/tools/runtime.ts");
    expect(runtime).toContain("stagePendingAction");
    expect(runtime).toContain("claimPendingActionForExecution");
    expect(runtime).not.toContain("stateless flow requires both");
  });

  it("voice confirm executes by pending_action_id only", () => {
    const voice = read("services/orchestrator/voice_handler.ts");
    expect(voice).toContain('execute_pending", { pending_action_id: confirmId }');
    expect(voice).toContain("LEGACY_CONFIRM_REJECTED");
  });

  it("downgrades claimed view-as role to more restrictive value", () => {
    expect(moreRestrictiveRole("admin", "poc")).toBe("poc");
    expect(moreRestrictiveRole("poc", "admin")).toBe("poc");
    expect(moreRestrictiveRole("allocator", "poc")).toBe("poc");
  });
});
