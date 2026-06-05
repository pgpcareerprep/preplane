/**
 * Comprehensive RBAC Permission Engine
 * Roles: admin, allocator, poc (prep_poc / outreach_poc)
 *
 * Three layers:
 * 1. Action-level: can the role perform this action?
 * 2. Record-level: can the user access this specific record?
 * 3. Field-level: can the user edit this specific field?
 */

import type { Role } from "@/lib/rolesContext";

// ─── Action Permissions ───

export type Action =
  | "view_all_lmps"
  | "view_own_lmps"
  | "view_other_poc_lmps_summary"
  | "create_lmp"
  | "edit_lmp"
  | "delete_lmp"
  | "assign_poc"
  | "reassign_poc"
  | "change_domain"
  | "change_status"
  | "edit_daily_progress"
  | "edit_prep_status"
  | "edit_mentor_status"
  | "edit_mock_status"
  | "edit_assignment_review"
  | "edit_outreach_progress"
  | "edit_remarks"
  | "view_all_students"
  | "view_own_students"
  | "view_all_pocs"
  | "view_poc_load"
  | "manage_users"
  | "manage_rbac"
  
  | "view_audit_logs"
  | "view_sync_logs"
  | "view_field_mapping"
  | "edit_field_mapping"
  | "rollback_any"
  | "rollback_own"
  | "rollback_managed"
  | "copilot_summarize"
  | "copilot_search"
  | "copilot_analyze"
  | "copilot_draft_update"
  | "copilot_execute_update"
  | "view_domains"
  | "edit_domains"
  | "view_unmapped"
  | "resolve_unmapped"
  | "allocate_poc"
  | "view_settings";

const ACTION_MATRIX: Record<Action, Role[]> = {
  // LMP
  view_all_lmps: ["admin"],
  view_own_lmps: ["admin", "allocator", "poc"],
  view_other_poc_lmps_summary: ["admin", "allocator", "poc"],
  create_lmp: ["admin", "allocator"],
  edit_lmp: ["admin", "allocator", "poc"],
  delete_lmp: ["admin"],
  assign_poc: ["admin", "allocator"],
  reassign_poc: ["admin", "allocator"],
  change_domain: ["admin", "allocator"],
  change_status: ["admin", "allocator", "poc"],
  edit_daily_progress: ["admin", "allocator", "poc"],
  edit_prep_status: ["admin", "poc"],
  edit_mentor_status: ["admin", "poc"],
  edit_mock_status: ["admin", "poc"],
  edit_assignment_review: ["admin", "poc"],
  edit_outreach_progress: ["admin", "poc"],
  edit_remarks: ["admin", "allocator", "poc"],

  // Students
  view_all_students: ["admin"],
  view_own_students: ["admin", "allocator", "poc"],

  // POCs
  view_all_pocs: ["admin", "allocator"],
  view_poc_load: ["admin", "allocator"],

  // Admin
  manage_users: ["admin"],
  manage_rbac: ["admin"],
  view_settings: ["admin"],

  // Audit / logs
  view_audit_logs: ["admin"],
  view_sync_logs: ["admin"],
  view_field_mapping: ["admin"],
  edit_field_mapping: ["admin"],

  // Rollback
  rollback_any: ["admin"],
  rollback_own: ["admin", "allocator", "poc"],
  rollback_managed: ["admin", "allocator"],

  // Copilot
  copilot_summarize: ["admin", "allocator", "poc"],
  copilot_search: ["admin", "allocator", "poc"],
  copilot_analyze: ["admin", "allocator", "poc"],
  copilot_draft_update: ["admin", "allocator", "poc"],
  copilot_execute_update: ["admin", "allocator", "poc"],

  // Domains
  view_domains: ["admin", "allocator", "poc"],
  edit_domains: ["admin", "allocator"],
  view_unmapped: ["admin"],
  resolve_unmapped: ["admin"],

  // Allocation
  allocate_poc: ["admin", "allocator"],
};

export function canPerform(role: Role, action: Action): boolean {
  return ACTION_MATRIX[action]?.includes(role) ?? false;
}

// ─── Field-Level Permissions ───

export type LmpField =
  | "company" | "role" | "domain" | "status" | "type" | "date" | "closing_date"
  | "admin_owner" | "allocator" | "prep_poc" | "support_poc" | "outreach_poc"
  | "daily_progress" | "prep_progress" | "placement_progress"
  | "r1_shortlisted" | "r2_shortlisted" | "r3_shortlisted"
  | "final_convert" | "convert_names" | "prep_doc"
  | "remarks" | "mentor_aligned" | "assignment_review"
  | "one_to_one_mock" | "behavioral_status";

type FieldPermission = {
  editable: Role[];
  /** If true, POCs can only edit if they're assigned to the LMP */
  requiresOwnership: boolean;
};

const FIELD_PERMISSIONS: Record<LmpField, FieldPermission> = {
  company: { editable: ["admin"], requiresOwnership: false },
  role: { editable: ["admin"], requiresOwnership: false },
  domain: { editable: ["admin", "allocator"], requiresOwnership: false },
  status: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  type: { editable: ["admin", "allocator"], requiresOwnership: false },
  date: { editable: ["admin"], requiresOwnership: false },
  closing_date: { editable: ["admin", "allocator"], requiresOwnership: false },
  admin_owner: { editable: ["admin"], requiresOwnership: false },
  allocator: { editable: ["admin"], requiresOwnership: false },
  prep_poc: { editable: ["admin", "allocator"], requiresOwnership: false },
  support_poc: { editable: ["admin", "allocator"], requiresOwnership: false },
  outreach_poc: { editable: ["admin", "allocator"], requiresOwnership: false },
  daily_progress: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  prep_progress: { editable: ["admin", "poc"], requiresOwnership: true },
  placement_progress: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  r1_shortlisted: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  r2_shortlisted: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  r3_shortlisted: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  final_convert: { editable: ["admin", "allocator"], requiresOwnership: false },
  convert_names: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  prep_doc: { editable: ["admin", "poc"], requiresOwnership: true },
  remarks: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  mentor_aligned: { editable: ["admin", "poc"], requiresOwnership: true },
  assignment_review: { editable: ["admin", "poc"], requiresOwnership: true },
  one_to_one_mock: { editable: ["admin", "poc"], requiresOwnership: true },
  behavioral_status: { editable: ["admin"], requiresOwnership: false },
};

export function canEditField(
  role: Role,
  field: LmpField,
  isOwner: boolean
): boolean {
  const perm = FIELD_PERMISSIONS[field];
  if (!perm) return false;
  if (!perm.editable.includes(role)) return false;
  if (perm.requiresOwnership && role === "poc" && !isOwner) return false;
  return true;
}

/** Get all editable fields for a role on a given LMP */
export function getEditableFields(role: Role, isOwner: boolean): LmpField[] {
  return (Object.keys(FIELD_PERMISSIONS) as LmpField[]).filter(
    (f) => canEditField(role, f, isOwner)
  );
}

// ─── Record-Level Permissions ───

export type LmpOwnership = {
  prep_poc?: string | null;
  support_poc?: string | null;
  outreach_poc?: string | null;
  allocator?: string | null;
  admin_owner?: string | null;
  // UUID-based ownership (preferred over name matching). Resolved by the
  // `resolve_lmp_poc_links` trigger from sheet name strings.
  prep_poc_id?: string | null;
  support_poc_id?: string | null;
  outreach_poc_ids?: string[] | null;
};

/**
 * Owner check. Prefers UUID match (pocId) when both are available; falls back
 * to case-insensitive name match for legacy rows where `*_id` is null.
 */
export function isLmpOwner(userName: string, lmp: LmpOwnership, pocId?: string | null): boolean {
  if (pocId) {
    if (lmp.prep_poc_id && lmp.prep_poc_id === pocId) return true;
    if (lmp.support_poc_id && lmp.support_poc_id === pocId) return true;
    if (Array.isArray(lmp.outreach_poc_ids) && lmp.outreach_poc_ids.includes(pocId)) return true;
  }
  const name = userName.toLowerCase().trim();
  if (!name) return false;
  return [lmp.prep_poc, lmp.support_poc, lmp.outreach_poc, lmp.allocator, lmp.admin_owner]
    .filter(Boolean)
    .some((n) => n!.toLowerCase().trim() === name);
}

export function isLmpPrepPoc(userName: string, lmp: LmpOwnership, pocId?: string | null): boolean {
  if (pocId) {
    if (lmp.prep_poc_id && lmp.prep_poc_id === pocId) return true;
    if (lmp.support_poc_id && lmp.support_poc_id === pocId) return true;
  }
  const name = userName.toLowerCase().trim();
  return [lmp.prep_poc, lmp.support_poc]
    .filter(Boolean)
    .some((n) => n!.toLowerCase().trim() === name);
}

export function isLmpOutreachPoc(userName: string, lmp: LmpOwnership, pocId?: string | null): boolean {
  if (pocId && Array.isArray(lmp.outreach_poc_ids) && lmp.outreach_poc_ids.includes(pocId)) return true;
  const name = userName.toLowerCase().trim();
  return lmp.outreach_poc?.toLowerCase().trim() === name;
}

/**
 * Determines the access level for a given LMP record.
 * - "full": can view and edit (admin, or owner)
 * - "summary": can view but not edit (other POC)
 * - "none": cannot view
 */
export function getLmpAccessLevel(
  role: Role,
  userName: string,
  lmp: LmpOwnership,
  pocId?: string | null,
): "full" | "summary" | "none" {
  if (role === "admin") return "full";
  if (role === "allocator") return "full";
  if (isLmpOwner(userName, lmp, pocId)) return "full";
  return "summary";
}

// ─── Rollback Permissions ───

export function canRollback(
  role: Role,
  userName: string,
  auditActorName: string,
  lmpOwnership?: LmpOwnership
): boolean {
  if (role === "admin") return true;
  if (role === "allocator") {
    // Can rollback own actions or actions on managed processes
    if (auditActorName.toLowerCase().trim() === userName.toLowerCase().trim()) return true;
    if (lmpOwnership && isLmpOwner(userName, lmpOwnership)) return true;
    return false;
  }
  // POC: only own updates
  return auditActorName.toLowerCase().trim() === userName.toLowerCase().trim();
}

// ─── Copilot Permission Check ───

export type CopilotAction =
  | "summarize" | "search_lmp" | "search_student" | "search_poc"
  | "analyze_domain" | "analyze_poc_load" | "retrieve_progress"
  | "show_analytics" | "suggest_actions" | "draft_update" | "execute_update";

export function canCopilotAction(
  role: Role,
  action: CopilotAction,
  userName: string,
  targetLmpOwnership?: LmpOwnership
): { allowed: boolean; reason?: string } {
  // All roles can summarize, search, analyze
  const readActions: CopilotAction[] = [
    "summarize", "search_lmp", "search_poc", "analyze_domain",
    "analyze_poc_load", "retrieve_progress", "show_analytics", "suggest_actions",
  ];
  if (readActions.includes(action)) return { allowed: true };

  // Student search: admin sees all, others see own
  if (action === "search_student") {
    return { allowed: true }; // Filtered server-side
  }

  // Draft update: everyone can draft
  if (action === "draft_update") return { allowed: true };

  // Execute update: check ownership
  if (action === "execute_update") {
    if (role === "admin" || role === "allocator") return { allowed: true };
    if (targetLmpOwnership && isLmpOwner(userName, targetLmpOwnership)) {
      return { allowed: true };
    }
    return {
      allowed: false,
      reason: "You do not have permission to perform this action.",
    };
  }

  return { allowed: true };
}

// ─── POC Sub-type Detection ───

/**
 * Determines if the current POC user is acting as a prep POC or outreach POC
 * for a specific LMP. Used for fine-grained field-level permissions.
 */
export type PocSubRole = "prep_poc" | "outreach_poc" | "support_poc" | "none";

export function getPocSubRole(userName: string, lmp: LmpOwnership, pocId?: string | null): PocSubRole {
  if (pocId) {
    if (lmp.prep_poc_id && lmp.prep_poc_id === pocId) return "prep_poc";
    if (lmp.support_poc_id && lmp.support_poc_id === pocId) return "support_poc";
    if (Array.isArray(lmp.outreach_poc_ids) && lmp.outreach_poc_ids.includes(pocId)) return "outreach_poc";
  }
  const name = userName.toLowerCase().trim();
  if (lmp.prep_poc?.toLowerCase().trim() === name) return "prep_poc";
  if (lmp.support_poc?.toLowerCase().trim() === name) return "support_poc";
  if (lmp.outreach_poc?.toLowerCase().trim() === name) return "outreach_poc";
  return "none";
}

const OUTREACH_EDITABLE_FIELDS: LmpField[] = [
  "daily_progress",
  "remarks",
  "placement_progress",
];

export function canOutreachPocEditField(field: LmpField): boolean {
  return OUTREACH_EDITABLE_FIELDS.includes(field);
}

export function canEditFieldFinal(
  role: Role,
  field: LmpField,
  userName: string,
  lmp: LmpOwnership,
  pocId?: string | null,
): boolean {
  if (role === "admin") return canEditField(role, field, true);
  if (role === "allocator") return canEditField(role, field, true);

  const subRole = getPocSubRole(userName, lmp, pocId);
  if (subRole === "none") return false;
  if (subRole === "outreach_poc") return canOutreachPocEditField(field);
  return canEditField(role, field, true);
}

/**
 * Server-mirrored whitelist of LMP fields a POC may modify (any sub-role).
 * Used to strip disallowed columns before sending updates to Postgres so the
 * RLS policy does not need to enforce per-column rules.
 */
export const POC_WRITABLE_LMP_COLUMNS: ReadonlyArray<string> = [
  "daily_progress", "prep_progress", "placement_progress",
  "next_progress_date", "next_progress_status", "next_progress_type",
  "next_progress_reminder_type", "last_progress_updated_at",
  "remarks", "mentor_aligned", "prep_doc_shared", "assignment_review",
  "one_to_one_mock", "behavioral_status", "status",
  "r1_shortlisted", "r2_shortlisted", "r3_shortlisted", "convert_names",
  "prep_doc",
];
