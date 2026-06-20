import { useRef, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { WizardSteps } from "@/components/lmp/wizard/WizardSteps";
import { JDInputStep, type JDInputExtras, type JDInputInitial } from "@/components/lmp/wizard/JDInputStep";
import { POCReviewStep, type POCReviewInitial } from "@/components/lmp/wizard/POCReviewStep";
import { DraftsTable } from "@/components/lmp/wizard/DraftsTable";
import type { ParsedJD } from "@/components/lmp/wizard/AIPreviewPanel";
import { createLmpProcess, DuplicateLmpError, type ConfirmedPocSelection, type ExistingLmpSummary } from "@/lib/createLmpProcess";
import { TABS } from "@/lib/sheets";
import { useRole } from "@/lib/rolesContext";
import { PlaceholderView } from "@/components/PlaceholderView";
import { PlusCircle, Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { saveDraft, deleteDraft, type LmpDraft } from "@/lib/lmpDrafts";
import { saveJd, type JdData } from "@/lib/jdStore";

type JdWithProcessType = ParsedJD & { processType?: "internship" | "full-time" };

function resolveProcessType(jd: JdWithProcessType | null | undefined): "Internship" | "Full Time" {
  return jd?.processType === "internship" ? "Internship" : "Full Time";
}

export default function CreateLmpPage() {
  const { role, user } = useRole();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [jd, setJD] = useState<ParsedJD | null>(null);
  const [extras, setExtras] = useState<JDInputExtras | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [step1Initial, setStep1Initial] = useState<JDInputInitial | undefined>();
  const [step2Initial, setStep2Initial] = useState<POCReviewInitial | undefined>();
  // Force re-mount of JD step when resuming a draft
  const [wizardKey, setWizardKey] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [duplicatePrompt, setDuplicatePrompt] = useState<{
    existing: ExistingLmpSummary;
    selection: ConfirmedPocSelection;
  } | null>(null);
  const pendingCreateSignatureRef = useRef<string | null>(null);

  if (role !== "allocator" && role !== "admin") {
    return (
      <PlaceholderView
        eyebrow="Restricted"
        title="Create a"
        tagline="process"
        description="Switch to an Admin or Allocator role to access this wizard."
        icon={PlusCircle}
        scopedTo={["admin", "allocator"]}
      />
    );
  }

  const resumeDraft = (d: LmpDraft) => {
    setDraftId(d.id);
    setStep1Initial({
      company: d.company ?? "",
      role: d.role ?? "",
      type: (d.type === "Internship" ? "internship" : "full-time"),
      domain: d.domain ?? "",
      jdText: d.jd_text ?? "",
      jdFileName: d.jd_file_name ?? undefined,
      selectedCandidates: d.selected_candidates ?? [],
    });
    if (d.parsed_jd) {
      setJD(d.parsed_jd);
      setExtras({
        jdText: d.jd_text ?? "",
        selectedCandidates: d.selected_candidates ?? [],
      });
    }
    setStep2Initial(d.selection ?? undefined);
    setStep(d.step === 2 && d.parsed_jd ? 2 : 1);
    setWizardKey((k) => k + 1);
    toast.success("Draft resumed", { description: `${d.company ?? "Untitled"} — Step ${d.step}` });
  };

  const handleSaveDraftStep1: NonNullable<Parameters<typeof JDInputStep>[0]["onSaveDraft"]> = async (payload) => {
    try {
      const id = await saveDraft({
        step: 1,
        company: payload.company,
        role: payload.role,
        type: payload.type === "internship" ? "Internship" : "Full Time",
        domain: payload.domain,
        jd_text: payload.jdText,
        jd_file_name: payload.jdFileName ?? null,
        selected_candidates: payload.selectedCandidates,
        parsed_jd: null,
        selection: null,
        created_by_name: user.name,
      }, draftId);
      setDraftId(id);
      await queryClient.invalidateQueries({ queryKey: ["lmp-drafts"] });
      toast.success("Draft saved");
    } catch (e: any) {
      toast.error("Could not save draft", { description: e?.message });
    }
  };

  const handleSaveDraftStep2: NonNullable<Parameters<typeof POCReviewStep>[0]["onSaveDraft"]> = async (state) => {
    if (!jd || !extras) return;
    try {
      const id = await saveDraft({
        step: 2,
        company: jd.company,
        role: jd.role,
        domain: jd.domain,
        type: resolveProcessType(jd),
        jd_text: extras.jdText,
        jd_file_name: extras.jdFile?.name,
        selected_candidates: extras.selectedCandidates,
        parsed_jd: jd,
        selection: state,
        created_by_name: user.name,
      }, draftId);
      setDraftId(id);
      await queryClient.invalidateQueries({ queryKey: ["lmp-drafts"] });
      toast.success("Draft saved");
    } catch (e: any) {
      toast.error("Could not save draft", { description: e?.message });
    }
  };

  const createSignature = (selection: ConfirmedPocSelection) =>
    JSON.stringify({
      company: jd?.company?.trim().toLowerCase() ?? "",
      role: jd?.role?.trim().toLowerCase() ?? "",
      domain: jd?.domain?.trim().toLowerCase() ?? "",
      type: resolveProcessType(jd),
      prep: selection.prepPoc.pocId ?? selection.prepPoc.name,
      support: selection.supportPoc?.pocId ?? selection.supportPoc?.name ?? null,
      outreach: selection.outreachPoc?.pocId ?? selection.outreachPoc?.name ?? null,
      candidates: (extras?.selectedCandidates ?? []).map((c) => c.studentId ?? c.name).sort(),
    });

  const handleFinish = async (
    selection: ConfirmedPocSelection,
    options: { allowDuplicate?: boolean } = {}
  ) => {
    if (!jd) {
      toast.error("Missing process data", { description: "Please complete Basic Info first." });
      return;
    }

    const signature = createSignature(selection);
    if (isCreating || pendingCreateSignatureRef.current === signature) {
      return;
    }
    pendingCreateSignatureRef.current = signature;
    setIsCreating(true);
    setDuplicatePrompt(null);

    try {
      // Build JD payload from wizard state (paste or uploaded file).
      const skills = Array.from(
        new Set([...(jd.requiredSkills ?? []), ...(jd.preferredSkills ?? [])])
      );
      const hasJd = !!(extras?.jdText?.trim() || extras?.jdFile || skills.length);
      const jdPayload = hasJd
        ? {
            text: extras?.jdText?.trim() || "",
            fileName: extras?.jdFile?.name || (extras?.jdText ? "Pasted JD" : undefined),
            label: extras?.jdFile?.name || (extras?.jdText ? "Pasted JD" : undefined),
            skills,
            seniority: jd.seniority,
            source: (extras?.jdFile ? "file" : "paste") as "file" | "paste",
            uploadedBy: user?.email || user?.name,
          }
        : undefined;

      const created = await createLmpProcess({
        company: jd.company,
        role: jd.role,
        domain: jd.domain,
        type: resolveProcessType(jd),
        createdById: user.id,
        createdByName: user.name,
        selection,
        jd: jdPayload,
        allowDuplicate: options.allowDuplicate,
      });

      // Cache JD locally so the detail page renders instantly.
      if (jdPayload) {
        const jdLocal: JdData = {
          lmpId: created.id,
          fileName: jdPayload.fileName || "Pasted JD",
          rawText: jdPayload.text || "",
          skills: jdPayload.skills,
          seniority: jdPayload.seniority || "Mid",
          role: jd.role,
          company: jd.company,
          uploadedAt: new Date().toISOString(),
          source: jdPayload.source,
        };
        try { saveJd(jdLocal); } catch { /* non-fatal */ }
      }

      // Attach candidates picked / uploaded in Step 1
      const candidates = extras?.selectedCandidates ?? [];
      if (candidates.length > 0) {
        const rows = candidates.map((c) => ({
          lmp_id: created.id,
          student_name: c.name,
          student_id: c.studentId,
          pipeline_stage: "pool",
        }));
        const { error } = await supabase
          .from("lmp_candidates")
          .upsert(rows, { onConflict: "lmp_id,student_name", ignoreDuplicates: true });
        if (error) {
          toast.error("Process created, but candidate attach failed", { description: error.message });
        }
      }

      // Delete originating draft, if any
      if (draftId) {
        try { await deleteDraft(draftId); } catch { /* non-fatal */ }
      }

      // Optimistically add the new LMP to every active db-lmp-processes cache
      // slice so the board shows it immediately without waiting for refetch.
      queryClient.setQueriesData<any[]>(
        { queryKey: ["db-lmp-processes"], type: "all" },
        (old) => (old ? [created, ...old.filter((r) => r.id !== created.id)] : [created])
      );

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lmp_rows"] }),
        queryClient.invalidateQueries({ queryKey: ["db-lmp-processes"] }),
        queryClient.invalidateQueries({ queryKey: ["db-lmp-full-view"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-kpis"] }),
        queryClient.invalidateQueries({ queryKey: ["poc-profile-domains"] }),
        queryClient.invalidateQueries({ queryKey: ["poc_profiles_registry"] }),
        queryClient.invalidateQueries({ queryKey: ["db-poc-assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["db-poc-switcher-list"] }),
        queryClient.invalidateQueries({ queryKey: ["db-lmp-candidates"] }),
        queryClient.invalidateQueries({ queryKey: ["db-lmp-candidate-counts"] }),
        queryClient.invalidateQueries({ queryKey: ["sheets", TABS.LMP_TRACKER] }),
        queryClient.invalidateQueries({ queryKey: ["lmp-drafts"] }),
      ]);

      toast.success("Process created", {
        description: `Mapped to ${selection.prepPoc.name}${
          selection.supportPoc ? ` and ${selection.supportPoc.name}` : ""
        }${selection.outreachPoc ? `; outreach: ${selection.outreachPoc.name}` : ""}.${
          candidates.length ? ` ${candidates.length} candidate${candidates.length === 1 ? "" : "s"} attached.` : ""
        }`,
      });

      navigate(`/processes/${created.id}`);
    } catch (error: any) {
      if (error instanceof DuplicateLmpError) {
        setDuplicatePrompt({ existing: error.existing, selection });
        toast.warning("An LMP for this company and role already exists", {
          description: "Open the existing LMP, or confirm if you intentionally need another one.",
        });
        return;
      }
      toast.error("Process creation failed", {
        description: error.message ?? "Please check database and sheet sync.",
      });
    } finally {
      pendingCreateSignatureRef.current = null;
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
        className="relative overflow-hidden rounded-2xl surface-feature border border-orange-200/60 p-6 md:p-8 shadow-md"
      >
        <div className="pointer-events-none absolute -top-12 -right-10 h-48 w-48 rounded-full bg-orange-200/50 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-32 w-32 rounded-full bg-yellow-200/60 blur-3xl" />
        <div className="relative max-w-2xl">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-card/70 border border-white px-2.5 py-1 mb-3 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-orange-500" strokeWidth={2.25} />
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.6px] text-orange-600">AI-Assisted</span>
          </div>
          <h2 className="text-[36px] leading-[1.15] font-bold tracking-[-1px] text-n900">
            Create a <span className="font-display text-orange-500 text-[34px]">process</span>
          </h2>
          <p className="mt-2 text-[14px] text-n700 leading-[1.6]">
            Enter company + role — the engine auto-allocates the best POCs instantly.
          </p>
        </div>
      </motion.div>

      <div className="w-full rounded-2xl bg-card border border-n200 shadow-sm p-6 md:p-8">
        <WizardSteps current={step} />
        {step === 1 && (
          <JDInputStep
            key={`step1-${wizardKey}`}
            initial={step1Initial}
            onSaveDraft={handleSaveDraftStep1}
            onContinue={(d, ex) => {
              setJD(d);
              setExtras(ex);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <div className="relative">
            {duplicatePrompt && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-semibold">An LMP for this company and role already exists</div>
                <div className="mt-1 text-amber-800">
                  Existing process: {duplicatePrompt.existing.company ?? jd?.company} — {duplicatePrompt.existing.role ?? jd?.role}
                  {duplicatePrompt.existing.lmp_code ? ` (${duplicatePrompt.existing.lmp_code})` : ""}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/processes/${duplicatePrompt.existing.id}`)}
                    className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                  >
                    Open existing LMP
                  </button>
                  <button
                    type="button"
                    onClick={() => handleFinish(duplicatePrompt.selection, { allowDuplicate: true })}
                    disabled={isCreating}
                    className="rounded-md border border-amber-300 bg-card px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCreating ? "Creating…" : "Create another anyway"}
                  </button>
                </div>
              </div>
            )}
            <div className={isCreating ? "pointer-events-none opacity-60" : undefined} aria-busy={isCreating}>
              <POCReviewStep
                key={`step2-${wizardKey}`}
                initial={step2Initial}
                onSaveDraft={handleSaveDraftStep2}
                onContinue={handleFinish}
                onBack={() => setStep(1)}
                reqDomain={jd?.domain}
                companyName={jd?.company}
                roleTitle={jd?.role}
                jdText={
                  jd
                    ? `${jd.role} ${jd.company} ${jd.requiredSkills.join(" ")} ${jd.preferredSkills.join(" ")} ${extras?.jdText ?? ""}`
                    : null
                }
                parsedSkills={[...(jd?.requiredSkills ?? []), ...(jd?.preferredSkills ?? [])]}
              />
            </div>
            {isCreating && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/55 backdrop-blur-[1px]">
                <div className="rounded-full border border-orange-200 bg-card px-4 py-2 text-sm font-semibold text-orange-700 shadow-sm">
                  Creating LMP…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <DraftsTable onResume={resumeDraft} />
    </div>
  );
}
