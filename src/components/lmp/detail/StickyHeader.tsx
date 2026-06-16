import { Settings2, FileText, MessageSquare, MoreVertical, Trash2, UserPlus, UserCog, Pencil } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { LmpRecord, LmpStatus } from "@/lib/lmpTypes";
import { STATUS_META } from "@/lib/lmpTypes";
import { useLmpPermission } from "@/lib/hooks/usePermissions";
import { EditLmpModal } from "@/components/lmp/EditLmpModal";
import { TAG_STYLES } from "@/lib/pocAllocation";
import { useJd, type JdData } from "@/lib/jdStore";
import { JdUploadModal } from "@/components/lmp/JdUploadModal";
import { JdPreviewModal } from "@/components/lmp/JdPreviewModal";
import { StatusDropdown } from "@/components/lmp/StatusDropdown";
import { useLmpChatDrawer } from "@/lib/lmpChatContext";
import { useLmpTotalCommentCount } from "@/lib/hooks/useLmpTotalCommentCount";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteLmpProcess } from "@/lib/hooks/useDbData";
import { AddOutreachPocDialog } from "@/components/lmp/AddOutreachPocDialog";
import { ReassignPocModal } from "@/components/lmp/ReassignPocModal";

const STATUS_PILL: Record<string, string> = {
  ongoing: "pill-ongoing", dormant: "pill-dormant", hold: "pill-hold",
  "not-started": "pill-not-started", converted: "pill-converted", "not-converted": "pill-not-converted", closed: "pill-closed", "converted-na": "pill-na",
  "offer-received": "pill-ongoing",
};

export function StickyHeader({
  lmp, candidateCount, onConfigureRounds, readOnly, onChangeStatus,
}: { lmp: LmpRecord; candidateCount: number; onConfigureRounds?: () => void; readOnly?: boolean; onChangeStatus?: (next: LmpStatus) => void }) {
  const domain = lmp.prepPoc || lmp.domainPrepPoc;
  const behavioral = lmp.supportPoc || lmp.behavioralPrepPoc;
  const isDual = !behavioral || (domain && behavioral.name === domain.name);

  const {
    canManageLmp,
    canOperateLmp,
    canEdit: canEditLmp,
    canDelete: canDeleteLmp,
    canAssignPoc,
  } = useLmpPermission({
    prep_poc: lmp.prepPoc?.name,
    support_poc: lmp.supportPoc?.name,
    outreach_poc: lmp.outreachPoc?.name,
    allocator: lmp.allocator,
    prep_poc_id: lmp.prepPocId,
    support_poc_id: lmp.supportPocId,
    outreach_poc_ids: lmp.outreachPocIds,
  });
  const canManage = !readOnly && canManageLmp;
  const canOperate = !readOnly && canOperateLmp;
  const canDelete = canManage && canDeleteLmp;
  const canReassignPoc = canManage;
  const [jdData, setJdData] = useJd(lmp.id);
  const hasJd = !!jdData;
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const statusLabel = STATUS_META[lmp.status]?.label ?? lmp.status;
  const statusPill = STATUS_PILL[lmp.status] ?? "pill-not-started";

  const { open: openChat } = useLmpChatDrawer();
  const commentCount = useLmpTotalCommentCount(lmp.id);
  const canEditStatus = !!onChangeStatus && canOperate;

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const deleteMutation = useDeleteLmpProcess();

  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-4 md:p-5 space-y-3">
      {/* ROW 1 — Rounds button (only when configure-rounds handler provided) */}
      {onConfigureRounds && canManage && (
        <div className="flex items-center justify-end gap-2">
          <HeaderBtn icon={Settings2} label="Rounds" onClick={onConfigureRounds} />
        </div>
      )}

      {/* ROW 2 — Title ↔ Allocation tags */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[24px] md:text-[28px] font-semibold text-n900 leading-[1.2] tracking-[-0.4px] line-clamp-2">
          {!lmp.role && !lmp.company ? (
            <span className="italic text-n400">Untitled LMP</span>
          ) : (
            <>
              {lmp.company ? lmp.company : <span className="italic text-n400">No company data</span>}
              {" "}<span className="text-n400 font-normal">—</span>{" "}
              {lmp.role ? lmp.role : <span className="italic text-n400">No role data</span>}
            </>
          )}
        </h1>
        <div className="flex flex-wrap items-center gap-2 justify-end shrink-0">
          {/* JD status pill */}
          <button
            onClick={() => {
              if (hasJd) setPreviewOpen(true);
              else if (canManage) setUploadOpen(true);
            }}
            disabled={!hasJd && !canManage}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 h-7 text-[12px] font-medium cursor-pointer transition-colors",
              hasJd
                ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            )}
          >
            <FileText className="h-3 w-3" strokeWidth={1.75} />
            {hasJd ? "JD Attached" : "JD Missing"}
          </button>
          {lmp.jdMode === "LOAD_ONLY" && (
            <span className="inline-flex items-center rounded-full border bg-yellow-50 text-yellow-700 border-yellow-300 px-3 h-7 text-[12px] font-medium">
              LOAD_ONLY
            </span>
          )}
          {lmp.allocationTags?.map((t) => (
            <span
              key={t}
              className={cn(
                "inline-flex items-center rounded-full border px-3 h-7 text-[12px] font-medium",
                TAG_STYLES[t],
              )}
            >
              {t}
            </span>
          ))}
          {((canManage && canEditLmp) || canDelete || canReassignPoc || (canManage && canAssignPoc)) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center justify-center h-7 w-7 rounded-full border border-n200 hover:bg-n100 text-n500 hover:text-n700 transition-colors">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {canManage && canAssignPoc && (
                  <DropdownMenuItem onClick={() => setOutreachOpen(true)}>
                    <UserPlus className="h-3.5 w-3.5 mr-2" />
                    {lmp.outreachPoc?.name ? "Change Outreach POC" : "Add Outreach POC"}
                  </DropdownMenuItem>
                )}
                {canReassignPoc && (
                  <DropdownMenuItem onClick={() => setReassignOpen(true)}>
                    <UserCog className="h-3.5 w-3.5 mr-2" /> Reassign POCs
                  </DropdownMenuItem>
                )}
                {canManage && canEditLmp && (
                  <DropdownMenuItem onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" /> Edit LMP
                  </DropdownMenuItem>
                )}
                {canDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => setDeleteOpen(true)}
                      className="text-coral-600 focus:text-coral-700 focus:bg-coral-50"
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete LMP
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* ROW 3 — Meta + Comments ↔ POC owners */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-n600">
          <span className="font-medium text-n700">
            {candidateCount} Candidate{candidateCount !== 1 ? "s" : ""}
          </span>
          <span className="text-n300">•</span>
          <span className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n700 px-3 h-7 text-[12px] font-medium">
            Type: {lmp.type || "—"}
          </span>
          {canEditStatus ? (
            <StatusDropdown value={lmp.status} onChange={(s) => onChangeStatus!(s)} size="md" />
          ) : (
            <span className={cn("pill", statusPill)}>{statusLabel}</span>
          )}
          {lmp.domain && (
            <span className="inline-flex items-center rounded-full bg-n100 border border-n200 text-n700 px-3 h-7 text-[12px] font-medium">
              {lmp.domain}
            </span>
          )}
          {canOperate && <button
            onClick={() => openChat(lmp.id)}
            className="relative inline-flex items-center gap-1.5 rounded-full bg-card border border-n200 hover:border-orange-300 hover:text-orange-600 text-n700 px-3 h-7 text-[12px] font-medium transition-colors"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Comments
            {commentCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-orange-500 text-white text-[10px] font-semibold px-1 tabular-nums">
                {commentCount}
              </span>
            )}
          </button>}
        </div>
        {domain && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 justify-end shrink-0">
            <PocOwner label="Prep" poc={domain} />
            {!isDual && behavioral && <PocOwner label="Support" poc={behavioral} />}
          </div>
        )}
      </div>

      <JdUploadModal
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        lmpId={lmp.id}
        role={lmp.role || ""}
        company={lmp.company || ""}
        domain={lmp.domain}
        onUploaded={(data) => { setJdData(data); }}
      />

      {jdData && (
        <JdPreviewModal
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          jdData={jdData}
          onRemoved={() => setJdData(null)}
          onReplace={() => { setPreviewOpen(false); setUploadOpen(true); }}
        />
      )}

      <AddOutreachPocDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        lmpId={lmp.id}
        lmpLabel={`${lmp.role ?? ""} @ ${lmp.company ?? ""}`}
        currentOutreachPocName={lmp.outreachPoc?.name ?? null}
      />
      <ReassignPocModal
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        lmpId={lmp.id}
        lmpLabel={`${lmp.role ?? ""} @ ${lmp.company ?? ""}`}
        scope={canReassignPoc ? "all" : "support_outreach"}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this LMP process?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{lmp.company} — {lmp.role}</strong> and all its associated data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(lmp.id)}
              className="bg-coral-600 hover:bg-coral-700 text-white"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditLmpModal open={editOpen} onOpenChange={setEditOpen} rec={lmp} />
    </section>
  );
}

function HeaderBtn({ icon: Icon, label, onClick }: { icon: typeof Pencil; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md bg-card border border-n300 hover:bg-n100 text-n800 text-[13px] font-medium px-3 h-9 transition-colors"
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function PocOwner({ label, poc }: { label: string; poc: { name: string; initials: string; color: string } }) {
  return (
    <span className="inline-flex items-center gap-1.5" title={`${label} Prep · ${poc.name}`}>
      <span className={cn("h-6 w-6 rounded-full inline-flex items-center justify-center text-[10px] font-semibold shrink-0", poc.color)}>
        {poc.initials}
      </span>
      <span className="text-[12.5px] text-n700">
        <span className="text-n400">{label}: </span>
        <span className="text-n800 font-medium">{poc.name}</span>
      </span>
    </span>
  );
}
