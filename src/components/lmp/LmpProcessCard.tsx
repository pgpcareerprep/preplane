import { motion } from "framer-motion";
import { Users, Clock, Calendar, Pencil, Plus, ArrowRight, Sparkles, AlertCircle, CheckCircle2, Briefcase } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { Requisition, ReqStatus } from "@/lib/lmpProcessMutations";
import type { Responsibility } from "@/lib/workspaceViewContext";
import { PocAvatarStack } from "./PocAvatarStack";
import { useLmpCandidateCounts } from "@/lib/hooks/useDbData";
import { useAvatarUrl } from "@/lib/hooks/useAvatarUrls";

const STATUS_PILL: Record<ReqStatus, string> = {
  "ongoing": "pill-ongoing",
  "dormant": "pill-dormant",
  "hold": "pill-hold",
  "converted": "pill-converted",
  "not-converted": "pill-not-converted",
  "not-started": "pill-not-started",
  "closed": "pill-closed",
  "converted-na": "pill-na",
};

const STATUS_LABEL: Record<ReqStatus, string> = {
  "ongoing": "Ongoing", "dormant": "Dormant", "hold": "On Hold",
  "converted": "Converted", "not-converted": "Not Converted", "closed": "Closed",
  "not-started": "Not Started", "converted-na": "Converted NA",
};

function slaTone(days: number) {
  if (days < 14) return "text-sage-600";
  if (days <= 30) return "text-yellow-600";
  return "text-coral-600";
}

export function LmpProcessCard({
  req,
  index,
  onEditPoc,
  responsibility,
  isMine,
}: {
  req: Requisition;
  index: number;
  onEditPoc: (r: Requisition) => void;
  responsibility: Responsibility;
  isMine: boolean;
}) {
  const { data: candidateCounts = {} } = useLmpCandidateCounts();
  const liveCount = (candidateCounts as Record<string, number>)[req.id];
  const candidateCount = typeof liveCount === "number" ? liveCount : (req.candidates ?? 0);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.06, ease: [0, 0, 0.2, 1] }}
      className="rounded-2xl bg-card border border-n200 shadow-sm p-5 hover:shadow-md hover:border-n300 transition-all duration-220"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("pill", STATUS_PILL[req.status])}>{STATUS_LABEL[req.status]}</span>
        <ResponsibilityBadge responsibility={responsibility} />
      </div>

      <h4 className="mt-3 text-[16px] font-semibold text-n900 leading-snug">
        {req.company} <span className="text-n500 font-normal">—</span> {req.role}
      </h4>
      <p className="mt-1 text-[13px] text-n500">{req.domain} · {req.seniority} · {req.stage}</p>

      {/* Ownership line */}
      <div className="mt-2 inline-flex items-center gap-1.5 text-[12px]">
        <Briefcase className="h-3 w-3 text-n400" strokeWidth={1.75} />
        <span className="text-n500">Owned by</span>
        <span className={cn("font-medium", isMine ? "text-orange-600" : "text-n800")}>
          {isMine ? "You" : req.createdBy}
        </span>
      </div>

      <div className="my-4 h-px bg-n200" />

      <PocAvatarStack req={req} size="md" />

      <div className="mt-4 flex items-center gap-4 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-n600">
          <Users className="h-3.5 w-3.5" strokeWidth={1.75} />
          {candidateCount} Candidates
        </span>
        <span className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", slaTone(req.slaDays))}>
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
          {req.slaDays}d
        </span>
        <span className="inline-flex items-center gap-1.5 text-n400">
          <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
          {req.createdAt}
        </span>
      </div>

      {/* Mentor match + LMP status row */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <MentorMatchPill req={req} />
        <LmpPill lmp={req.lmp} />
      </div>

      <div className="my-4 h-px bg-n200" />

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEditPoc(req)}
            className="inline-flex items-center gap-1 rounded-md text-n600 hover:text-n900 hover:bg-n100 px-2 py-1 text-[12px] transition-colors"
          >
            <Pencil className="h-3 w-3" /> Edit POC
          </button>
          <button className="inline-flex items-center gap-1 rounded-md text-n600 hover:text-n900 hover:bg-n100 px-2 py-1 text-[12px] transition-colors">
            <Plus className="h-3 w-3" /> Candidates
          </button>
        </div>
        <Link
          to={`/processes/${req.id}`}
          className="inline-flex items-center gap-1 rounded-md bg-n900 hover:bg-n800 text-white px-3 py-1.5 text-[12px] font-medium transition-colors"
        >
          View <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}

function ResponsibilityBadge({ responsibility }: { responsibility: Responsibility }) {
  const map: Record<Responsibility, { label: string; cls: string }> = {
    owner:    { label: "Owner",    cls: "bg-orange-50 border-orange-200 text-orange-700" },
    manager:  { label: "Manager",  cls: "bg-teal-50 border-teal-200 text-teal-700" },
    poc:      { label: "POC",      cls: "bg-plum-400/10 border-plum-400/30 text-plum-400" },
    observer: { label: "Observer", cls: "bg-n100 border-n200 text-n600" },
  };
  const v = map[responsibility];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", v.cls)}>
      {v.label}
    </span>
  );
}

function MentorMatchPill({ req }: { req: Requisition }) {
  if (req.mentorMatch === "completed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-sage-50 border border-sage-200 text-sage-600 px-2 py-0.5 text-[11px] font-medium">
        <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
        Match · {req.mentorMatchCount ?? 0}
      </span>
    );
  }
  if (req.mentorMatch === "weak") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700 px-2 py-0.5 text-[11px] font-medium">
        <AlertCircle className="h-3 w-3" strokeWidth={2} />
        Weak matches
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-coral-50 border border-coral-200 text-coral-600 px-2 py-0.5 text-[11px] font-medium">
      <Sparkles className="h-3 w-3" strokeWidth={2} />
      Match not run
    </span>
  );
}

function LmpPill({ lmp }: { lmp: Requisition["lmp"] }) {
  if (lmp === "open") {
    return (
      <span className="inline-flex items-center rounded-full bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 text-[11px] font-medium">
        LMP · Open
      </span>
    );
  }
  if (lmp === "closed") {
    return (
      <span className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n600 px-2 py-0.5 text-[11px] font-medium">
        LMP · Closed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-n50 border border-dashed border-n300 text-n500 px-2 py-0.5 text-[11px] font-medium">
      LMP · None
    </span>
  );
}

function Avatar({ name, initials, color, primary }: { name: string; initials: string; color: string; primary?: boolean }) {
  const photoUrl = useAvatarUrl(name);
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 overflow-hidden",
        !photoUrl && color,
        primary && "ring-2 ring-orange-500/40",
      )}>
        {photoUrl ? (
          <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <span className="text-[13px] text-n800 truncate">{name}</span>
    </div>
  );
}