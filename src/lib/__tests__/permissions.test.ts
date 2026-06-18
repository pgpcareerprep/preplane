import { describe, expect, it } from "vitest";
import {
  canEditField,
  canEditFieldFinal,
  canOperateLmp,
  canPerform,
  getLmpAccessLevel,
  POC_WRITABLE_LMP_COLUMNS,
} from "../permissions";
import {
  ACTION_MATRIX,
  PERMISSION_CONTRACT_VERSION,
} from "../../../supabase/functions/_shared/permissionContract";

const assigned = {
  prep_poc: "Assigned POC",
  prep_poc_id: "00000000-0000-0000-0000-000000000001",
};

describe("canonical permission contract", () => {
  it("is versioned and drives frontend actions", () => {
    expect(PERMISSION_CONTRACT_VERSION).toBe("2026-06-18.1");
    expect(canPerform("allocator", "view_all_lmps")).toBe(true);
    expect(canPerform("poc", "delete_lmp")).toBe(false);
    expect(ACTION_MATRIX.delete_lmp).toEqual(["admin", "allocator"]);
    expect(ACTION_MATRIX.assign_outreach_poc).toEqual(["admin", "allocator"]);
  });

  it("allows privileged roles to configure any LMP", () => {
    expect(canEditField("allocator", "domain", false)).toBe(true);
    expect(canEditFieldFinal("admin", "company", "Admin", assigned)).toBe(true);
    expect(getLmpAccessLevel("allocator", "Allocator", assigned)).toBe("full");
  });

  it("limits POC writes to assigned operational fields", () => {
    expect(canEditFieldFinal("poc", "daily_progress", "Assigned POC", assigned)).toBe(true);
    expect(canEditFieldFinal("poc", "company", "Assigned POC", assigned)).toBe(false);
    expect(canEditFieldFinal("poc", "domain", "Assigned POC", assigned)).toBe(false);
    expect(canEditFieldFinal("poc", "daily_progress", "Someone Else", assigned)).toBe(false);
    expect(POC_WRITABLE_LMP_COLUMNS).toContain("daily_progress");
    expect(POC_WRITABLE_LMP_COLUMNS).toContain("company");
  });

  it("treats outreach assignment as display-only (no access, no edit)", () => {
    const outreach = { outreach_poc: "Outreach POC", outreach_poc_ids: ["out-id"] };
    expect(getLmpAccessLevel("poc", "Outreach POC", outreach, "out-id")).toBe("none");
    expect(canOperateLmp("Outreach POC", outreach, "out-id")).toBe(false);
    expect(canEditFieldFinal("poc", "daily_progress", "Outreach POC", outreach, "out-id")).toBe(false);
    expect(canEditFieldFinal("poc", "company", "Outreach POC", outreach, "out-id")).toBe(false);
  });
});
