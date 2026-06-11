import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { canEditFieldFinal, canPerform, getLmpAccessLevel } from "@/lib/permissions";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");
const owned = { prep_poc: "Kriti Sharma" };
const other = { prep_poc: "Vidhu" };

describe("LMP card edit and delete permissions", () => {
  it("keeps privileged management actions independent of ownership", () => {
    for (const role of ["admin", "allocator"] as const) {
      expect(getLmpAccessLevel(role, "Manager", other)).toBe("full");
      expect(canPerform(role, "edit_lmp")).toBe(true);
      expect(canPerform(role, "delete_lmp")).toBe(true);
      expect(canEditFieldFinal(role, "company", "Manager", other)).toBe(true);
      expect(canEditFieldFinal(role, "role", "Manager", other)).toBe(true);
      expect(canEditFieldFinal(role, "domain", "Manager", other)).toBe(true);
    }
  });

  it("allows assigned POC operational edits but blocks delete, assignment, and domain edits", () => {
    expect(getLmpAccessLevel("poc", "Kriti Sharma", owned)).toBe("full");
    expect(canPerform("poc", "edit_lmp")).toBe(true);
    expect(canPerform("poc", "delete_lmp")).toBe(false);
    expect(canPerform("poc", "assign_poc")).toBe(false);
    expect(canPerform("poc", "reassign_poc")).toBe(false);
    expect(canPerform("poc", "assign_outreach_poc")).toBe(false);
    expect(canEditFieldFinal("poc", "company", "Kriti Sharma", owned)).toBe(true);
    expect(canEditFieldFinal("poc", "role", "Kriti Sharma", owned)).toBe(true);
    expect(canEditFieldFinal("poc", "domain", "Kriti Sharma", owned)).toBe(false);
    expect(getLmpAccessLevel("poc", "Kriti Sharma", other)).toBe("summary");
  });

  it("separates Edit/Delete checks and preserves privileged view-as authority", () => {
    const list = read("src/components/lmp/LmpCardList.tsx");
    const card = read("src/components/lmp/LmpCard.tsx");
    const hook = read("src/lib/hooks/usePermissions.ts");
    expect(list).toContain("canEdit: canEditLmp");
    expect(list).toContain("canDelete: canDeleteLmp");
    expect(list).not.toContain('canPerform(role, "delete_lmp") && mode === "action"');
    expect(card).toContain("const { canEdit, canDelete, canAssignPoc, canChangeStatus }");
    expect(hook).toContain('canEdit: !isReadOnly && accessLevel === "full"');
    expect(hook).toContain("const isReadOnly = isPrivileged ? false : accessLevel === \"summary\"");
    expect(read("src/lib/lmpViewingContext.tsx")).toContain('if (role === "admin" || role === "allocator") return "action"');
  });

  it("removes assigned-POC LMP delete RLS and preserves Sheet delete queue wiring", () => {
    const migration = read("supabase/migrations/20260611210000_remove_poc_lmp_delete_policy.sql");
    const deletion = read("src/lib/hooks/useDbData.ts");
    expect(migration).toContain('DROP POLICY IF EXISTS "Assigned POCs can delete lmp_processes"');
    expect(migration).not.toContain("CREATE POLICY");
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(deletion).toContain("tg_lmp_process_delete_sheet_sync");
    expect(deletion).toContain('.from("lmp_processes").delete().eq("id", lmpId)');
  });

  it("preserves mentor phone values from the database", () => {
    const mapper = read("src/components/lmp/detail/mentors/mapDbMentor.ts");
    expect(mapper).toContain("phone: m.phone");
    expect(mapper).toContain("contact_number");
    expect(mapper).toContain("mentor_phone");
  });
});
