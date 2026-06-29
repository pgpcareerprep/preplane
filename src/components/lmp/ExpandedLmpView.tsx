import { UserPlus, ExternalLink, Eye, Play, Megaphone, UserCog, MessageSquare } from "lucide-react";
import { AddOutreachPocDialog } from "./AddOutreachPocDialog";
import { ReassignPocModal } from "./ReassignPocModal";
import { canPerform } from "@/lib/permissions";
import { useLmpPermission } from "@/lib/hooks/usePermissions";
import { useRole } from "@/lib/rolesContext";
import { useSaveNextProgressDate } from "@/lib/hooks/useProgressHistory";
import { JdButton } from "./JdButton";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AddCandidatesModal } from "@/components/lmp/detail/AddCandidatesModal";
import { useAddLmpCandidates, useLmpCandidates, usePocProfiles, useLmpProcesses } from "@/lib/hooks/useDbData";
import { resolvePocEmail } from "@/lib/poc/resolvePocEmail";
import { normalizeNextProgressType } from "@/lib/nextProgressType";
import { useDbLmpId } from "@/lib/hooks/useDbLmpId";
import { type LmpRecord } from "@/lib/lmpTypes";
import { DailyProgressCard } from "./bento/DailyProgressCard";
import { PipelineSnapshotCard } from "./bento/PipelineSnapshotCard";
import { MentorSnapshotCard } from "./bento/MentorSnapshotCard";
import { ChecklistCard } from "./bento/ChecklistCard";
import { DocumentsCard, normalizeDocuments, type DocumentLink, type DocumentAddContext } from "./bento/DocumentsCard";
import type { DocumentLinkInput } from "./bento/DocumentLinkModal";
import { FIXED_PIPELINE_ROUNDS, resolveStageToRoundId } from "@/lib/pipelineStage";
import { useLmpMode, buildLmpDetailHref } from "@/lib/lmpViewingContext";
import { useLmpMutation } from "@/lib/sheets/hooks";
import { supabase } from "@/integrations/supabase/client";
import type { Mentor } from "@/lib/mentor";
import { cn } from "@/lib/utils";
import { OutreachFeedbackModal } from "./OutreachFeedbackModal";
import { OutreachFeedbackHistoryModal } from "./OutreachFeedbackHistoryModal";

/**
 * Inline-expanded LMP workspace. Notion-style bento grid; no internal tabs.
 * Same modules are reused (denser) on the detail page Overview tab.
 */
export function ExpandedLmpView({
  rec,
  onCollapse,
  onChangeStatus,
}: {
  rec: LmpRecord;
  onCollapse: () => void;
  onChangeStatus: (next: LmpRecord["status"]) => void;
}) {
  void onChangeStatus;
  const navigate = useNavigate();
  const location = useLocation();
  const boardReturnPath = `${location.pathname}${location.search}`;
  const detailHref = (extra?: Record<string, string>) =>
    buildLmpDetailHref(rec.id, "cards", boardReturnPath, extra);
  const seniority = (rec as any).jdSeniority ?? (rec as any).seniority ?? undefined;
  const mode = useLmpMode(rec);
  const summary = mode === "summary";
  const [addOpen, setAddOpen] = useState(false);
  const [outreachOpen, setOutreachOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [feedbackHistoryOpen, setFeedbackHistoryOpen] = useState(false);
  const [pendingNotConvertedFeedback, setPendingNotConvertedFeedback] = useState(false);
  const { role } = useRole();
  const canReassignAll = canPerform(role, "reassign_poc");
  const canReassignAny = canReassignAll;
const queryClient = useQueryClient();
  // rounds resolved after dbLmpId below
const { update: updateMutation } = useLmpMutation();
  const saveNextDateDb = useSaveNextProgressDate();
  const { data: pocProfiles = [] } = usePocProfiles();
  const { data: dbProcesses = [] } = useLmpProcesses();
  void onCollapse;

  // Look up the matching DB row to get deterministic prep_poc_id / support_poc_id.
  const dbRow = useMemo(() => {
    return (dbProcesses as any[]).find(
      (p) =>
        p.company?.trim().toLowerCase() === rec.company?.trim().toLowerCase() &&
        p.role?.trim().toLowerCase() === rec.role?.trim().toLowerCase(),
    );
  }, [dbProcesses, rec.company, rec.role]);

  const prepPocEmail = useMemo(
    () =>
      resolvePocEmail(pocProfiles as any[], {
        id: dbRow?.prep_poc_id,
        name: rec.prepPoc?.name,
      }),
    [pocProfiles, dbRow?.prep_poc_id, rec.prepPoc?.name],
  );
  const supportPocEmail = useMemo(
    () =>
      resolvePocEmail(pocProfiles as any[], {
        id: dbRow?.support_poc_id,
        name: rec.supportPoc?.name,
      }),
    [pocProfiles, dbRow?.support_poc_id, rec.supportPoc?.name],
  );

  const pocEmails = useMemo(() => {
    const list = [prepPocEmail, supportPocEmail].filter(Boolean) as string[];
    const seen = new Set<string>();
    return list.filter((e) => {
      const k = e.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [prepPocEmail, supportPocEmail]);

  const dbLmpId = useDbLmpId({ id: rec.id, company: rec.company, role: rec.role });

  const { canOperateLmp, canManageLmp } = useLmpPermission({
    prep_poc: rec.prepPoc?.name,
    support_poc: rec.supportPoc?.name,
    outreach_poc: rec.outreachPoc?.name,
    prep_poc_id: dbRow?.prep_poc_id ?? rec.prepPocId,
    support_poc_id: dbRow?.support_poc_id ?? rec.supportPocId,
    outreach_poc_ids: rec.outreachPocIds,
  });
  const canAddCandidates = canOperateLmp || canManageLmp;

  const { data: existingCandidates = [] } = useLmpCandidates(dbLmpId);

  const handleSaveProgress = async (text: string) => {
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit" });
    const entry = `[${today}] ${text}`;
    // Read fresh value from DB so each save appends instead of overwriting
    // with a stale closure value.
    const { data } = await supabase
      .from("lmp_processes")
      .select("daily_progress")
      .eq("id", rec.id)
      .maybeSingle();
    const existing = ((data?.daily_progress as string | null) ?? "").trim();
    const next = existing ? `${entry}\n${existing}` : entry;
    updateMutation.mutate({ id: rec.id, patch: { dailyProgress: next } });
  };

  const handleSaveNextDate = useCallback((date: string, type?: string, enableReminder: boolean = true) => {
    const reminderType = normalizeNextProgressType(type);
    const safeDate = date && date.trim() !== "" ? date : null;
    updateMutation.mutate({
      id: rec.id,
      patch: { nextExpectedProgress: safeDate ?? "", nextExpectedType: reminderType || "" },
    });

    if (dbLmpId) {
      saveNextDateDb.mutate({
        lmpId: dbLmpId,
        nextDate: safeDate,
        reminderType: reminderType || "",
        pocEmail: pocEmails.length ? pocEmails.join(", ") : undefined,
        skipReminder: !enableReminder,
      });
    }
  }, [rec.id, dbLmpId, updateMutation, saveNextDateDb, pocEmails]);

  const [pendingChecklist, setPendingChecklist] = useState<Record<string, boolean>>({});
  const handleChecklistToggle = useCallback((sheetKey: string, newValue: boolean) => {
    setPendingChecklist((p) => ({ ...p, [sheetKey]: newValue }));
    updateMutation.mutate(
      { id: rec.id, patch: { [sheetKey]: newValue } },
      {
        onError: () => {
          setPendingChecklist((p) => {
            if (!(sheetKey in p)) return p;
            const { [sheetKey]: _, ...rest } = p;
            return rest;
          });
        },
      },
    );
  }, [rec.id, updateMutation]);

  // Clear pending only when refetched DB row matches the optimistic value.
  // Removes the flicker between mutation settle and refetch landing.
  useEffect(() => {
    setPendingChecklist((p) => {
      const keys = Object.keys(p);
      if (keys.length === 0) return p;
      let changed = false;
      const next: Record<string, boolean> = { ...p };
      for (const k of keys) {
        if (((rec as any)[k] ?? false) === p[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [rec]);

  // Mentor alignment — routes through align_mentor_to_lmp RPC so lmp_mentors is
  // kept in sync and the trigger-driven recompute updates mentor_selected correctly.
  const handleAlignMentor = useCallback(async (mentor: Mentor, replace = false) => {
    if (!dbLmpId) return;
    const { error } = await (supabase as any).rpc("align_mentor_to_lmp", {
      p_lmp_id: dbLmpId,
      p_mentor: mentor,
      p_match_score: null,
      p_replace: replace,
    });
    if (error) {
      toast.error(`Couldn't align mentor: ${error.message}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["lmp-mentors-live", dbLmpId] });
    queryClient.invalidateQueries({ queryKey: ["db-lmp-process", dbLmpId] });
    toast.success(`${replace ? "Replaced with" : "Aligned:"} ${mentor.name}`);
  }, [dbLmpId, queryClient]);

  // Documents — single JSON array on lmp_processes.documents. Each entry has
  // a stable id + source_type so checklist-linked and general documents share
  // storage and stay in sync across both UIs.
  const currentDocs: DocumentLink[] = useMemo(() => normalizeDocuments(rec.documents), [rec.documents]);

  const persistDocs = useCallback(
    (next: DocumentLink[]) => {
      updateMutation.mutate({ id: rec.id, patch: { documents: next as unknown as never } });
    },
    [rec.id, updateMutation],
  );

  const genId = () =>
    (typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const handleAddDocuments = useCallback(
    (links: DocumentLinkInput[], ctx: DocumentAddContext) => {
      const now = new Date().toISOString();
      const additions: DocumentLink[] = links.map((l) => ({
        id: genId(),
        label: l.label,
        url: l.url,
        source_type: ctx.source_type,
        checklist_item_id: ctx.source_type === "execution_checklist" ? ctx.checklist_item_id : undefined,
        checklist_item_label:
          ctx.source_type === "execution_checklist" ? ctx.checklist_item_label : undefined,
        created_at: now,
        updated_at: now,
      }));
      persistDocs([...currentDocs, ...additions]);
      toast.success(links.length > 1 ? `${links.length} links saved.` : "Document link saved.");
    },
    [currentDocs, persistDocs],
  );

  const handleUpdateDocument = useCallback(
    (id: string, patch: DocumentLinkInput) => {
      const next = currentDocs.map((d) =>
        d.id === id
          ? { ...d, label: patch.label, url: patch.url, updated_at: new Date().toISOString() }
          : d,
      );
      persistDocs(next);
    },
    [currentDocs, persistDocs],
  );

  const handleRemoveDocument = useCallback(
    (id: string) => {
      persistDocs(currentDocs.filter((d) => d.id !== id));
    },
    [currentDocs, persistDocs],
  );

  return (
    <div
      className={cn(
        "relative border-t border-n200 px-5 py-5 rounded-b-xl",
        "bg-gradient-to-b from-n50/60 via-white to-n50/40",
      )}
    >
      {/* ROW 1 — Daily Progress (left)  |  Quick Actions + Checklist (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 order-2 lg:order-1 flex flex-col">
          <DailyProgressCard
            lmpId={rec.id}
            mode={mode}
            onSaveProgress={handleSaveProgress}
            onSaveNextDate={handleSaveNextDate}
            initialPrepProgress={rec.prepProgress}
            sheetDailyProgress={rec.dailyProgress}
            nextProgressDateFromDb={(rec as any).next_progress_date || rec.nextExpectedProgress || null}
            reminderTypeFromDb={(rec as any).next_progress_reminder_type || null}
            pocEmail={pocEmails[0] || prepPocEmail}
            lastProgressUpdatedAt={(rec as any).last_progress_updated_at || null}
            prepPocName={rec.prepPoc?.name || null}
            prepPocEmail={prepPocEmail}
            supportPocName={rec.supportPoc?.name || null}
            supportPocEmail={supportPocEmail}
          />
        </div>
        <div className="order-1 lg:order-2 flex flex-col gap-4">
          {/* Quick Actions */}
          <div className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.7px] text-n600">Quick Actions</h4>
              </div>
              {summary && (
                <span className="inline-flex items-center gap-1 rounded-full border border-n200 bg-n50 px-1.5 py-[1px] text-[10px] font-medium text-n600">
                  <Eye className="h-2.5 w-2.5" /> Summary
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <JdButton
                lmpId={rec.id}
                role={rec.role}
                company={rec.company}
                domain={rec.domain}
                seniority={seniority}
              />
              <button
                type="button"
                onClick={() => navigate(detailHref())}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-n200 bg-card text-[12.5px] font-medium text-n700 hover:text-n900 hover:border-n300 hover:bg-n50 transition-all"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Open
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                disabled={!canAddCandidates}
                title={!canAddCandidates ? "Read-only — you are not a POC on this LMP" : undefined}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[12.5px] font-medium shadow-sm shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <UserPlus className="h-3.5 w-3.5" /> Add Candidates
              </button>
              <button
                type="button"
                disabled={summary}
                onClick={() => navigate(detailHref({ tab: "mentors" }))}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-[12.5px] font-medium shadow-sm shadow-orange-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.25} /> Run Mentor
              </button>
              <button
                type="button"
                disabled={summary}
                onClick={() => setOutreachOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-n200 bg-card text-[12.5px] font-medium text-n700 hover:text-n900 hover:border-n300 hover:bg-n50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title={rec.outreachPoc?.name ? `Outreach POC: ${rec.outreachPoc.name}` : "Assign Outreach POC"}
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span className="truncate">
                  {rec.outreachPoc?.name ? `Outreach: ${rec.outreachPoc.name.split(/\s+/)[0]}` : "Add Outreach POC"}
                </span>
              </button>
              {canReassignAny && (
                <button
                  type="button"
                  onClick={() => setReassignOpen(true)}
                  className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-n200 bg-card text-[12.5px] font-medium text-n700 hover:text-n900 hover:border-n300 hover:bg-n50 transition-all"
                  title="Change Prep / Support / Outreach POCs"
                >
                  <UserCog className="h-3.5 w-3.5" /> Reassign POCs
                </button>
              )}
              <button
                type="button"
                onClick={() => setFeedbackHistoryOpen(true)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-lg border border-n200 bg-card text-[12.5px] font-medium text-n700 hover:text-n900 hover:border-n300 hover:bg-n50 transition-all col-span-2"
              >
                <MessageSquare className="h-3.5 w-3.5" /> Outreach Feedback
              </button>
            </div>
          </div>

          <ChecklistCard
            lmpId={rec.id}
            mode={mode}
            sheetValues={{
              mentorAligned: pendingChecklist.mentorAligned ?? rec.mentorAligned,
              prepDocShared: pendingChecklist.prepDocShared ?? rec.prepDocShared,
              assignmentReview: pendingChecklist.assignmentReview ?? rec.assignmentReview,
              mockDoneByPoc: pendingChecklist.mockDoneByPoc ?? rec.mockDoneByPoc,
            }}
            onToggle={handleChecklistToggle}
            documents={currentDocs}
            onAddDocuments={handleAddDocuments}
            onUpdateDocument={handleUpdateDocument}
            onRemoveDocument={handleRemoveDocument}
          />
        </div>
      </div>

      {/* Candidates strip — names of students linked to this LMP */}
      <div className="rounded-2xl border border-n200 bg-card shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.7px] text-n600">
              Candidates
            </h4>
            <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-n100 text-n700 text-[10.5px] font-semibold tabular-nums">
              {(existingCandidates as any[]).length}
            </span>
          </div>
          {(existingCandidates as any[]).length > 5 && (
            <span className="text-[11px] text-n500">Showing first 5</span>
          )}
        </div>
        {(existingCandidates as any[]).length === 0 ? (
          <p className="text-[12px] italic text-n400">No candidates added yet.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {(existingCandidates as any[]).slice(0, 5).map((c: any) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-n200 bg-n50 hover:bg-card hover:border-n300 px-2.5 py-1 text-[11.5px] text-n700 transition-colors"
                title={c.pipeline_stage ? `${c.student_name} · ${c.pipeline_stage}` : c.student_name}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
                {c.student_name}
              </span>
            ))}
            {(existingCandidates as any[]).length > 5 && (
              <span className="inline-flex items-center rounded-full bg-n100 text-n600 px-2.5 py-1 text-[11.5px] font-medium">
                +{(existingCandidates as any[]).length - 5} more
              </span>
            )}
          </div>
        )}
      </div>

      {/* ROW 2 — Context layer */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MentorSnapshotCard rec={rec} mode={mode} onAlignMentor={handleAlignMentor} />
        <DocumentsCard
          mode={mode}
          documents={currentDocs}
          onAdd={handleAddDocuments}
          onUpdate={handleUpdateDocument}
          onRemove={handleRemoveDocument}
        />
        <PipelineSnapshotCard
          rec={rec}
          mode={mode}
          rounds={FIXED_PIPELINE_ROUNDS}
          candidates={(existingCandidates as any[]).map((c) => ({
            id: c.id,
            studentId: c.student_id || undefined,
            name: c.student_name,
            initials: "",
            color: "",
            cohort: c.pipeline_stage || "Pool",
            roundId: resolveStageToRoundId(c.pipeline_stage, FIXED_PIPELINE_ROUNDS),
          }))}
        />
      </div>

      {addOpen && (
        <AddCandidatesModalPersist
          open={addOpen}
          onOpenChange={setAddOpen}
          lmpId={rec.id}
          company={rec.company}
          role={rec.role}
          dbLmpId={dbLmpId}
          existingStudentIds={(existingCandidates as any[]).map((c) => c.student_id).filter(Boolean) as string[]}
          rounds={FIXED_PIPELINE_ROUNDS}
        />
      )}

      <AddOutreachPocDialog
        open={outreachOpen}
        onOpenChange={setOutreachOpen}
        lmpId={rec.id}
        lmpLabel={`${rec.role} @ ${rec.company}`}
        currentOutreachPocName={rec.outreachPoc?.name ?? null}
      />

      <ReassignPocModal
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        lmpId={rec.id}
        lmpLabel={`${rec.role} @ ${rec.company}`}
        scope={canReassignAll ? "all" : "support_outreach"}
      />
      <OutreachFeedbackHistoryModal
        open={feedbackHistoryOpen}
        onOpenChange={setFeedbackHistoryOpen}
        lmpId={rec.id}
      />
      <OutreachFeedbackModal
        open={pendingNotConvertedFeedback}
        lmpId={rec.id}
        onClose={() => setPendingNotConvertedFeedback(false)}
      />
    </div>
  );
}

function AddCandidatesModalPersist({
  open,
  onOpenChange,
  dbLmpId,
  existingStudentIds,
  rounds,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lmpId: string;
  company: string;
  role: string;
  dbLmpId?: string;
  existingStudentIds: string[];
  rounds?: import("@/lib/lmpProcessMutations").Round[];
}) {
  const addMutation = useAddLmpCandidates();
  return (
    <AddCandidatesModal
      open={open}
      onOpenChange={onOpenChange}
      existingIds={existingStudentIds}
      rounds={rounds}
      defaultRoundId="pool"
      onAdd={(newCandidates) => {
        if (newCandidates.length === 0 || !dbLmpId) return;
        addMutation.mutate(
          newCandidates.map((c) => ({
            lmp_id: dbLmpId,
            student_name: c.name,
            student_id: c.studentId,
            pipeline_stage: c.roundId || "pool",
            metadata: c.metadata,
          })),
        );
      }}
    />
  );
}
