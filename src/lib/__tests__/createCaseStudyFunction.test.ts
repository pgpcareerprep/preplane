import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolve } from "node:path";

describe("create-case-study edge function", () => {
  const src = readFileSync(
    resolve(process.cwd(), "supabase/functions/create-case-study/index.ts"),
    "utf8",
  );

  it("uses corsHeaders in handler success and error response blocks", () => {
    const handlerBody = src.slice(src.indexOf("Deno.serve"));
    expect(handlerBody).not.toMatch(/\.\.\.cors,/);
    expect(handlerBody.match(/\.\.\.corsHeaders,\s*"Content-Type":\s*"application\/json"/g)?.length)
      .toBeGreaterThanOrEqual(2);
  });

  it("returns ok + brief payload shape", () => {
    expect(src).toContain("ok: true");
    expect(src).toContain("brief,");
  });
});
