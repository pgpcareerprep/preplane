import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const source = readFileSync(resolve(root, "src/lib/hooks/useDbData.ts"), "utf8");

describe("LMP delete wiring", () => {
  it("imports TABS before invalidating the LMP Tracker cache", () => {
    expect(source).toContain('import { TABS } from "@/lib/sheets/schema";');
    expect(source).toContain('queryKey: ["sheets", TABS.LMP_TRACKER]');
  });
});
