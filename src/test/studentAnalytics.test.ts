/**
 * Tests for src/lib/studentAnalytics.ts
 *
 * Covers:
 *   - normalizePlacementStatus
 *   - isOptedOutStatus (all known opt-out labels, positive cases, edge cases)
 *   - getStudentIdentityKey (id preference, email fallback, name last resort)
 */

import { describe, it, expect } from "vitest";
import {
  normalizePlacementStatus,
  isOptedOutStatus,
  OPTED_OUT_STATUSES,
  getStudentIdentityKey,
  getCanonicalStudentIdentity,
  isCandidatePipelineConverted,
} from "@/lib/studentAnalytics";

/* ─────────────────────────────── normalizePlacementStatus ─────────────────── */

describe("normalizePlacementStatus", () => {
  it("returns empty string for null", () => expect(normalizePlacementStatus(null)).toBe(""));
  it("returns empty string for undefined", () => expect(normalizePlacementStatus(undefined)).toBe(""));
  it("returns empty string for empty string", () => expect(normalizePlacementStatus("")).toBe(""));
  it("trims whitespace", () => expect(normalizePlacementStatus("  Opted Out  ")).toBe("opted out"));
  it("lowercases", () => expect(normalizePlacementStatus("WITHDRAWN")).toBe("withdrawn"));
  it("handles mixed case with spaces", () => expect(normalizePlacementStatus("  Dropped Out  ")).toBe("dropped out"));
});

/* ─────────────────────────────── isOptedOutStatus ─────────────────────────── */

describe("isOptedOutStatus", () => {
  // All OPTED_OUT_STATUSES entries should return true regardless of case/whitespace
  for (const s of OPTED_OUT_STATUSES) {
    it(`recognises "${s}" as opted-out`, () => expect(isOptedOutStatus(s)).toBe(true));
    it(`recognises upper-cased "${s.toUpperCase()}" as opted-out`, () => expect(isOptedOutStatus(s.toUpperCase())).toBe(true));
    it(`recognises padded " ${s} " as opted-out`, () => expect(isOptedOutStatus(` ${s} `)).toBe(true));
  }

  it("returns false for null", () => expect(isOptedOutStatus(null)).toBe(false));
  it("returns false for undefined", () => expect(isOptedOutStatus(undefined)).toBe(false));
  it("returns false for empty string", () => expect(isOptedOutStatus("")).toBe(false));
  it("returns false for active placement status", () => expect(isOptedOutStatus("Active")).toBe(false));
  it("returns false for 'Placed'", () => expect(isOptedOutStatus("Placed")).toBe(false));
  it("returns false for 'In Progress'", () => expect(isOptedOutStatus("In Progress")).toBe(false));
  it("returns false for partial match 'opted'", () => expect(isOptedOutStatus("opted")).toBe(false));
  it("returns false for 'withdrawal' (not in set)", () => expect(isOptedOutStatus("withdrawal")).toBe(false));
});

/* ─────────────────────────────── getStudentIdentityKey ────────────────────── */

describe("getStudentIdentityKey", () => {
  it("prefers id when present", () => {
    expect(getStudentIdentityKey({ id: "abc-123", email: "a@b.com", name: "Alice" })).toBe("id:abc-123");
  });

  it("falls back to email when id is null", () => {
    expect(getStudentIdentityKey({ id: null, email: "alice@example.com", name: "Alice" })).toBe("email:alice@example.com");
  });

  it("falls back to email when id is undefined", () => {
    expect(getStudentIdentityKey({ id: undefined, email: "alice@example.com", name: "Alice" })).toBe("email:alice@example.com");
  });

  it("lowercases email", () => {
    expect(getStudentIdentityKey({ id: null, email: "Alice@Example.COM", name: "Alice" })).toBe("email:alice@example.com");
  });

  it("trims whitespace from email", () => {
    expect(getStudentIdentityKey({ id: null, email: "  alice@x.com  ", name: "Alice" })).toBe("email:alice@x.com");
  });

  it("falls back to name when id and email are absent", () => {
    expect(getStudentIdentityKey({ name: "Bob Smith" })).toBe("name:bob smith");
  });

  it("falls back to name when id is null and email is null", () => {
    expect(getStudentIdentityKey({ id: null, email: null, name: "Bob Smith" })).toBe("name:bob smith");
  });

  it("falls back to name when email is empty string", () => {
    expect(getStudentIdentityKey({ id: null, email: "", name: "Carol" })).toBe("name:carol");
  });

  it("lowercases and trims name in fallback", () => {
    expect(getStudentIdentityKey({ id: null, email: null, name: "  Dave Jones  " })).toBe("name:dave jones");
  });

  it("two students with same name get the same key (name fallback)", () => {
    const k1 = getStudentIdentityKey({ id: null, email: null, name: "Priya Kumar" });
    const k2 = getStudentIdentityKey({ id: null, email: null, name: "Priya Kumar" });
    expect(k1).toBe(k2);
  });

  it("two students with different ids get different keys", () => {
    const k1 = getStudentIdentityKey({ id: "id-1", email: "same@x.com", name: "Same Name" });
    const k2 = getStudentIdentityKey({ id: "id-2", email: "same@x.com", name: "Same Name" });
    expect(k1).not.toBe(k2);
  });

  it("id key does not conflict with email key", () => {
    const idKey = getStudentIdentityKey({ id: "alice@example.com", name: "Alice" });
    const emailKey = getStudentIdentityKey({ id: null, email: "alice@example.com", name: "Alice" });
    expect(idKey).not.toBe(emailKey);
    expect(idKey.startsWith("id:")).toBe(true);
    expect(emailKey.startsWith("email:")).toBe(true);
  });
});

describe("isCandidatePipelineConverted", () => {
  it("accepts pipeline converted and legacy aliases", () => {
    expect(isCandidatePipelineConverted({ pipelineStage: "converted" })).toBe(true);
    expect(isCandidatePipelineConverted({ pipelineStage: "offer" })).toBe(true);
    expect(isCandidatePipelineConverted({ pipeline_stage: "accepted" })).toBe(true);
  });

  it("rejects non-converted stages", () => {
    expect(isCandidatePipelineConverted({ pipelineStage: "r2" })).toBe(false);
    expect(isCandidatePipelineConverted({ pipelineStage: "pool" })).toBe(false);
  });
});

describe("getCanonicalStudentIdentity", () => {
  it("collapses candidate id-key and name-key for the same student", () => {
    const student = { id: "stu-1", email: "dev@school.com", name: "Devavrat Bhotica" };
    const fromCandidate = getCanonicalStudentIdentity(
      { studentId: "stu-1", email: "dev@school.com", studentName: "Devavrat Bhotica" },
      student,
    );
    const fromNameOnly = getCanonicalStudentIdentity(
      { studentId: null, email: null, studentName: "Devavrat Bhotica" },
      student,
    );
    expect(fromCandidate).toBe("id:stu-1");
    expect(fromNameOnly).toBe("id:stu-1");
    expect(fromCandidate).toBe(fromNameOnly);
  });
});
