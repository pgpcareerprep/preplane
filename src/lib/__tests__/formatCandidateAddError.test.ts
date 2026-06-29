import { describe, expect, it } from "vitest";
import { formatCandidateAddError } from "@/lib/hooks/useDbData";

describe("formatCandidateAddError", () => {
  it("maps RLS failures to operational POC guidance", () => {
    const msg = formatCandidateAddError(
      new Error('new row violates row-level security policy for table "lmp_candidates"'),
    );
    expect(msg).toContain("not linked as an operational POC");
  });

  it("passes through other errors", () => {
    expect(formatCandidateAddError(new Error("Network timeout"))).toBe("Network timeout");
  });
});
