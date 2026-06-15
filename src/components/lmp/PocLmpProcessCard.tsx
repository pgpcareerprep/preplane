import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown, Users, Clock, Calendar, ArrowRight,
  MoreVertical, Pencil, Plus, RefreshCw, UserCog, ArrowRightLeft, Trash2,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Requisition, ReqStatus } from "@/lib/lmpProcessMutations";
import { DEFAULT_ROUNDS, STATUS_OPTIONS } from "@/lib/lmpProcessMutations";
import { useRole } from "@/lib/rolesContext";
import { useLmpCandidatesLive } from "@/lib/hooks/useLmpCandidatesLive";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useLmpMutation } from "@/lib/sheets/hooks";
import { useDeleteLmpProcess } from "@/lib/hooks/useDbData";
import { OutreachFeedbackModal } from "./OutreachFeedbackModal";

const DOT_COLORS = [
  "bg-orange-200 text-orange-600",
  "bg-teal-200 text-teal-600",
  "bg-plum-400/30 text-plum-400",
  "bg-sage-200 text-sage-600",
  "bg-yellow-200 text-yellow-600",
];
import { PocAvatarStack } from "./PocAvatarStack";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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



const ROUND_DOT_COLORS = ["bg-orange-400", "bg-teal-400", "bg-plum-400", "bg-sage-400", "bg-yellow-500"];

function slaTone(days: number) {
  if (days < 14) return "text-sage-600";
  if (days <= 30) return "text-yellow-600";
  return "text-coral-600";
}

export function PocLmpProcessCard({ req, index }: { req: Requisition; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const navigate = useNavigate();
  const { user, role } = useRole();
  const canManage = role === "admin" || role === "allocator";
  const { update: updateMutation } = useLmpMutation();
  const deleteLmp = useDeleteLmpProcess();

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

  // Identify the signed-in POC against this requisition's named POCs.
  const myName = (user.pocProfileName || user.name || "").trim().toLowerCase();
  const isPrimary = !!myName && req.primaryPoc.name.trim().toLowerCase() === myName;
  const youLabel = isPrimary ? "You (Prep)" : "You (Support)";

  // Live per-round candidate distribution. Only fetch when the panel is open
  // (cheap query but no need to hit the DB for collapsed cards).
  const { data: liveCandidates } = useLmpCandidatesLive(expanded ? req.id : null);
  const dist = DEFAULT_ROUNDS.map((r, i) => ({
    round: r,
    count: (liveCandidates ?? []).filter((c) => c.roundId === r.id).length,
    color: ROUND_DOT_COLORS[i % ROUND_DOT_COLORS.length],
  }));
  const totalDist = dist.reduce((s, d) => s + d.count, 0) || 1;

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.05, ease: [0, 0, 0.2, 1] }}
      className="rounded-2xl bg-card border border-n200 shadow-sm hover:shadow-md hover:border-n300 transition-all duration-220 overflow-hidden flex flex-col"
    >
      <div className="p-5 flex flex-col">
        {/* Header — Row 1: You tag + Status + Kebab (single row) */}
        <div className="flex items-center justify-between gap-2">
          <span className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium shrink-0",
            isPrimary ? "bg-orange-50 border-orange-200 text-orange-700" : "bg-n100 border-n200 text-n600",
          )}>
            {youLabel}
          </span>
          <div className="flex items-center gap-1 shrink-0">
          <span className={cn("pill", STATUS_PILL[req.status])}>{STATUS_LABEL[req.status]}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-7 w-7 inline-flex items-center justify-center rounded-md text-n500 hover:text-n900 hover:bg-n100 transition-colors"
                aria-label="Card actions"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => navigate(`/processes/${req.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Edit Requisition
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/processes/${req.id}`)}>
                <UserCog className="h-3.5 w-3.5 mr-2" /> Edit POC
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/processes/${req.id}`)}>
                <Plus className="h-3.5 w-3.5 mr-2" /> Add Candidates
              </DropdownMenuItem>
              <DropdownMenuSub>
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
              </DropdownMenuSub>
              {canManage && (
                <>
                  <DropdownMenuItem onClick={() => navigate(`/processes/${req.id}`)}>
                    <ArrowRightLeft className="h-3.5 w-3.5 mr-2" /> Reassign POC
                  </DropdownMenuItem>
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

        <div className="my-4 h-px bg-n200" />

        {/* POC avatar stack */}
        <div className="mb-3">
          <PocAvatarStack req={req} size="md" />
        </div>

        {/* Stage — text only */}
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-n500 uppercase tracking-[0.5px] font-medium">Stage</span>
          <span className="text-n800 font-medium text-[12px]">{req.stage}</span>
        </div>

        {/* Metrics row — Candidates · Duration · Created */}
        <div className="mt-3 flex items-center justify-between gap-3 text-[12px]">
          <span className="inline-flex items-center gap-1.5 text-n600" title="Candidates">
            <Users className="h-3.5 w-3.5 text-n400" strokeWidth={1.75} />
            <span className="tabular-nums font-medium">{req.candidates}</span>
          </span>
          <span className={cn("inline-flex items-center gap-1.5 font-medium tabular-nums", slaTone(req.slaDays))} title="Days open">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.75} />
            {req.slaDays}d
          </span>
          <span className="inline-flex items-center gap-1.5 text-n500" title="Created">
            <Calendar className="h-3.5 w-3.5 text-n400" strokeWidth={1.75} />
            {req.createdAt}
          </span>
        </div>

        <div className="my-4 h-px bg-n200" />

        {/* Action row — View Details + Expand Pipeline in one row */}
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/processes/${req.id}`}
            className="inline-flex items-center gap-1 rounded-md text-n700 hover:text-n900 hover:bg-n100 px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap"
          >
            View Details <ArrowRight className="h-3 w-3" />
          </Link>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md text-[12px] text-n500 hover:text-n800 hover:bg-n100 px-2.5 py-1.5 transition-colors whitespace-nowrap"
          >
            {expanded ? "Hide Pipeline" : "Expand Pipeline"}
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 18 }}
              className="inline-flex"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </motion.span>
          </button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden border-t border-n200 bg-n50"
          >
            <div className="p-4">
              <div className="flex items-end gap-2 overflow-x-auto pb-1">
                {dist.map((d, colIdx) => (
                  <div key={d.round.id} className="flex-1 min-w-[64px] rounded-md bg-card border border-n200 px-2 py-2.5">
                    <div className="text-[10px] uppercase tracking-[0.5px] text-n500 font-medium truncate">{d.round.name}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-1 min-h-[24px]">
                      {Array.from({ length: d.count }).map((_, dotIdx) => {
                        const color = DOT_COLORS[(colIdx + dotIdx) % DOT_COLORS.length];
                        return (
                          <motion.span
                            key={dotIdx}
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: (colIdx * 4 + dotIdx) * 0.06, type: "spring", stiffness: 300, damping: 18 }}
                            className={cn(
                              "h-5 w-5 rounded-full",
                              color,
                            )}
                          />
                        );
                      })}
                      {d.count === 0 && <span className="text-[10px] text-n400">—</span>}
                    </div>
                    <div className="mt-1 text-[10px] text-n500 tabular-nums">{d.count} candidates</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-end">
                <Link
                  to={`/processes/${req.id}`}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-orange-600 hover:text-orange-500"
                >
                  Full ATS <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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
