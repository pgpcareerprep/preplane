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
  ACTION_MATRIX,
  FIELD_PERMISSIONS,
} from "../../supabase/functions/_shared/permissionContract";
export { POC_WRITABLE_LMP_COLUMNS } from "../../supabase/functions/_shared/permissionContract";

// ─── Action Permissions ───

export type Action = keyof typeof ACTION_MATRIX;

export function canPerform(role: Role, action: Action): boolean {
  return (ACTION_MATRIX[action] as readonly Role[] | undefined)?.includes(role) ?? false;
}

// ─── Field-Level Permissions ───

export type LmpField = keyof typeof FIELD_PERMISSIONS;

export function canEditField(
  role: Role,
  field: LmpField,
  isOwner: boolean
): boolean {
  const perm = FIELD_PERMISSIONS[field];
  if (!perm) return false;
  if (!(perm.editable as readonly Role[]).includes(role)) return false;
  if (role === "poc" && perm.requiresOwnership && !isOwner) return false;
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
  }
  const name = userName.toLowerCase().trim();
  if (!name) return false;
  return [lmp.prep_poc, lmp.support_poc]
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
  // If the user is assigned as primary prep/support POC, they always get full access
  if (isLmpPrepPoc(userName, lmp, pocId)) return "full";
  if (role === "admin" || role === "allocator") return "full";
  // POC not assigned to this LMP
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

  // Privileged roles may draft updates for any LMP; POCs remain assignment-scoped.
  if (action === "draft_update") {
    if (role === "admin" || role === "allocator") return { allowed: true };
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
  const isOwner = isLmpPrepPoc(userName, lmp, pocId);
  if (role === "admin" || role === "allocator") return canEditField(role, field, true);
  const subRole = getPocSubRole(userName, lmp, pocId);
  if (subRole === "none") return false;
  if (subRole === "outreach_poc") return canOutreachPocEditField(field);
  return canEditField(role, field, true);
}
