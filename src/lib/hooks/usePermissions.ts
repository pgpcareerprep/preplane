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
  prep_poc?: string;
  support_poc?: string;
  outreach_poc?: string;
  allocator?: string;
  admin_owner?: string;
};

/**
 * Hook for checking action-level permissions based on current role.
 */
export function useActionPermission() {
  const { role, viewAsRole, viewAsUser } = useRole();
  const isViewingAsOther = role === "admin" && (viewAsRole !== role || !!viewAsUser);
  return useMemo(
    () => ({
      can: (action: Action) => !isViewingAsOther && canPerform(role, action),
      role,
    }),
    [isViewingAsOther, role]
  );
}

/**
 * Hook for LMP-specific permissions (field-level, record-level).
 * Pass the LMP ownership data to get context-aware permissions.
 */
export function useLmpPermission(lmp?: LmpOwnership | null) {
  const { role, viewAsRole, viewAsUser, user } = useRole();
  const isViewingAsOther = role === "admin" && (viewAsRole !== role || !!viewAsUser);

  return useMemo(() => {
    const ownership: LmpOwnership = lmp ?? {};
    const accessLevel = getLmpAccessLevel(role, user.name, ownership);
    const isReadOnly = isViewingAsOther || accessLevel === "summary";

    return {
      accessLevel,
      isReadOnly,
      canEditField: (field: LmpField) =>
        !isReadOnly && canEditFieldFinal(role, field, user.name, ownership),
      canChangeStatus: !isReadOnly && canPerform(role, "change_status"),
      canAssignPoc: !isReadOnly && canPerform(role, "assign_poc"),
      canChangeDomain: !isReadOnly && canPerform(role, "change_domain"),
      canDelete: !isReadOnly && canPerform(role, "delete_lmp"),
      canRollback: (auditActorName: string) =>
        !isReadOnly && canRollback(role, user.name, auditActorName, ownership),
    };
  }, [isViewingAsOther, role, user.name, lmp]);
}

/**
 * Hook for Copilot permission checks.
 */
export function useCopilotPermission() {
  const { viewAsRole, user } = useRole();

  return useMemo(
    () => ({
      check: (action: CopilotAction, targetLmpOwnership?: LmpOwnership) =>
        canCopilotAction(viewAsRole, action, user.name, targetLmpOwnership),
    }),
    [viewAsRole, user.name]
  );
}
