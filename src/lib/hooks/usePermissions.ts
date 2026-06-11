/**
 * React hook for RBAC permission checks in LMP context.
 * Combines role, user identity, and LMP ownership for comprehensive access control.
 */

import { useMemo } from "react";
import { useRole } from "@/lib/rolesContext";
import {
  canPerform,
  canEditFieldFinal,
  getLmpAccessLevel,
  canRollback,
  canCopilotAction,
  type Action,
  type LmpField,
  type CopilotAction,
} from "@/lib/permissions";

type LmpOwnership = {
  prep_poc?: string | null;
  support_poc?: string | null;
  outreach_poc?: string | null;
  allocator?: string | null;
  admin_owner?: string | null;
  prep_poc_id?: string | null;
  support_poc_id?: string | null;
  outreach_poc_ids?: string[] | null;
};

/**
 * Hook for checking action-level permissions based on current role.
 */
export function useActionPermission() {
  const { role } = useRole();
  return useMemo(
    () => ({
      can: (action: Action) => canPerform(role, action),
      role,
    }),
    [role]
  );
}

/**
 * Hook for LMP-specific permissions (field-level, record-level).
 * Pass the LMP ownership data to get context-aware permissions.
 */
export function useLmpPermission(lmp?: LmpOwnership | null) {
  const { role, user } = useRole();

  return useMemo(() => {
    const ownership: LmpOwnership = lmp ?? {};
    const actorName = user.pocProfileName || user.name;
    const accessLevel = getLmpAccessLevel(role, actorName, ownership);
    const isPrivileged = role === "admin" || role === "allocator";
    const isReadOnly = isPrivileged ? false : accessLevel === "summary";

    return {
      accessLevel,
      isReadOnly,
      canEdit: !isReadOnly && accessLevel === "full" && canPerform(role, "edit_lmp"),
      canEditField: (field: LmpField) =>
        !isReadOnly && canEditFieldFinal(role, field, actorName, ownership),
      canChangeStatus: !isReadOnly && canPerform(role, "change_status"),
      canAssignPoc: !isReadOnly && canPerform(role, "assign_poc"),
      canChangeDomain: !isReadOnly && canPerform(role, "change_domain"),
      canDelete: !isReadOnly && accessLevel === "full" && canPerform(role, "delete_lmp"),
      canRollback: (auditActorName: string) =>
        !isReadOnly && canRollback(role, actorName, auditActorName, ownership),
    };
  }, [role, user.name, user.pocProfileName, lmp]);
}

/**
 * Hook for Copilot permission checks.
 */
export function useCopilotPermission() {
  const { role, user } = useRole();

  return useMemo(
    () => ({
      check: (action: CopilotAction, targetLmpOwnership?: LmpOwnership) =>
        canCopilotAction(role, action, user.name, targetLmpOwnership),
    }),
    [role, user.name]
  );
}
