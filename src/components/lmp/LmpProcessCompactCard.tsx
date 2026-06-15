import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users, Clock, Calendar, MoreVertical, AlertTriangle, CheckCircle2, XCircle,
  Pencil, Plus, RefreshCw, UserCog, ArrowRightLeft, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Requisition, ReqStatus } from "@/lib/lmpProcessMutations";
import { STATUS_OPTIONS } from "@/lib/lmpProcessMutations";
import type { Responsibility } from "@/lib/workspaceViewContext";
import { PocAvatarStack } from "./PocAvatarStack";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLmpMutation } from "@/lib/sheets/hooks";
import { useDeleteLmpProcess } from "@/lib/hooks/useDbData";
import { toast } from "sonner";
import { useRole } from "@/lib/rolesContext";
import { OutreachFeedbackModal } from "./OutreachFeedbackModal";

const STATUS_PILL: Record<ReqStatus, string> = {
  ongoing: "pill-ongoing",
  dormant: "pill-dormant",
  hold: "pill-hold",
  converted: "pill-converted",
  "not-converted": "pill-not-converted",
  "not-started": "pill-not-started",
  closed: "pill-closed",
  "converted-na": "pill-na",
};

const STATUS_LABEL: Record<ReqStatus, string> = {
  ongoing: "Ongoing",
  dormant: "Dormant",
  hold: "On Hold",
  converted: "Converted",
  "not-converted": "Not Converted",
  closed: "Closed",
  "not-started": "Not Started", "converted-na": "Converted NA",
};

function slaTone(days: number) {
  if (days < 14) return "text-sage-600";
  if (days <= 30) return "text-yellow-600";
  return "text-coral-600";
}

type Health = "Healthy" | "Slow" | "Stuck";
const HEALTH_STYLE: Record<Health, { dot: string; text: string; bg: string; border: string }> = {
  Healthy: { dot: "bg-sage-400",   text: "text-sage-600",   bg: "bg-sage-50",   border: "border-sage-200" },
  Slow:    { dot: "bg-yellow-500", text: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200" },
  Stuck:   { dot: "bg-coral-400",  text: "text-coral-600",  bg: "bg-coral-50",  border: "border-coral-200" },
};
function healthOf(r: Requisition): Health {
  if (r.slaDays >= 30 || r.status === "dormant") return "Stuck";
  if (r.slaDays >= 14 || r.status === "hold") return "Slow";
  return "Healthy";
}
function HealthPill({ req }: { req: Requisition }) {
  const h = healthOf(req);
  const s = HEALTH_STYLE[h];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        s.bg, s.border, s.text,
      )}
      title={`Health: ${h}`}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {h}
    </span>
  );
}

function MatchSignal({ req }: { req: Requisition }) {
  if (req.mentorMatch === "completed") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-sage-600 font-semibold">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
        Strong Match · {req.mentorMatchCount ?? 0}
      </span>
    );
  }
  if (req.mentorMatch === "weak") {
    return (
      <span className="inline-flex items-center gap-1 text-[11.5px] text-yellow-700 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} />
        Weak Matches
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11.5px] text-coral-600 font-semibold">
      <XCircle className="h-3.5 w-3.5" strokeWidth={2} />
      Match Not Run
    </span>
  );
}

function ResponsibilityTag({ responsibility }: { responsibility: Responsibility }) {
  const map: Record<Responsibility, { label: string; cls: string }> = {
    owner: { label: "Owner", cls: "bg-orange-50 border-orange-200 text-orange-700" },
    manager: { label: "Manager", cls: "bg-teal-50 border-teal-200 text-teal-700" },
    poc: { label: "POC", cls: "bg-plum-400/10 border-plum-400/30 text-plum-400" },
    observer: { label: "Observer", cls: "bg-n100 border-n200 text-n600" },
  };
  const v = map[responsibility];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium", v.cls)}>
      {v.label}
    </span>
  );
}

export function LmpProcessCompactCard({
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
  const navigate = useNavigate();
  const { role } = useRole();
  const canManage = role === "admin" || role === "allocator";
  const canOperate = canManage || isMine;
  const { update: updateMutation } = useLmpMutation();
  const deleteLmp = useDeleteLmpProcess();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const handleChangeStatus = (newStatus: ReqStatus) => {
    updateMutation.mutate(
      { id: req.id, patch: { status: newStatus, lastActivity: "Just now — Status updated" } },
      {
        onSuccess: () => {
          toast.success(`Status updated to ${STATUS_OPTIONS.find((o) => o.value === newStatus)?.label ?? newStatus}`);
          if (newStatus === "not-converted") setFeedbackOpen(true);
        },
      },
    );
  };

  const handleCardClick = (e: React.MouseEvent) => {
    // Ignore clicks coming from interactive children
    const t = e.target as HTMLElement;
    if (t.closest("[data-stop-card-click]")) return;
    navigate(`/processes/${req.id}`);
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 8) * 0.04, ease: [0, 0, 0.2, 1] }}
      onClick={handleCardClick}
      className="group relative cursor-pointer rounded-2xl bg-card border border-n200 shadow-sm p-5 hover:shadow-md hover:border-n300 transition-all duration-200 flex flex-col"
    >
      {/* Header — Row 1: Status pill + Kebab (right aligned) */}
      <div className="flex items-center justify-end gap-1">
        <span className={cn("pill", STATUS_PILL[req.status])}>{STATUS_LABEL[req.status]}</span>
        <div data-stop-card-click>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                onClick={(e) => e.stopPropagation()}
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors"
                aria-label="Card actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {canOperate && <DropdownMenuItem onClick={() => navigate(`/processes/${req.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit LMP process
              </DropdownMenuItem>}
              {canManage && <DropdownMenuItem onClick={() => onEditPoc(req)}>
                <UserCog className="h-3.5 w-3.5 mr-2" /> Edit POC
              </DropdownMenuItem>}
              {canOperate && <DropdownMenuItem onClick={() => navigate(`/processes/${req.id}`)}>
                <Plus className="h-3.5 w-3.5 mr-2" /> Add Candidates
              </DropdownMenuItem>}
              {canOperate && <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <RefreshCw className="h-3.5 w-3.5 mr-2" /> Change Status
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-44">
                  {STATUS_OPTIONS.map((opt) => (
                    <DropdownMenuItem
                      key={opt.value}
                      onClick={() => handleChangeStatus(opt.value)}
                      className={cn(req.status === opt.value && "bg-n100")}
                    >
                      {opt.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>}
              {canManage && <DropdownMenuItem onClick={() => onEditPoc(req)}>
                <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> Reassign POC
              </DropdownMenuItem>}
              {canManage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setConfirmDelete(true)}
                    className="text-coral-600 focus:text-coral-600"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Row 2: Role @ Company — 2-line reserved */}
      <h4
        className="mt-2 text-[15px] font-semibold text-n900 overflow-hidden break-words"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          lineHeight: "24px",
          minHeight: "48px",
        }}
        title={`${req.company} — ${req.role}`}
      >
        {req.company} <span className="text-n500 font-normal">—</span> {req.role}
      </h4>

      {/* Row 3: Domain · Seniority subtitle */}
      <p className="mt-1 text-[12px] text-n500 truncate">
        {req.domain}{req.seniority ? ` · ${req.seniority}` : ""}
      </p>

      {/* Ownership avatars + Match signal (Level 1 + Level 2 bridge) */}
      <div className="mt-4 flex items-center justify-between gap-2">
        <PocAvatarStack req={req} size="md" />
        <MatchSignal req={req} />
      </div>

      {/* Metrics row — Candidates · Duration · Created */}
      <div className="mt-4 flex items-center justify-between gap-3 text-[12px]">
        <span className="inline-flex items-center gap-1.5 text-n600" title="Candidates">
          <Users className="h-3.5 w-3.5 text-n400" strokeWidth={1.75} />
          <span className="tabular-nums font-medium">{req.candidates}</span>
        </span>
        <span
          className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", slaTone(req.slaDays))}
          title="Days open"
        >
          <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
          {req.slaDays}d
        </span>
        <span className="inline-flex items-center gap-1.5 text-n500" title="Created">
          <Calendar className="h-3.5 w-3.5 text-n400" strokeWidth={1.75} />
          {req.createdAt}
        </span>
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-n200 flex items-center justify-between gap-2">
        <ResponsibilityTag responsibility={responsibility} />
        <div className="flex items-center gap-1" data-stop-card-click>
          <HealthPill req={req} />
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/processes/${req.id}`); }}
            className="text-[11.5px] font-medium text-orange-600 hover:text-orange-500 rounded-md px-2 py-1 transition-colors"
          >
            View →
          </button>
        </div>
      </div>
    </motion.div>

    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this LMP process?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove <span className="font-semibold">{req.role} @ {req.company}</span> and all its candidates and POC assignments. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            onClick={() => deleteLmp.mutate(req.id)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <OutreachFeedbackModal
      open={feedbackOpen}
      lmpId={req.id}
      onClose={() => setFeedbackOpen(false)}
    />
    </>
  );
}
