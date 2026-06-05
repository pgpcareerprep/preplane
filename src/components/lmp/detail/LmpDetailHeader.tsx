import { ChevronDown, MessageSquare, UserCog } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { type LmpRecord, type LmpStatus, STATUS_META, HEALTH_META, slaChip } from "@/lib/lmpTypes";
import { STATUS_OPTIONS } from "@/lib/lmpDetail";
import { DualPocRow } from "@/components/lmp/DualPocRow";
import { useLmpChatDrawer } from "@/lib/lmpChatContext";
import { useLmpTotalCommentCount } from "@/lib/hooks/useLmpTotalCommentCount";
import { useLmpCandidatesLive } from "@/lib/hooks/useLmpCandidatesLive";
import { ReassignPocModal } from "@/components/lmp/ReassignPocModal";
import { useRole } from "@/lib/rolesContext";
import { canPerform } from "@/lib/permissions";

export function LmpDetailHeader({
  rec, canEdit, onChangeStatus,
}: {
  rec: LmpRecord;
  canEdit: boolean;
  onChangeStatus: (s: LmpStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const meta = STATUS_META[rec.status];
  const sla = slaChip(rec.slaDays);
  const health = HEALTH_META[rec.health];
  const { open: openChat } = useLmpChatDrawer();
  const commentCount = useLmpTotalCommentCount(rec.id);
  const { data: liveCandidates = [] } = useLmpCandidatesLive(rec.id);
  const candidateCount = liveCandidates.length || rec.candidates;
  const { viewAsRole } = useRole();
  const canReassignAll = canPerform(viewAsRole, "reassign_poc");
  const canReassignAny = canReassignAll;

  return (
    <section className="rounded-2xl bg-card shadow-sm border border-n200 p-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="space-y-3 min-w-0">
          <h2 className="text-[24px] md:text-[28px] leading-[1.2] font-bold tracking-[-0.4px] text-n900">
            {rec.company && <>{rec.company}<span className="text-n400 font-normal"> — </span></>}{rec.role || <span className="text-n400 italic font-normal">No role</span>}
          </h2>
          <p className="text-[14px] text-n500">
            Domain: {rec.domain} · Seniority: Mid-Senior
          </p>

          {(rec.prepPoc || rec.domainPrepPoc) ? (
            <DualPocRow
              prepPoc={rec.prepPoc || rec.domainPrepPoc}
              supportPoc={rec.supportPoc || rec.behavioralPrepPoc}
              outreachPoc={rec.outreachPoc}
              tags={rec.allocationTags}
              jdMode={rec.jdMode}
            />
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex -space-x-2">
                {rec.pocs.map((p, i) => (
                  <div
                    key={p.name}
                    title={p.name}
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold ring-2",
                      p.color,
                      i === 0 ? "ring-orange-500" : "ring-plum-400",
                    )}
                  >
                    {p.initials}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[12px] text-n500">
            {candidateCount} Candidates · Stage: {rec.stage} · Created {rec.createdAt}, 2026
          </p>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-2">
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              onClick={() => openChat(rec.id)}
              className="relative inline-flex items-center gap-1.5 rounded-full border border-n200 bg-card hover:border-orange-300 hover:text-orange-600 text-n700 px-3 h-8 text-[12px] font-medium transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Comments
              {commentCount > 0 && (
                <span className="ml-0.5 h-4 min-w-[16px] px-1 rounded-full bg-orange-500 text-white text-[10px] font-semibold inline-flex items-center justify-center tabular-nums">
                  {commentCount}
                </span>
              )}
            </button>
            {canReassignAny && (
              <button
                type="button"
                onClick={() => setReassignOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-n200 bg-card hover:border-orange-300 hover:text-orange-600 text-n700 px-3 h-8 text-[12px] font-medium transition-colors"
              >
                <UserCog className="h-3.5 w-3.5" />
                Reassign POCs
              </button>
            )}
          </div>
          {canEdit ? (
            <div className="relative">
              <button
                onClick={() => setOpen((v) => !v)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 h-8 text-[12px] font-medium",
                  "bg-card border-n300 hover:border-n400",
                )}
              >
                <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
                {meta.label}
                <ChevronDown className="h-3.5 w-3.5 text-n500" />
              </button>
              {open && (
                <div
                  role="listbox"
                  className="absolute right-0 mt-1 z-30 w-48 rounded-lg border border-n200 bg-card shadow-lg p-1"
                >
                  {STATUS_OPTIONS.map((s) => {
                    const m = STATUS_META[s];
                    return (
                      <button
                        key={s}
                        onClick={() => { setOpen(false); if (s !== rec.status) onChangeStatus(s); }}
                        className={cn(
                          "w-full inline-flex items-center gap-2 rounded-md px-2 h-8 text-[12px] hover:bg-n100",
                          s === rec.status && "bg-n100 font-medium",
                        )}
                      >
                        <span className={cn("h-2 w-2 rounded-full", m.dot)} />
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-full bg-n100 border border-n200 px-3 h-7 text-[12px] font-medium text-n700">
              <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
              {meta.label}
            </span>
          )}

          <span className={cn("inline-flex items-center gap-2 text-[13px] font-medium", health.text)}>
            <span className={cn("h-3 w-3 rounded-full", health.dot)} />
            {rec.health}
          </span>

          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium tabular-nums", sla.cls)}>
            {rec.slaDays} days open
          </span>

          <span className="text-[12px] text-n400">Last updated: {rec.lastActivity.split(" — ")[0]}</span>
        </div>
      </div>

      <ReassignPocModal
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        lmpId={rec.id}
        lmpLabel={`${rec.role} @ ${rec.company}`}
        scope={canReassignAll ? "all" : "support_outreach"}
      />
    </section>
  );
}