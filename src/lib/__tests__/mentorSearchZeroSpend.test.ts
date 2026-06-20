import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../../..");

function read(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

describe("zero-spend mentor search wiring", () => {
  it("external-mentor-search uses ZERO_SPEND provider stack, not hosted Firecrawl", () => {
    const src = read("supabase/functions/external-mentor-search/index.ts");
    expect(src).toContain("assertZeroSpendConfig");
    expect(src).toContain("cachedSearch");
    expect(src).toContain("cachedScrape");
    expect(src).not.toContain("api.firecrawl.dev");
  });

  it("mentor-profile-enrich uses shared free providers", () => {
    const src = read("supabase/functions/mentor-profile-enrich/index.ts");
    expect(src).toContain("GEMINI_API_KEY");
    expect(src).toContain("cachedSearch");
    expect(src).not.toContain("FIRECRAWL_API_KEY");
    expect(src).not.toContain("api.firecrawl.dev");
  });

  it("provider registry skips paid providers under ZERO_SPEND", () => {
    const config = read("supabase/functions/_shared/providers/config.ts");
    const registry = read("supabase/functions/_shared/providers/registry.ts");
    expect(config).toContain("ZERO_SPEND = true");
    expect(registry).toContain("zero_spend");
  });

  it("externalMentors preserves backward-compatible envelope", () => {
    const src = read("src/lib/externalMentors.ts");
    expect(src).toContain("external-mentor-search");
    expect(src).toContain("confidence?: number");
  });
});
