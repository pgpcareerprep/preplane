import { useState, useCallback, useMemo, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, User, FileText, ExternalLink, Pencil } from "lucide-react";
import { ReassignPocModal } from "@/components/lmp/ReassignPocModal";
import { useRole } from "@/lib/rolesContext";
import { canPerform } from "@/lib/permissions";
import { useLmpMode } from "@/lib/lmpViewingContext";
import { JdButton } from "./JdButton";
import { cn } from "@/lib/utils";
import { type LmpRecord } from "@/lib/lmpTypes";
import { toast } from "sonner";
import { InteractivePipelineCard } from "./execution/InteractivePipelineCard";
import { ActivityTimelineCard } from "./execution/ActivityTimelineCard";
import { DailyProgressCard } from "./bento/DailyProgressCard";
import { ChecklistCard } from "./bento/ChecklistCard";
import { DocumentsCard, normalizeDocuments, type DocumentLink, type DocumentAddContext } from "./bento/DocumentsCard";
import type { DocumentLinkInput } from "./bento/DocumentLinkModal";
import { SessionsActionCard } from "./detail/sessions/SessionsActionCard";
import { useLmpMutation } from "@/lib/sheets/hooks";
import { useSaveNextProgressDate } from "@/lib/hooks/useProgressHistory";
import { useLmpProcesses, usePocProfiles } from "@/lib/hooks/useDbData";
import { resolvePocEmail } from "@/lib/poc/resolvePocEmail";
import { normalizeNextProgressType } from "@/lib/nextProgressType";
import { getJd, fetchJdFromDb, useJd, type JdData } from "@/lib/jdStore";
import { supabase } from "@/integrations/supabase/client";
import { useLmpPermission } from "@/lib/hooks/usePermissions";

export function UnifiedOverviewTab({
  lmp,
  onOpenSessionsTab,
  operationalReadOnly,
}: {
  lmp: LmpRecord;
  onOpenSessionsTab?: () => void;
  operationalReadOnly?: boolean;
}) {
  const lmpId = lmp.id;
  const { update: updateMutation } = useLmpMutation();
  const saveNextDateDb = useSaveNextProgressDate();
  const { data: dbProcesses = [] } = useLmpProcesses();
  const { data: pocProfiles = [] } = usePocProfiles();
  const { canManageLmp, canOperateLmp } = useLmpPermission({
    prep_poc: lmp.prepPoc?.name,
    support_poc: lmp.supportPoc?.name,
    outreach_poc: lmp.outreachPoc?.name,
    prep_poc_id: lmp.prepPocId,
    support_poc_id: lmp.supportPocId,
    outreach_poc_ids: lmp.outreachPocIds,
  });
  const operationalReadOnlyMode = operationalReadOnly ?? !canOperateLmp;
  const canEditDocuments = canManageLmp || canOperateLmp;

  const dbRow = useMemo(() => {
    return (dbProcesses as any[]).find(
      (p: any) =>
        p.company?.trim().toLowerCase() === lmp.company?.trim().toLowerCase() &&
        p.role?.trim().toLowerCase() === lmp.role?.trim().toLowerCase(),
    );
  }, [dbProcesses, lmp.company, lmp.role]);
  const dbLmpId = dbRow?.id as string | undefined;

  const prepPocEmail = useMemo(
    () =>
      resolvePocEmail(pocProfiles as any[], {
        id: dbRow?.prep_poc_id,
        name: lmp.prepPoc?.name,
      }),
    [pocProfiles, dbRow?.prep_poc_id, lmp.prepPoc?.name],
  );

  const supportPocEmail = useMemo(
    () =>
      resolvePocEmail(pocProfiles as any[], {
        id: dbRow?.support_poc_id,
        name: lmp.supportPoc?.name,
      }),
    [pocProfiles, dbRow?.support_poc_id, lmp.supportPoc?.name],
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

  const handleSaveProgress = useCallback(
    async (text: string) => {
      if (operationalReadOnlyMode) return;
      const today = new Date().toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
      });
      const entry = `[${today}] ${text}`;
      // Read fresh value from DB so concurrent/repeated saves all append
      // instead of overwriting with a stale closure value.
      const { data } = await supabase
        .from("lmp_processes")
        .select("daily_progress")
        .eq("id", lmp.id)
        .maybeSingle();
      const existing = ((data?.daily_progress as string | null) ?? "").trim();
      const next = existing ? `${entry}\n${existing}` : entry;
      updateMutation.mutate({
        id: lmp.id,
        patch: { dailyProgress: next },
      });
    },
    [lmp.id, operationalReadOnlyMode, updateMutation],
  );


  const handleSaveNextDate = useCallback(
    (date: string, type?: string, enableReminder: boolean = true) => {
      if (operationalReadOnlyMode) return;
      const reminderType = normalizeNextProgressType(type);
      const safeDate = date && date.trim() !== "" ? date : null;
      updateMutation.mutate({
        id: lmp.id,
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
    },
    [lmp.id, pocEmails, dbLmpId, operationalReadOnlyMode, updateMutation, saveNextDateDb],
  );

  const [pendingChecklist, setPendingChecklist] = useState<Record<string, boolean>>({});
  const handleChecklistToggle = useCallback(
    (sheetKey: string, newValue: boolean) => {
      if (operationalReadOnlyMode) return;
      setPendingChecklist((p) => ({ ...p, [sheetKey]: newValue }));
      updateMutation.mutate(
        { id: lmp.id, patch: { [sheetKey]: newValue } },
        {
          onSuccess: () => {
            toast.success(newValue ? "Checklist item marked done" : "Checklist item reopened");
          },
          onError: () => {
            setPendingChecklist((p) => {
              if (!(sheetKey in p)) return p;
              const { [sheetKey]: _, ...rest } = p;
              return rest;
            });
            toast.error("Failed to update checklist — please try again");
          },
        },
      );
    },
    [lmp.id, operationalReadOnlyMode, updateMutation],
  );

  // Documents — shared JSON array on lmp_processes.documents (checklist + general).
  const lmpDocuments = (lmp as any).documents;
  const currentDocs: DocumentLink[] = useMemo(
    () => normalizeDocuments(lmpDocuments),
    [lmpDocuments],
  );

  const persistDocs = useCallback(
    (next: DocumentLink[]) => {
      updateMutation.mutate({ id: lmp.id, patch: { documents: next as unknown as never } });
    },
    [lmp.id, updateMutation],
  );

  const genDocId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const handleAddDocuments = useCallback(
    (links: DocumentLinkInput[], ctx: DocumentAddContext) => {
      const now = new Date().toISOString();
      const additions: DocumentLink[] = links.map((l) => ({
        id: genDocId(),
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

  // Clear pending entries only once the refetched DB row matches the pending value.
  // Prevents the post-settle flicker (DB write done → pending cleared → stale row →
  // checkbox visibly reverts → refetched row arrives → flips back).
  useEffect(() => {
    setPendingChecklist((p) => {
      const keys = Object.keys(p);
      if (keys.length === 0) return p;
      let changed = false;
      const next: Record<string, boolean> = { ...p };
      for (const k of keys) {
        if (((lmp as any)[k] ?? false) === p[k]) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : p;
    });
  }, [lmp]);

  // Normalise next-expected date: drop Excel-serial junk like "46150" from sheet
  const safeNextDate = (() => {
    const raw = (lmp as any).next_progress_date || lmp.nextExpectedProgress;
    if (!raw) return null;
    const d = new Date(raw);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000 || d.getFullYear() > 2100) return null;
    return raw;
  })();

  return (
    <div className="space-y-4">
      <JdCollapsible lmp={lmp} canManageJd={canManageLmp} />

      {/* Daily Progress — full-width action card */}
      <DailyProgressCard
        lmpId={lmpId}
        mode={operationalReadOnlyMode ? "summary" : "action"}
        onSaveProgress={handleSaveProgress}
        onSaveNextDate={handleSaveNextDate}
        initialPrepProgress={lmp.prepProgress}
        sheetDailyProgress={lmp.dailyProgress}
        nextProgressDateFromDb={safeNextDate}
        reminderTypeFromDb={(lmp as any).next_progress_reminder_type || null}
        pocEmail={pocEmails[0] || prepPocEmail}
        lastProgressUpdatedAt={(lmp as any).last_progress_updated_at || null}
      />

      {/* Execution Checklist + Sessions row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChecklistCard
          lmpId={lmpId}
          mode={operationalReadOnlyMode ? "summary" : "action"}
          sheetValues={{
            mentorAligned: pendingChecklist.mentorAligned ?? lmp.mentorAligned,
            prepDocShared: pendingChecklist.prepDocShared ?? lmp.prepDocShared,
            assignmentReview: pendingChecklist.assignmentReview ?? lmp.assignmentReview,
            mockDoneByPoc: pendingChecklist.mockDoneByPoc ?? lmp.mockDoneByPoc,
          }}
          onToggle={handleChecklistToggle}
          documents={currentDocs}
          onAddDocuments={handleAddDocuments}
          onUpdateDocument={handleUpdateDocument}
          onRemoveDocument={handleRemoveDocument}
        />
        <SessionsActionCard reqId={lmpId} onOpenSessionsTab={onOpenSessionsTab} readOnly={operationalReadOnlyMode} />
      </div>

      {/* Pipeline */}
      <InteractivePipelineCard lmpId={lmpId} lmp={lmp} readOnly={operationalReadOnlyMode} canManage={canManageLmp} />


      {/* Documents */}
      <DocumentsCard
        mode={canEditDocuments ? "action" : "summary"}
        documents={currentDocs}
        onAdd={handleAddDocuments}
        onUpdate={handleUpdateDocument}
        onRemove={handleRemoveDocument}
      />

      {/* Activity Timeline */}
      <ActivityTimelineCard lmpId={lmpId} readOnly={operationalReadOnlyMode} />

      {/* POC Assignment */}
      <PocRow lmp={lmp} />

      {/* Process Metadata */}
      <ProcessMetaStrip lmp={lmp} />
    </div>
  );
}

function PocRow({ lmp }: { lmp: LmpRecord }) {
  const [reassignOpen, setReassignOpen] = useState(false);
  const { role } = useRole();
  const mode = useLmpMode(lmp);
  const canReassignAll = canPerform(role, "reassign_poc");
  const canReassignAny = canReassignAll;

  const pocs = [
    { label: "Prep POC", name: lmp.prepPoc?.name || lmp.domainPrepPoc?.name || "No POC assigned" },
    { label: "Support POC", name: lmp.supportPoc?.name || lmp.behavioralPrepPoc?.name || "—" },
    { label: "Outreach POC", name: lmp.outreachPoc?.name || "—" },
  ];

  return (
    <div className="relative rounded-2xl bg-card border border-n200 shadow-sm p-4">
      {canReassignAny && (
        <button
          type="button"
          onClick={() => setReassignOpen(true)}
          aria-label="Reassign POCs"
          title="Reassign POCs"
          className="absolute top-3 right-3 inline-flex items-center justify-center h-7 w-7 rounded-md text-n500 hover:text-orange-600 hover:bg-n100 transition-colors"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="grid grid-cols-3 gap-4">
        {pocs.map((p) => (
          <div key={p.label} className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-n100 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-n400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">
                {p.label}
              </div>
              <div className="text-[13px] text-n800 font-medium truncate">{p.name}</div>
            </div>
          </div>
        ))}
      </div>
      <ReassignPocModal
        open={reassignOpen}
        onOpenChange={setReassignOpen}
        lmpId={lmp.id}
        lmpLabel={`${lmp.role} @ ${lmp.company}`}
        scope={canReassignAll ? "all" : "support_outreach"}
      />
    </div>
  );
}

function JdCollapsible({ lmp, canManageJd = false }: { lmp: LmpRecord; canManageJd?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [jd] = useJd(lmp.id);

  useEffect(() => {
    if (!expanded || jd) return;
    // fetchJdFromDb writes to the store → useJd re-renders automatically.
    void fetchJdFromDb(lmp.id);
  }, [expanded, jd, lmp.id]);


  const jdLink = jd?.link || (lmp as any).jdUrl || (lmp as any).jd_url || "";
  const jdText = jd?.rawText?.trim() || "";
  const jdFileName = jd?.fileName || (lmp as any).jdLabel || (lmp as any).jd_label || (lmp as any).jd_file_name || "";
  const jdSkills = jd?.skills || [];
  const jdSeniority = jd?.seniority || "";
  const hasJd = Boolean(jdText || jdLink || jdFileName);

  const fields = [
    { l: "Company", v: lmp.company || "—" },
    { l: "Role", v: lmp.role || "—" },
    { l: "Domain", v: lmp.domain || "—" },
    { l: "Stage", v: lmp.stage || "—" },
    { l: "Type", v: lmp.type || "—" },
  ];

  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left p-5 flex items-start justify-between gap-4 hover:bg-n50/60 transition-colors"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-[15px] font-semibold text-n900">Job Description</h4>
            <JdButton
              lmpId={lmp.id}
              role={lmp.role || ""}
              company={lmp.company || ""}
              domain={lmp.domain}
              compact
              canManageJd={canManageJd}
            />

          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-3">
            {fields.map((f) => (
              <div key={f.l} className="min-w-0">
                <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">
                  {f.l}
                </div>
                <div className="mt-0.5 text-[13px] text-n800 truncate">{f.v}</div>
              </div>
            ))}
          </div>
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-n500 shrink-0 mt-1 transition-transform duration-200",
            expanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-3 border-t border-n100 space-y-3">
              {!hasJd && (
                <p className="text-[13px] text-n500 italic">
                  No JD attached yet. Use the button above to add a job description.
                </p>
              )}

              {hasJd && (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    {jdFileName && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-n50 border border-n200 text-[12px] text-n700">
                        <FileText className="h-3.5 w-3.5 text-n500" />
                        {jdFileName}
                      </span>
                    )}
                    {jdLink && (
                      <a
                        href={jdLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-orange-50 border border-orange-200 text-[12px] text-orange-700 hover:bg-orange-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open JD link
                      </a>
                    )}
                    {jdSeniority && (
                      <span className="px-2.5 py-1 rounded-full bg-n50 border border-n200 text-[12px] text-n700">
                        Seniority: {jdSeniority}
                      </span>
                    )}
                  </div>

                  {jdSkills.length > 0 && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
                        Parsed Skills
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {jdSkills.slice(0, 24).map((s) => (
                          <span
                            key={s}
                            className="px-2 py-0.5 rounded-md bg-n100 text-[11px] text-n700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {jdText && (
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
                        Job Description
                      </div>
                      <div className="max-h-80 overflow-y-auto rounded-lg bg-n50 border border-n200 p-3 text-[13px] text-n800 whitespace-pre-wrap leading-relaxed">
                        {jdText}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function ProcessMetaStrip({ lmp }: { lmp: LmpRecord }) {
  const items: { label: string; value?: string }[] = [
    { label: "LMP Code", value: lmp.lmpCode },
    { label: "Allocator", value: lmp.allocator },
    { label: "Admin Owner", value: lmp.adminOwner },
    { label: "Match Tag", value: lmp.matchTag },
    { label: "Allocation Path", value: lmp.allocationPath },
    { label: "Behavioral Status", value: lmp.behavioralStatus },
    { label: "Closing Date", value: lmp.closingDate },
  ];
  const visible = items.filter((i) => i.value && String(i.value).trim());
  if (visible.length === 0) return null;
  return (
    <section className="rounded-2xl bg-card border border-n200 shadow-sm p-4">
      <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-3">
        Process Metadata
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
        {visible.map((i) => (
          <div key={i.label} className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium">
              {i.label}
            </div>
            <div className="mt-0.5 text-[13px] text-n800 truncate">{i.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
