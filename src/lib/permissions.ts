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
import {
  ACTION_MATRIX as CONTRACT_ACTION_MATRIX,
  FIELD_PERMISSIONS as CONTRACT_FIELD_PERMISSIONS,
  POC_WRITABLE_LMP_COLUMNS as CONTRACT_POC_WRITABLE_LMP_COLUMNS,
} from "../../supabase/functions/_shared/permissionContract";

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
  | "assign_outreach_poc"
  | "delete_comment"
  | "view_full_activity"
  | "configure_rounds"
  | "change_domain"
  | "change_status"
  | "edit_daily_progress"
  | "edit_prep_status"
  | "edit_mentor_status"
  | "edit_mock_status"
  | "edit_assignment_review"
  | "edit_outreach_progress"
  | "edit_remarks"
  | "edit_checklist"
  | "edit_next_progress"
  // Candidate management
  | "add_candidate"
  | "remove_candidate"
  | "update_candidate_stage"
  // Mentor flow
  | "run_mentor"
  | "assign_mentor"
  | "upload_jd"
  // Session & feedback
  | "update_session"
  | "add_feedback"
  | "add_activity_comment"
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
  delete_lmp: ["admin", "allocator"],
  assign_poc: ["admin", "allocator"],
  reassign_poc: ["admin", "allocator"],
  assign_outreach_poc: ["admin", "allocator"],
  delete_comment: ["admin", "allocator"],
  view_full_activity: ["admin", "allocator"],
  configure_rounds: ["admin", "allocator", "poc"],
  change_domain: ["admin", "allocator"],
  change_status: ["admin", "allocator", "poc"],
  edit_daily_progress: ["admin", "allocator", "poc"],
  edit_prep_status: ["admin", "allocator", "poc"],
  edit_mentor_status: ["admin", "allocator", "poc"],
  edit_mock_status: ["admin", "allocator", "poc"],
  edit_assignment_review: ["admin", "allocator", "poc"],
  edit_outreach_progress: ["admin", "allocator", "poc"],
  edit_remarks: ["admin", "allocator", "poc"],
  edit_checklist: ["admin", "allocator", "poc"],
  edit_next_progress: ["admin", "allocator", "poc"],
  // Candidates
  add_candidate: ["admin", "allocator", "poc"],
  remove_candidate: ["admin", "allocator", "poc"],
  update_candidate_stage: ["admin", "allocator", "poc"],
  // Mentor
  run_mentor: ["admin", "allocator", "poc"],
  assign_mentor: ["admin", "allocator", "poc"],
  upload_jd: ["admin", "allocator", "poc"],
  // Session & feedback
  update_session: ["admin", "allocator", "poc"],
  add_feedback: ["admin", "allocator", "poc"],
  add_activity_comment: ["admin", "allocator", "poc"],

  // Students
  view_all_students: ["admin", "allocator", "poc"],
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
  view_unmapped: ["admin", "allocator", "poc"],
  resolve_unmapped: ["admin"],

  // Allocation
  allocate_poc: ["admin", "allocator"],
};

export function canPerform(role: Role, action: Action): boolean {
  return (CONTRACT_ACTION_MATRIX[action] as readonly Role[] | undefined)?.includes(role) ?? false;
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
  company: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  role: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  domain: { editable: ["admin", "allocator"], requiresOwnership: true },
  status: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  type: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  date: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  closing_date: { editable: ["admin", "allocator"], requiresOwnership: true },
  admin_owner: { editable: ["admin"], requiresOwnership: true },
  allocator: { editable: ["admin"], requiresOwnership: true },
  prep_poc: { editable: ["admin", "allocator"], requiresOwnership: true },
  support_poc: { editable: ["admin", "allocator"], requiresOwnership: true },
  outreach_poc: { editable: ["admin", "allocator"], requiresOwnership: true },
  daily_progress: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  prep_progress: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  placement_progress: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  r1_shortlisted: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  r2_shortlisted: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  r3_shortlisted: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  final_convert: { editable: ["admin", "allocator"], requiresOwnership: true },
  convert_names: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  prep_doc: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  remarks: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  mentor_aligned: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  assignment_review: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  one_to_one_mock: { editable: ["admin", "allocator", "poc"], requiresOwnership: true },
  behavioral_status: { editable: ["admin"], requiresOwnership: true },
};

export function canEditField(
  role: Role,
  field: LmpField,
  isOwner: boolean
): boolean {
  const perm = CONTRACT_FIELD_PERMISSIONS[field];
  if (!perm) return false;
  if (!(perm.editable as readonly Role[]).includes(role)) return false;
  if (role === "admin" || role === "allocator") return true;
  if (perm.requiresOwnership && !isOwner) return false;
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

// All ownership checks are UUID-only. Name-based comparison has been removed to
// prevent partial/first-name values from creating inconsistent edit permissions.
// The DB migration (20260615100000) normalizes text fields and backfills all
// *_poc_id columns; a BEFORE INSERT OR UPDATE trigger keeps them consistent on
// future writes, including reconcile writes from the Google Sheet edge function.

export function isLmpOwner(_userName: string, lmp: LmpOwnership, pocId?: string | null): boolean {
  if (!pocId) return false;
  if (lmp.prep_poc_id && lmp.prep_poc_id === pocId) return true;
  if (lmp.support_poc_id && lmp.support_poc_id === pocId) return true;
  if (Array.isArray(lmp.outreach_poc_ids) && lmp.outreach_poc_ids.includes(pocId)) return true;
  return false;
}

export function isLmpPrepPoc(_userName: string, lmp: LmpOwnership, pocId?: string | null): boolean {
  if (!pocId) return false;
  if (lmp.prep_poc_id && lmp.prep_poc_id === pocId) return true;
  if (lmp.support_poc_id && lmp.support_poc_id === pocId) return true;
  return false;
}

export function isLmpOutreachPoc(_userName: string, lmp: LmpOwnership, pocId?: string | null): boolean {
  if (!pocId) return false;
  return Array.isArray(lmp.outreach_poc_ids) && lmp.outreach_poc_ids.includes(pocId);
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
  // admin/allocator always get full edit access regardless of ownership
  if (role === "admin" || role === "allocator") return "full";
  // POC: full only if assigned
  if (isLmpPrepPoc(userName, lmp, pocId) || isLmpOutreachPoc(userName, lmp, pocId)) return "full";
  return "summary";
}

/** Management authority is based on the authenticated application role. */
export function canManageLmp(role: Role): boolean {
  return role === "admin" || role === "allocator";
}

/** Operational authority always requires assignment, regardless of app role. */
export function canOperateLmp(
  userName: string,
  lmp: LmpOwnership,
  pocId?: string | null,
): boolean {
  return isLmpOwner(userName, lmp, pocId);
}

/** All current roles may view an LMP at their resolved access level. */
export function canViewLmp(
  role: Role,
  userName: string,
  lmp: LmpOwnership,
  pocId?: string | null,
): boolean {
  return getLmpAccessLevel(role, userName, lmp, pocId) !== "none";
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

  // Draft update: only allowed for owned LMPs
  if (action === "draft_update") {
    if (role === "admin" || role === "allocator") {
      if (targetLmpOwnership && isLmpPrepPoc(userName, targetLmpOwnership)) {
        return { allowed: true };
      }
      if (!targetLmpOwnership) return { allowed: true }; // no LMP context (global chat)
      return {
        allowed: false,
        reason: "You can only draft updates for LMPs you are assigned to.",
      };
    }
    if (targetLmpOwnership && isLmpOwner(userName, targetLmpOwnership)) {
      return { allowed: true };
    }
    if (!targetLmpOwnership) return { allowed: true }; // no LMP context
    return {
      allowed: false,
      reason: "You can only draft updates for LMPs you are assigned to.",
    };
  }

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

export function getPocSubRole(_userName: string, lmp: LmpOwnership, pocId?: string | null): PocSubRole {
  if (!pocId) return "none";
  if (lmp.prep_poc_id && lmp.prep_poc_id === pocId) return "prep_poc";
  if (lmp.support_poc_id && lmp.support_poc_id === pocId) return "support_poc";
  if (Array.isArray(lmp.outreach_poc_ids) && lmp.outreach_poc_ids.includes(pocId)) return "outreach_poc";
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
  const perm = CONTRACT_FIELD_PERMISSIONS[field];
  if (!perm) return false;
  if (!(perm.editable as readonly Role[]).includes(role)) return false;

  const managementFields: ReadonlyArray<LmpField> = [
    "company",
    "role",
    "domain",
    "closing_date",
    "admin_owner",
    "allocator",
    "prep_poc",
    "support_poc",
    "outreach_poc",
    "prep_doc",
  ];
  if (managementFields.includes(field)) return canManageLmp(role);

  return canOperateLmp(userName, lmp, pocId);
}

/**
 * Server-mirrored whitelist of LMP fields a POC may modify (any sub-role).
 * Used to strip disallowed columns before sending updates to Postgres so the
 * RLS policy does not need to enforce per-column rules.
 */
export const POC_WRITABLE_LMP_COLUMNS: ReadonlyArray<string> = CONTRACT_POC_WRITABLE_LMP_COLUMNS;
