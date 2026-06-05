import { useRole } from "@/lib/rolesContext";
import { getResponsibility } from "@/lib/workspaceViewContext";
import type { Requisition } from "@/lib/lmpProcessMutations";
import { LmpProcessCompactCard } from "@/components/lmp/LmpProcessCompactCard";
import { PocLmpProcessCard } from "@/components/lmp/PocLmpProcessCard";

export function LmpProcessesCards({
  reqs,
  onEditPoc,
}: {
  reqs: Requisition[];
  onEditPoc: (r: Requisition) => void;
}) {
  const { viewAsRole: role, user } = useRole();
  const isPoc = role === "poc";

  if (reqs.length === 0) return null;

  return (
    <div
      className={
        isPoc
          ? "flex flex-wrap gap-4"
          : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      }
    >
      {reqs.map((r, i) =>
        isPoc ? (
          <div key={r.id} className="w-[320px]">
            <PocLmpProcessCard req={r} index={i} />
          </div>
        ) : (
          <LmpProcessCompactCard
            key={r.id}
            req={r}
            index={i}
            onEditPoc={onEditPoc}
            responsibility={getResponsibility(r, user, role)}
            isMine={r.createdBy === user.name}
          />
        ),
      )}
    </div>
  );
}