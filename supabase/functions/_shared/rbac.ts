// Centralized RBAC rules for copilot edge functions.
// Mirrors src/lib/permissions.ts ACTION_MATRIX (subset that matters server-side).
//
// IMPORTANT: When you add a new write action in the copilot, add it here AND in
// src/lib/permissions.ts so client and server stay in lockstep.

export type Role = "admin" | "allocator" | "poc";

export type CopilotPermissionAction =
  // reads — generally permitted for everyone with copilot access
  | "copilot_summarize"
  | "copilot_search"
  | "copilot_analyze"
  // writes — must be gated server-side before tool execution
  | "create_lmp"
  | "edit_lmp"
  | "delete_lmp"
  | "assign_poc"
  | "reassign_poc"
  | "change_status"
  | "change_domain"
  | "edit_remarks"
  | "edit_daily_progress"
  | "upload_jd"
  | "assign_mentor"
  | "bulk_update";

const MATRIX: Record<CopilotPermissionAction, Role[]> = {
  copilot_summarize: ["admin", "allocator", "poc"],
  copilot_search:    ["admin", "allocator", "poc"],
  copilot_analyze:   ["admin", "allocator", "poc"],

  create_lmp:        ["admin", "allocator"],
  edit_lmp:          ["admin", "allocator", "poc"],
  delete_lmp:        ["admin"],
  assign_poc:        ["admin", "allocator"],
  reassign_poc:      ["admin", "allocator"],
  change_status:     ["admin", "allocator", "poc"],
  change_domain:     ["admin", "allocator"],
  edit_remarks:      ["admin", "allocator", "poc"],
  edit_daily_progress: ["admin", "allocator", "poc"],
  upload_jd:         ["admin", "allocator"],
  assign_mentor:     ["admin", "allocator"],
  bulk_update:       ["admin"],
};

const SAFE_ALTERNATIVES: Partial<Record<CopilotPermissionAction, string>> = {
  delete_lmp:    "Ask an admin to delete this LMP, or mark its status as 'Closed' instead.",
  create_lmp:    "Send the new LMP details to your admin/allocator to create it for you.",
  bulk_update:   "Update records one at a time, or request an admin to run the bulk operation.",
  assign_poc:    "Suggest the assignment to your allocator/admin — they can confirm it.",
  reassign_poc:  "Ask your allocator/admin to reassign the POC.",
  change_domain: "Flag the domain change to a allocator/admin for approval.",
  upload_jd:     "Share the JD with your allocator/admin and they can attach it.",
  assign_mentor: "Recommend the mentor to your allocator/admin for assignment.",
};

const HUMAN_LABEL: Record<CopilotPermissionAction, string> = {
  copilot_summarize: "summarize", copilot_search: "search", copilot_analyze: "analyze",
  create_lmp: "create an LMP process", edit_lmp: "edit this LMP", delete_lmp: "delete an LMP",
  assign_poc: "assign a POC", reassign_poc: "reassign a POC",
  change_status: "change status", change_domain: "change domain",
  edit_remarks: "edit remarks", edit_daily_progress: "edit daily progress",
  upload_jd: "upload a JD", assign_mentor: "assign a mentor",
  bulk_update: "perform a bulk update",
};

export type PermissionResult = {
  allowed: boolean;
  role: Role;
  action: CopilotPermissionAction;
  reason?: string;
  safe_alternative?: string;
  human_action?: string;
};

export function checkPermission(role: string | undefined, action: string): PermissionResult {
  const r = (role as Role) || "poc";
  const a = action as CopilotPermissionAction;
  const allowedRoles = MATRIX[a];
  if (!allowedRoles) {
    return { allowed: false, role: r, action: a, reason: `Unknown action: ${action}`, human_action: action };
  }
  const allowed = allowedRoles.includes(r);
  return {
    allowed,
    role: r,
    action: a,
    human_action: HUMAN_LABEL[a] ?? a,
    reason: allowed
      ? undefined
      : `Role "${r}" cannot ${HUMAN_LABEL[a] ?? a}. Allowed roles: ${allowedRoles.join(", ")}.`,
    safe_alternative: allowed ? undefined : SAFE_ALTERNATIVES[a],
  };
}

/** Returns true if the role can execute this write action. Use as a guard before any state-changing tool. */
export function canWrite(role: string | undefined, action: CopilotPermissionAction): boolean {
  return checkPermission(role, action).allowed;
}
