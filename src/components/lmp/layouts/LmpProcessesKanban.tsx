import { motion } from "framer-motion";
import { useRole } from "@/lib/rolesContext";
import { getResponsibility } from "@/lib/workspaceViewContext";
import { STATUS_OPTIONS, type Requisition, type ReqStatus } from "@/lib/lmpProcessMutations";
import { LmpProcessCard } from "@/components/lmp/LmpProcessCard";
import { PocLmpProcessCard } from "@/components/lmp/PocLmpProcessCard";
import { cn } from "@/lib/utils";

const COLUMN_ACCENT: Record<ReqStatus, string> = {
  ongoing: "border-t-orange-400",
  dormant: "border-t-yellow-500",
  hold: "border-t-plum-400",
  converted: "border-t-sage-500",
  "not-converted": "border-t-coral-500",
  "not-started": "border-t-n300",
  closed: "border-t-n400",
  "converted-na": "border-t-plum-400",
};

export function LmpProcessesKanban({
  reqs,
  onEditPoc,
}: {
  reqs: Requisition[];
  onEditPoc: (r: Requisition) => void;
}) {
  const { viewAsRole: role, user } = useRole();
  const isPoc = role === "poc";

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
      {STATUS_OPTIONS.map((opt) => {
        const items = reqs.filter((r) => r.status === opt.value);
        return (
          <div
            key={opt.value}
            className={cn(
              "snap-start shrink-0 w-[340px] rounded-2xl bg-n50 border border-n200 border-t-4 flex flex-col",
              COLUMN_ACCENT[opt.value],
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-n200">
              <h3 className="text-[13px] font-semibold text-n800 tracking-tight">{opt.label}</h3>
              <span className="inline-flex items-center justify-center min-w-[22px] h-[22px] rounded-full bg-card border border-n200 text-[11px] font-medium text-n600 tabular-nums px-1.5">
                {items.length}
              </span>
            </div>
            <div className="flex-1 p-3 space-y-3 min-h-[120px]">
              {items.length === 0 ? (
                <div className="text-center text-[12px] text-n400 py-8">No processes</div>
              ) : (
                items.map((r, i) =>
                  isPoc ? (
                    <PocLmpProcessCard key={r.id} req={r} index={i} />
                  ) : (
                    <motion.div
                      key={r.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: i * 0.04 }}
                    >
                      <LmpProcessCard
                        req={r}
                        index={0}
                        onEditPoc={onEditPoc}
                        responsibility={getResponsibility(r, user, role)}
                        isMine={r.createdBy === user.name}
                      />
                    </motion.div>
                  ),
                )
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}