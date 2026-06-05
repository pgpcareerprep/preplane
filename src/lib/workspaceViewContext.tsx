import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { LmpProcess } from "@/lib/lmpProcessMutations";
import { useRole, type Role, type User } from "@/lib/rolesContext";

export type WorkspaceView = "mine" | "assigned" | "all";

type WorkspaceCtx = {
  view: WorkspaceView;
  setView: (v: WorkspaceView) => void;
  /** Views allowed for the current role. */
  allowed: WorkspaceView[];
};

const Ctx = createContext<WorkspaceCtx | null>(null);

const ROLE_DEFAULT: Record<Role, WorkspaceView> = {
  allocator: "mine",
  poc: "assigned",
  admin: "all",
};

const ROLE_ALLOWED: Record<Role, WorkspaceView[]> = {
  allocator: ["mine", "assigned", "all"],
  poc: ["assigned"],
  admin: ["mine", "assigned", "all"],
};

export function WorkspaceViewProvider({ children }: { children: ReactNode }) {
  const { viewAsRole: role } = useRole();
  const [view, setViewState] = useState<WorkspaceView>(ROLE_DEFAULT[role]);
  const allowed = ROLE_ALLOWED[role];

  // If role changes and current view is not allowed, snap to default.
  const effective = allowed.includes(view) ? view : ROLE_DEFAULT[role];

  const value = useMemo<WorkspaceCtx>(
    () => ({
      view: effective,
      setView: (v) => allowed.includes(v) && setViewState(v),
      allowed,
    }),
    [effective, allowed.join(",")], // eslint-disable-line react-hooks/exhaustive-deps
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaceView() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspaceView must be used inside WorkspaceViewProvider");
  return ctx;
}

export type Responsibility = "owner" | "manager" | "observer" | "poc";

/** Compute how the given user relates to a requisition. */
export function getResponsibility(req: LmpProcess, user: User, role: Role): Responsibility {
  const isCreator = req.createdBy === user.name;
  const isPoc =
    req.primaryPoc.name === user.name || req.secondaryPoc?.name === user.name;
  if (isCreator && role !== "poc") return "owner";
  if (isPoc && role === "poc") return "poc";
  if (isPoc) return "manager";
  return "observer";
}

/** Filter requisitions for the active view + current user. */
export function filterByView(
  reqs: LmpProcess[],
  view: WorkspaceView,
  user: User,
): LmpProcess[] {
  switch (view) {
    case "mine":
      return reqs.filter((r) => r.createdBy === user.name);
    case "assigned":
      return reqs.filter(
        (r) =>
          r.primaryPoc.name === user.name ||
          r.secondaryPoc?.name === user.name,
      );
    case "all":
    default:
      return reqs;
  }
}

export const VIEW_LABEL: Record<WorkspaceView, string> = {
  mine: "My Processes",
  assigned: "Assigned to POCs",
  all: "All Processes",
};

export const VIEW_HINT: Record<WorkspaceView, string> = {
  mine: "What you own — created by you.",
  assigned: "Processes where you are a POC.",
  all: "Everything across the organisation.",
};