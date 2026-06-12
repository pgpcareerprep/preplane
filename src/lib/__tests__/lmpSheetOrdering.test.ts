import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("LMP Tracker newest-created-first ordering", () => {
  it("reconciles by created_at first and never by editable LMP date", () => {
    const source = read("supabase/functions/sheets-lmp/index.ts");
    const reconcile = source.slice(source.indexOf('case "lmp-reconcile"'));

    expect(reconcile).toContain('.order("created_at", { ascending: false })');
    expect(reconcile).toContain('.order("id", { ascending: false })');
    expect(reconcile).not.toContain('.order("date", { ascending: false })');
  });

  it("does not create blank intermediate rows or rewrite in chunks", () => {
    const source = read("supabase/functions/sheets-lmp/index.ts");
    const reconcile = source.slice(source.indexOf('case "lmp-reconcile"'));

    expect(reconcile).not.toContain("insertDimension");
    expect(reconcile).toContain("await batchUpdate(sortedBatch)");
    expect(reconcile).not.toContain("sortedBatch.slice");
  });

  it("claims queue jobs once and defers reconcile behind active targeted writes", () => {
    const sweeper = read("supabase/functions/sheets-retry-sweeper/index.ts");

    expect(sweeper).toContain('row.operation === "lmp-reconcile"');
    expect(sweeper).toContain('.neq("operation", "lmp-reconcile")');
    expect(sweeper).toContain('.eq("status", "pending")');
    expect(sweeper).toContain('status: "already_claimed"');
  });
});
