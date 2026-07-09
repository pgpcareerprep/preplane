import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("copilot phase 3 fast path handlers", () => {
  const handlers = read("supabase/functions/_shared/fastPathHandlers.ts");
  const chat = read("services/orchestrator/copilot/chat_handler.ts");
  const voice = read("services/orchestrator/voice_handler.ts");

  it("defines shared mentor coverage and POC workload fetchers", () => {
    expect(handlers).toContain("export async function fetchMentorCoverageFastPath");
    expect(handlers).toContain("export async function fetchPocWorkloadFastPath");
    expect(handlers).toContain("operationalPocScopeName");
    expect(handlers).toContain("lmpMatchesOperationalPoc");
  });

  it("chat and voice copilot import shared fast path handlers", () => {
    expect(chat).toContain("fetchMentorCoverageFastPath");
    expect(chat).toContain("fetchPocWorkloadFastPath");
    expect(voice).toContain("formatMentorCoverageVoice");
    expect(voice).toContain("formatPocWorkloadVoice");
  });

  it("chat copilot resolves effective read scope for view-as", () => {
    expect(chat).toContain("resolveViewAsEffectiveRole");
    expect(chat).toContain("context.effectiveRole = effectiveRole");
    expect(chat).toContain("context.effectiveName = effectiveName");
  });
});
