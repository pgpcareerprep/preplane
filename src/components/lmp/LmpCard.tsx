import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical, UserCog, Eye, Users, RefreshCw, MessageSquare, CalendarClock, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { type LmpRecord, STATUS_META, ageLabel } from "@/lib/lmpTypes";
import { TriPocRow } from "@/components/lmp/TriPocRow";
import { TAG_STYLES } from "@/lib/pocAllocation";
import { useLmpChatDrawer } from "@/lib/lmpChatContext";
import { useLmpComments } from "@/lib/hooks/useLmpComments";
import { useLmpProcessComment } from "@/lib/hooks/useLmpProcessComment";
import { useDeleteLmpProcess, useLmpCandidateCounts } from "@/lib/hooks/useDbData";
import { useLmpPermission } from "@/lib/hooks/usePermissions";
import { useRole } from "@/lib/rolesContext";
import { EditLmpModal } from "@/components/lmp/EditLmpModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export function LmpCard({ rec, dragging }: { rec: LmpRecord; dragging?: boolean }) {
  const navigate = useNavigate();
  const { data: dbComments = [] } = useLmpComments(rec.id);
  const { data: sheetComment = "" } = useLmpProcessComment(rec.id);
  const { open: openChat } = useLmpChatDrawer();
  const commentCount = dbComments.length + (sheetComment.trim() ? 1 : 0);
  const deleteLmp = useDeleteLmpProcess();
  const { data: candidateCounts = {} } = useLmpCandidateCounts();
  const liveCandidateCount = (candidateCounts as Record<string, number>)[rec.id];
  const candidateCount = typeof liveCandidateCount === "number" ? liveCandidateCount : (rec.candidates ?? 0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const { role } = useRole();
  const { canEdit, canDelete, canAssignPoc, canChangeStatus } = useLmpPermission({
    prep_poc: rec.prepPoc?.name,
    support_poc: rec.supportPoc?.name,
    outreach_poc: rec.outreachPoc?.name,
    allocator: rec.allocator,
  });

  const handleCardClick = (e: React.MouseEvent) => {
    if (dragging) return;
    const t = e.target as HTMLElement;
    if (t.closest("a,button,[data-stop-card-click]")) return;
    navigate(`/lmp/${encodeURIComponent(rec.id)}?from=kanban`);
  };

  return (
    <>
    <article
      onClick={handleCardClick}
      className={cn(
        "group rounded-xl bg-card border border-n200 shadow-sm p-3.5 transition-all duration-220",
        dragging
          ? "shadow-xl border-n300 scale-[1.03]"
          : "hover:shadow-md hover:border-orange-300 cursor-pointer",
      )}
    >
      {/* Header: title + kebab */}
      <div className="flex items-start justify-between gap-2 py-0">
        <h3 className="font-semibold text-n900 leading-snug truncate min-w-0 text-base">
          {rec.role}
        </h3>
        <div data-stop-card-click>
          {canEdit && <button
            type="button"
            aria-label="Open comments"
            onClick={(e) => { e.stopPropagation(); openChat(rec.id); }}
            className="relative inline-flex h-7 w-7 items-center justify-center rounded-md text-n400 hover:text-n900 hover:bg-n100 transition-colors mr-0.5"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            {commentCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-1 rounded-full bg-orange-500 text-white text-[9px] font-semibold inline-flex items-center justify-center tabular-nums">
                {commentCount}
              </span>
            )}
          </button>}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="Card actions"
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 -mt-1 -mr-1 inline-flex h-7 w-7 items-center justify-center rounded-md text-n400 opacity-0 group-hover:opacity-100 focus:opacity-100 data-[state=open]:opacity-100 hover:text-n900 hover:bg-n100 transition-all"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => navigate(`/lmp/${encodeURIComponent(rec.id)}?from=kanban`)}>
                <Eye className="h-4 w-4" /> View details
              </DropdownMenuItem>
              {canAssignPoc && (
                <DropdownMenuItem onClick={() => toast("Edit POC", { description: "Open POC editor" })}>
                  <UserCog className="h-4 w-4" /> Edit POC
                </DropdownMenuItem>
              )}
              {canChangeStatus && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => toast("Change status", { description: "Open status changer" })}>
                    <RefreshCw className="h-4 w-4" /> Change status
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {canEdit && (
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <Pencil className="h-4 w-4" /> Edit LMP
                </DropdownMenuItem>
              )}
              {canDelete && (
                <DropdownMenuItem
                  className="text-red-600 focus:text-red-600 focus:bg-red-50"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-4 w-4" /> Delete LMP
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Company */}
      <div className="mt-0.5 text-n600 font-medium truncate my-0 text-base">
        {rec.company}
      </div>

      {/* Domain + allocation tag (In-Domain / Cross-Domain only) */}
      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
        <span className="text-n500 truncate text-sm">{rec.domain}</span>
        {rec.allocationTags
          ?.filter((t) => t === "In-Domain" || t === "Cross-Domain")
          .map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium",
                TAG_STYLES[t],
              )}
            >
              {t}
            </span>
          ))}
      </div>

      {/* Meta row: candidates + stage */}
      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap py-[4px]">
        <span className="inline-flex items-center gap-1 rounded-md bg-n50 text-n700 px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
          <Users className="h-3 w-3 text-n400" />
          {candidateCount}
        </span>
        <span className="inline-flex items-center rounded-md bg-orange-50 text-orange-700 border border-orange-100 px-1.5 py-0.5 font-medium text-xs">
          {rec.stage}
        </span>
        {/* Checklist progress dots */}
        {(() => {
          const checks = [rec.mentorAligned, rec.prepDocShared, rec.assignmentReview, rec.mockDoneByPoc];
          const doneCount = checks.filter(Boolean).length;
          return (
            <span className="inline-flex items-center gap-1 ml-auto" title={`${doneCount}/4 checklist items done`}>
              {checks.map((c, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    c ? "bg-emerald-500" : "bg-n300",
                  )}
                />
              ))}
              <span className="text-[10px] text-n500 tabular-nums ml-0.5">{doneCount}/4</span>
            </span>
          );
        })()}
      </div>

      <div className="h-px bg-n100 my-[4px]" />

      {/* Tri-POC (allocation tag now lives in header row) */}
      {(rec.prepPoc || rec.domainPrepPoc) ? (
        <TriPocRow
          prepPoc={rec.prepPoc || rec.domainPrepPoc}
          supportPoc={rec.supportPoc || rec.behavioralPrepPoc}
          outreachPoc={rec.outreachPoc}
          size="sm"
          showLabels={false}
        />
      ) : (
        <div className="flex items-center gap-3 py-[6px]">
          {rec.pocs.slice(0, 2).map((p, i) => (
            <span key={p.name} className="relative shrink-0" title={`${i === 0 ? "Prep" : "Support"} POC · ${p.name}`}>
              <span
                className={cn(
                  "h-6 w-6 rounded-full inline-flex items-center justify-center text-[10px] font-semibold",
                  p.color,
                )}
              >
                {p.initials}
              </span>
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full inline-flex items-center justify-center text-[7px] font-bold text-white ring-1 ring-white",
                  i === 0 ? "bg-orange-500" : "bg-sky-500",
                )}
              >
                {i === 0 ? "P" : "S"}
              </span>
            </span>
          ))}
        </div>
      )}

      {/* Next progress date */}
      {rec.nextExpectedProgress && (() => {
        const d = new Date(rec.nextExpectedProgress);
        const isValid = !isNaN(d.getTime());
        const isOverdue = isValid && d < new Date(new Date().toDateString());
        const formatted = isValid
          ? d.toLocaleDateString("en-IN", { month: "short", day: "numeric" })
          : rec.nextExpectedProgress;
        return (
          <div className={cn("mt-1.5 flex items-center gap-1 text-[11px]", isOverdue ? "text-red-500" : "text-n500")}>
            <CalendarClock className="h-3 w-3" />
            <span>Next: {formatted}</span>
            {isOverdue && <span className="font-semibold">Overdue</span>}
          </div>
        );
      })()}

      {/* Footer: age + last activity */}
      <div className="mt-2 gap-2 text-[11.5px] py-[4px] flex items-center justify-between">
        <span
          className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n600 px-2 py-0.5 text-[11px] font-medium tabular-nums"
          title={`Created ${rec.createdAt}`}
        >
          {ageLabel(rec.createdAt)}
        </span>
        <span className="text-[11px] text-n400 truncate">{rec.lastActivity}</span>
      </div>

      {rec.reason && (rec.status === "hold" || rec.status === "closed" || rec.status === "not-converted") && (
        <div className="mt-2 inline-flex items-center rounded-md bg-coral-50 border border-coral-100 text-coral-600 px-1.5 py-0.5 text-[11px] font-medium">
          {rec.reason}
        </div>
      )}
    </article>
    <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this LMP process?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove <span className="font-semibold">{rec.role} @ {rec.company}</span> and its candidates and POC assignments. This cannot be undone. The next sheet sync will re-create it if the row still exists in the source sheet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            onClick={() => deleteLmp.mutate(rec.id)}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <EditLmpModal open={editOpen} onOpenChange={setEditOpen} rec={rec} />
    </>
  );
}

// Re-export so other modules can use without importing the lib directly
export { STATUS_META };
