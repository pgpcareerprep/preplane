/**
 * useViewAsGuard — central read-only guard for View As mode.
 *
 * When View As is active, `isReadOnly` is true and `guardMutation` throws
 * ViewAsReadOnlyError before allowing any mutation to proceed.
 *
 * Usage:
 *   const { isReadOnly, guardMutation } = useViewAsGuard();
 *   const handleSave = () => guardMutation(() => saveFn());
 */
import { useViewer } from "@/lib/viewerContext";
import { ViewAsReadOnlyError } from "@/lib/rolesContext";

export function useViewAsGuard() {
  const { isReadOnly } = useViewer();

  return {
    isReadOnly,
    /**
     * Wrap a mutation call. Throws ViewAsReadOnlyError if View As is active.
     * Returns the mutation's return value when not in read-only mode.
     */
    guardMutation: <T>(fn: () => T): T => {
      if (isReadOnly) throw new ViewAsReadOnlyError();
      return fn();
    },
  };
}
