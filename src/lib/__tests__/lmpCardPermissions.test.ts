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

  it("limits POC edit and delete actions to assigned LMPs and blocks domain edits", () => {
    expect(getLmpAccessLevel("poc", "Kriti Sharma", owned)).toBe("full");
    expect(canPerform("poc", "edit_lmp")).toBe(true);
    expect(canPerform("poc", "delete_lmp")).toBe(true);
    expect(canEditFieldFinal("poc", "company", "Kriti Sharma", owned)).toBe(true);
    expect(canEditFieldFinal("poc", "role", "Kriti Sharma", owned)).toBe(true);
    expect(canEditFieldFinal("poc", "domain", "Kriti Sharma", owned)).toBe(false);
    expect(getLmpAccessLevel("poc", "Kriti Sharma", other)).toBe("summary");
  });

  it("separates Edit and Delete menu checks and keeps view-as read-only", () => {
    const list = read("src/components/lmp/LmpCardList.tsx");
    const card = read("src/components/lmp/LmpCard.tsx");
    const hook = read("src/lib/hooks/usePermissions.ts");
    expect(list).toContain("canEdit: canEditLmp");
    expect(list).toContain("canDelete: canDeleteLmp");
    expect(list).not.toContain('canPerform(role, "delete_lmp") && mode === "action"');
    expect(card).toContain("const { canEdit, canDelete }");
    expect(hook).toContain('canEdit: !isReadOnly && accessLevel === "full"');
    expect(hook).toContain("const isReadOnly = isViewingAsOther || accessLevel === \"summary\"");
  });

  it("restores assigned-POC delete RLS and preserves Sheet delete queue wiring", () => {
    const migration = read("supabase/migrations/20260611200000_restore_assigned_poc_lmp_delete.sql");
    const deletion = read("src/lib/hooks/useDbData.ts");
    expect(migration).toContain("public.is_assigned_to_lmp(id)");
    expect(migration).toContain("'poc'::public.app_role");
    expect(migration).not.toMatch(/DISABLE ROW LEVEL SECURITY/i);
    expect(deletion).toContain("tg_lmp_process_delete_sheet_sync");
    expect(deletion).toContain('.from("lmp_processes").delete().eq("id", lmpId)');
  });
});
