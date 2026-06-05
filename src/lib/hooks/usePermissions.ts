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
  const { viewAsRole } = useRole();
  return useMemo(
    () => ({
      can: (action: Action) => canPerform(viewAsRole, action),
      role: viewAsRole,
    }),
    [viewAsRole]
  );
}

/**
 * Hook for LMP-specific permissions (field-level, record-level).
 * Pass the LMP ownership data to get context-aware permissions.
 */
export function useLmpPermission(lmp?: LmpOwnership | null) {
  const { viewAsRole, user } = useRole();

  return useMemo(() => {
    const ownership: LmpOwnership = lmp ?? {};
    const accessLevel = getLmpAccessLevel(viewAsRole, user.name, ownership);
    const isReadOnly = accessLevel === "summary";

    return {
      accessLevel,
      isReadOnly,
      canEditField: (field: LmpField) =>
        !isReadOnly && canEditFieldFinal(viewAsRole, field, user.name, ownership),
      canChangeStatus: !isReadOnly && canPerform(viewAsRole, "change_status"),
      canAssignPoc: canPerform(viewAsRole, "assign_poc"),
      canChangeDomain: canPerform(viewAsRole, "change_domain"),
      canDelete: canPerform(viewAsRole, "delete_lmp"),
      canRollback: (auditActorName: string) =>
        canRollback(viewAsRole, user.name, auditActorName, ownership),
    };
  }, [viewAsRole, user.name, lmp]);
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
