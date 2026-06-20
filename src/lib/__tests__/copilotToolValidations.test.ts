import { describe, it, expect } from "vitest";
import {
  validateLogSubmissionArgs,
  validateCreateCaseStudyArgs,
  SUBMISSION_ROUNDS,
  SUBMISSION_OUTCOMES,
} from "@/lib/copilot/toolValidations";

describe("log_submission argument validation", () => {
  it("accepts complete valid args", () => {
    const r = validateLogSubmissionArgs({
      candidate: "Aditya Sharma",
      company: "Google",
      role: "PM Intern",
      round: "R1",
      outcome: "Cleared",
      date: "2026-06-19",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.candidate).toBe("Aditya Sharma");
      expect(r.normalized.round).toBe("R1");
    }
  });

  it("reports missing required fields", () => {
    const r = validateLogSubmissionArgs({ company: "Google" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("candidate");
      expect(r.missing.some((m) => m.includes("company"))).toBe(true);
    }
  });

  it("rejects invalid round", () => {
    const r = validateLogSubmissionArgs({
      candidate: "A",
      company: "G",
      role: "R",
      round: "R99",
      outcome: "Cleared",
      date: "2026-06-19",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid round");
  });

  it("rejects invalid outcome", () => {
    const r = validateLogSubmissionArgs({
      candidate: "A",
      company: "G",
      role: "R",
      round: "R1",
      outcome: "Unknown",
      date: "2026-06-19",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Invalid outcome");
  });

  it("allows lmp_id instead of company+role", () => {
    const r = validateLogSubmissionArgs({
      candidate: "A",
      lmp_id: "uuid-123",
      round: "Submitted",
      outcome: "Submitted",
      date: "2026-06-19",
    });
    expect(r.ok).toBe(true);
  });

  it("exports enum values used by the tool schema", () => {
    expect(SUBMISSION_ROUNDS).toContain("R1");
    expect(SUBMISSION_OUTCOMES).toContain("Cleared");
  });
});

describe("create_case_study argument validation", () => {
  it("requires company and role", () => {
    expect(validateCreateCaseStudyArgs({ company: "Stripe" }).ok).toBe(false);
    expect(validateCreateCaseStudyArgs({ role: "PM" }).ok).toBe(false);
    expect(validateCreateCaseStudyArgs({ company: "Stripe", role: "PM" }).ok).toBe(true);
  });
});
