import { describe, expect, it } from "vitest";
import {
  formatLmpLabel,
  lmpKeyFromArgs,
  validateChatWriteKind,
  validateVoicePrepareWrite,
} from "../../../supabase/functions/_shared/lmpWriteValidation";

describe("lmpWriteValidation", () => {
  it("formatLmpLabel never emits undefined", () => {
    expect(formatLmpLabel("test", undefined)).toBe("test");
    expect(formatLmpLabel(undefined, "PM")).toBe("PM");
    expect(formatLmpLabel(undefined, undefined)).toBe("the LMP");
    expect(formatLmpLabel("Acme", "Engineer")).toBe("Acme – Engineer");
  });

  it("rejects voice prepare_write when role is missing", () => {
    const r = validateVoicePrepareWrite({
      action: "update_lmp_field",
      company: "test",
      field: "Daily Progress",
      value: "still in progress",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain("role");
      expect(r.ask).toMatch(/company name and the role/i);
    }
  });

  it("accepts valid voice daily-progress staging payload", () => {
    const r = validateVoicePrepareWrite({
      action: "update_lmp_field",
      company: "test",
      role: "Product Manager",
      field: "Daily Progress",
      value: "its still in progress",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.normalized.company).toBe("test");
      expect(r.normalized.role).toBe("Product Manager");
    }
  });

  it("lmpKeyFromArgs returns typed error instead of throwing", () => {
    const r = lmpKeyFromArgs({ company: "only" });
    expect("error" in r).toBe(true);
    if ("error" in r) expect(r.code).toBe("invalid_lmp_key");
  });

  it("rejects chat prepare_write payload missing company", () => {
    const r = validateChatWriteKind("update_lmp_field", {
      role: "PM",
      fields: { "Daily Progress": "ok" },
    });
    expect(r.ok).toBe(false);
  });
});
