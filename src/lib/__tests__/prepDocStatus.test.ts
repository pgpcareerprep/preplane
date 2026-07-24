import { describe, it, expect } from "vitest";
import { resolvePrepDocStatus, prepDocStatusLabel } from "@/lib/prepDocStatus";

describe("resolvePrepDocStatus", () => {
  it("prefers explicit status", () => {
    expect(resolvePrepDocStatus("na", true)).toBe("na");
    expect(resolvePrepDocStatus("shared", false)).toBe("shared");
    expect(resolvePrepDocStatus("pending", true)).toBe("pending");
  });

  it("falls back to legacy boolean when status unset", () => {
    expect(resolvePrepDocStatus(undefined, true)).toBe("shared");
    expect(resolvePrepDocStatus(null, false)).toBe("pending");
    expect(resolvePrepDocStatus("", false)).toBe("pending");
  });
});

describe("prepDocStatusLabel", () => {
  it("labels N/A as N/A", () => {
    expect(prepDocStatusLabel("na")).toBe("N/A");
  });
});
