import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMotionPreset } from "@/lib/useMotionPreset";
import { ArrowRight, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type LmpRecord, type LmpStatus, STATUS_META, HEALTH_META } from "@/lib/lmpTypes";
import { STATUS_OPTIONS } from "@/lib/lmpDetail";
import { DualPocRow } from "@/components/lmp/DualPocRow";

const SESSION_PILL: Record<string, string> = {
  Scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  Completed: "bg-sage-50 text-sage-600 border-sage-200",
  Cancelled: "bg-coral-50 text-coral-600 border-coral-200",
};

export function LmpSidebar({
  rec, canEdit, onChangeStatus,
}: {
  rec: LmpRecord;
  canEdit: boolean;
  onChangeStatus: (s: LmpStatus, reason: string) => void;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 self-start">
      <PocAssignmentCard rec={rec} />
      <CandidatesCard />
      <SessionsCard />
      {canEdit && <LogProcessCard rec={rec} onChangeStatus={onChangeStatus} />}
      <HealthSlaCard rec={rec} />
    </aside>
  );
}

function PocAssignmentCard({ rec }: { rec: LmpRecord }) {
  const prepPoc = rec.prepPoc || rec.domainPrepPoc;
  if (!prepPoc) return null;
  return (
    <div className="rounded-xl bg-card shadow-sm border border-n200 p-4">
      <h5 className="text-[13px] font-semibold text-n800 mb-3">POC Assignment</h5>
      <DualPocRow
        prepPoc={prepPoc}
        supportPoc={rec.supportPoc || rec.behavioralPrepPoc}
        outreachPoc={rec.outreachPoc}
        tags={rec.allocationTags}
        jdMode={rec.jdMode}
      />
    </div>
  );
}

function SectionCard({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-card shadow-sm border border-n200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h5 className="text-[13px] font-semibold text-n800">{title}</h5>
        {typeof count === "number" && (
          <span className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full bg-n100 text-n600 text-[11px] font-medium tabular-nums">
            {count}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function CandidatesCard() {
  return (
    <SectionCard title="Candidates">
      <p className="text-[12.5px] text-n500 italic">No candidates mapped yet.</p>
    </SectionCard>
  );
}

function SessionsCard() {
  return (
    <SectionCard title="Sessions">
      <p className="text-[12.5px] text-n500 italic">No sessions found for this LMP.</p>
    </SectionCard>
  );
}

function LogProcessCard({ rec, onChangeStatus }: { rec: LmpRecord; onChangeStatus: (s: LmpStatus, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [next, setNext] = useState<LmpStatus>(rec.status);
  const [reason, setReason] = useState("");
  const [selOpen, setSelOpen] = useState(false);
  const motionPreset = useMotionPreset();
  const meta = STATUS_META[rec.status];
  const nextMeta = STATUS_META[next];

  const submit = () => {
    if (next === rec.status) {
      toast.info("Pick a different status");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason required");
      return;
    }
    onChangeStatus(next, reason.trim());
    setOpen(false);
    setReason("");
  };

  return (
    <div className="rounded-xl bg-card shadow-sm border border-n200 p-4">
      <h5 className="text-[13px] font-semibold text-n800 mb-2">Log Status Change</h5>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[12px] text-n500">Current</span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-n100 border border-n200 px-2 py-0.5 text-[11px] font-medium text-n700">
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} />
          {meta.label}
        </span>
      </div>
      {!open && (
        <button
          onClick={() => { setOpen(true); setNext(rec.status); }}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium h-9 shadow-sm transition-colors"
        >
          Change Status <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={motionPreset.heightExpand.initial}
            animate={motionPreset.heightExpand.animate}
            exit={motionPreset.heightExpand.exit}
            transition={motionPreset.heightExpand.transition}
            className="overflow-hidden"
          >
            <div className="pt-2 space-y-3">
              <div className="relative">
                <button
                  onClick={() => setSelOpen((v) => !v)}
                  className="w-full inline-flex items-center justify-between rounded-md border border-n300 bg-card px-3 h-9 text-[13px] text-n800 hover:border-n400"
                >
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("h-2 w-2 rounded-full", nextMeta.dot)} />
                    {nextMeta.label}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-n500" />
                </button>
                {selOpen && (
                  <div className="absolute left-0 right-0 mt-1 z-30 rounded-lg border border-n200 bg-card shadow-lg p-1">
                    {STATUS_OPTIONS.map((s) => {
                      const m = STATUS_META[s];
                      return (
                        <button
                          key={s}
                          onClick={() => { setNext(s); setSelOpen(false); }}
                          className={cn(
                            "w-full inline-flex items-center gap-2 rounded-md px-2 h-8 text-[12px] hover:bg-n100",
                            s === next && "bg-n100 font-medium",
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
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for status change (required)"
                className="w-full min-h-[72px] rounded-md border border-n300 bg-card px-3 py-2 text-[13px] text-n800 placeholder:text-n400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 resize-y"
              />
              <p className="text-[11px] text-n400 italic">
                This will update the LMP status and log the change.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => { setOpen(false); setReason(""); }}
                  className="rounded-md text-n600 hover:text-n900 hover:bg-n100 text-[13px] font-medium px-3 h-9"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  className="rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 h-9 shadow-sm transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function HealthSlaCard({ rec }: { rec: LmpRecord }) {
  const health = HEALTH_META[rec.health];
  const pct = Math.min(100, (rec.slaDays / 45) * 100);
  return (
    <div className="rounded-xl bg-card shadow-sm border border-n200 p-4">
      <h5 className="text-[13px] font-semibold text-n800 mb-3">Health & SLA</h5>
      <div className={cn("inline-flex items-center gap-2 rounded-full bg-n100 border border-n200 px-3 h-7 text-[12px] font-medium", health.text)}>
        <span className={cn("h-2.5 w-2.5 rounded-full", health.dot)} />
        {rec.health}
      </div>

      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-n100 overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 bg-orange-500"
            style={{ width: `${pct}%` }}
          />
          <span className="absolute top-0 bottom-0 w-px bg-n300" style={{ left: `${(14 / 45) * 100}%` }} />
          <span className="absolute top-0 bottom-0 w-px bg-n300" style={{ left: `${(30 / 45) * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-n400 tabular-nums">
          <span>0d</span>
          <span>14d</span>
          <span>30d</span>
          <span>45d+</span>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div>
          <div className="text-[11px] text-n500">Last activity</div>
          <div className="text-[12px] text-n700">{rec.lastActivity.split(" — ")[0]}</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-n500">Days open</div>
          <div className="text-[24px] font-bold text-n900 tabular-nums leading-none">{rec.slaDays}</div>
        </div>
      </div>
    </div>
  );
}