import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("copilot phase 2 voice delegation", () => {
  const voice = read("supabase/functions/voice-copilot/index.ts");

  it("routes reads through shared copilot tool runtime", () => {
    expect(voice).toContain("runSharedCopilotTool");
    expect(voice).toContain("withCopilotRequestState");
    expect(voice).not.toContain("async function execListEntities");
    expect(voice).not.toContain("async function execSearchLmp");
    expect(voice).not.toContain("async function executePending");
  });

  it("does not perform direct LMP table writes in voice-copilot", () => {
    expect(voice).not.toMatch(/from\("lmp_processes"\)\.update/);
    expect(voice).not.toMatch(/from\("lmp_processes"\)\.insert/);
    expect(voice).not.toMatch(/from\("lmp_processes"\)\.delete/);
  });

  it("fast paths use shared handlers module", () => {
    expect(voice).toContain("fetchMentorCoverageFastPath");
    expect(voice).toContain("fetchPocWorkloadFastPath");
    expect(voice).not.toContain('runSharedCopilotTool("search_lmp_records"');
  });

  it("request context passes effective read-scoping fields", () => {
    expect(voice).toContain("effectiveRole = vs.effectiveRole");
    expect(voice).toContain("effectiveName = vs.effectiveName");
  });
});
