import { describe, expect, it } from "vitest";
import {
  normalizeNextProgressType,
  normalizeNextProgressTypeForSheet,
  NEXT_PROGRESS_TYPES,
} from "@/lib/nextProgressType";

describe("nextProgressType", () => {
  it("keeps blank values blank", () => {
    expect(normalizeNextProgressType("")).toBe("");
    expect(normalizeNextProgressType(null)).toBe("");
    expect(normalizeNextProgressType(undefined)).toBe("");
  });

  it("normalizes legacy Follow-up spellings", () => {
    expect(normalizeNextProgressType("Follow-up")).toBe("Follow - Up");
    expect(normalizeNextProgressType("Follow-Up")).toBe("Follow - Up");
    expect(normalizeNextProgressType("Follow up")).toBe("Follow - Up");
  });

  it("normalizes movement labels", () => {
    expect(normalizeNextProgressType("Movement")).toBe("Moved to next round");
    expect(normalizeNextProgressType("Moved to Next Round")).toBe("Moved to next round");
  });

  it("preserves canonical sheet values", () => {
    for (const value of NEXT_PROGRESS_TYPES) {
      expect(normalizeNextProgressType(value)).toBe(value);
      expect(normalizeNextProgressTypeForSheet(value)).toBe(value);
    }
  });

  it("writes blank to sheet when type is empty", () => {
    expect(normalizeNextProgressTypeForSheet("Follow-up")).toBe("Follow - Up");
    expect(normalizeNextProgressTypeForSheet("")).toBe("");
  });
});
