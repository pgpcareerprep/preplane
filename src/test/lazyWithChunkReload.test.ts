import { describe, expect, it } from "vitest";
import { isStaleChunkError } from "@/lib/lazyWithChunkReload";

describe("isStaleChunkError", () => {
  it("detects Vite dynamic import fetch failures", () => {
    expect(
      isStaleChunkError(
        new TypeError("Failed to fetch dynamically imported module: https://example.com/assets/Page-abc.js"),
      ),
    ).toBe(true);
  });

  it("detects webpack-style chunk errors", () => {
    expect(isStaleChunkError(new Error("Loading chunk 42 failed."))).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isStaleChunkError(new Error("Network request failed"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });
});
