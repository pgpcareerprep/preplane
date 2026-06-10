import { useMemo, useState, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Plus, Upload, FileText, CheckCircle2, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { JdButton } from "@/components/lmp/JdButton";
import type { Requisition, Candidate } from "@/lib/lmpProcessMutations";
import { cn } from "@/lib/utils";
import { useIsViewingAsOther, useRole } from "@/lib/rolesContext";
import { type LmpRecord, HEALTH_META, STATUS_META } from "@/lib/lmpTypes";
import { useLmpRows } from "@/lib/sheets/hooks";
import { useLmpCandidates, useAddLmpCandidates } from "@/lib/hooks/useDbData";
import { useDbLmpId } from "@/lib/hooks/useDbLmpId";
import { useLmpRounds } from "@/lib/hooks/useLmpRounds";
import { DEFAULT_ROUNDS, type Round } from "@/lib/lmpProcessMutations";
import { DualPocRow } from "@/components/lmp/DualPocRow";
import { LmpTimeline } from "@/components/lmp/detail/LmpTimeline";
import { AddCandidatesModal } from "./AddCandidatesModal";
import { DailyProgressSummaryCard } from "@/components/lmp/summary/DailyProgressSummaryCard";
import { ChecklistSummaryCard } from "@/components/lmp/summary/ChecklistSummaryCard";
import { DocumentsCard, type DocumentLink } from "@/components/lmp/bento/DocumentsCard";
import { MentorSnapshotCard } from "@/components/lmp/bento/MentorSnapshotCard";
import { saveJd, getJd, deleteJd, useJd, extractSkillsFromText, extractSeniority, type JdData } from "@/lib/jdStore";
import { resolveStageToRoundId } from "@/lib/pipelineStage";

const SESSION_PILL: Record<string, string> = {
  Scheduled: "bg-teal-50 text-teal-600 border-teal-200",
  Completed: "bg-sage-50 text-sage-600 border-sage-200",
  Cancelled: "bg-coral-50 text-coral-600 border-coral-200",
};

export function OverviewTab({ req, candidates }: { req: Requisition; candidates: Candidate[] }) {
  const [addOpen, setAddOpen] = useState(false);

  const { data: lmpRecords = [] } = useLmpRows();
  const lmp = useMemo<LmpRecord | undefined>(
    () => lmpRecords.find((r) => r.reqId === req.id),
    [req.id, lmpRecords],
  );
  const status: LmpRecord["status"] = lmp?.status ?? "ongoing";
  const lmpId = lmp?.id ?? req.id;

  // Resolve DB UUID via LMP code first (stable), then UUID, then company+role.
  const dbLmpId = useDbLmpId({
    id: lmp?.id || req.id,
    lmpCode: (lmp as any)?.lmpCode || (lmp as any)?.lmp_code || (req as any)?.lmpCode,
    company: lmp?.company || req.company,
    role: lmp?.role || req.role,
  });

  // Fetch candidates from DB using the resolved UUID
  const { data: dbCandidates = [] } = useLmpCandidates(dbLmpId);
  const addCandidatesMutation = useAddLmpCandidates();
  const { data: rounds = DEFAULT_ROUNDS } = useLmpRounds(dbLmpId);

  // DB is the single source of truth — do NOT merge with prop candidates
  // (props are sourced from mock/sheet data and re-mount on navigation,
  // causing CV-upload rows to vanish and stale entries to reappear).
  const allCandidates = useMemo<Candidate[]>(() => {
    return (dbCandidates as any[]).map((c: any) => ({
      id: c.id,
      studentId: c.student_id || undefined,
      name: c.student_name,
      initials: (c.student_name || "").split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? "").join("") || "??",
      color: "bg-orange-200 text-orange-600",
      cohort: c.pipeline_stage || "Pool",
      roundId: resolveStageToRoundId(c.pipeline_stage, rounds),
    }));
  }, [dbCandidates, rounds]);

  const handleAddCandidates = async (items: Candidate[]) => {
    if (!dbLmpId) {
      toast.error("Cannot add candidates", { description: "LMP process not yet linked to database." });
      return;
    }
    if (items.length === 0) return;

    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const rows: { lmp_id: string; student_name: string; student_id?: string; pipeline_stage?: string }[] = [];
      const failures: string[] = [];

      for (const c of items) {
        let studentId = c.studentId;
        if (!studentId) {
          const { data: stub, error: stubErr } = await supabase
            .from("students")
            .insert({
              name: c.name,
              roll_no: `CV-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              sync_source: "cv_upload",
            })
            .select("id")
            .single();
          if (stubErr) {
            console.warn("[OverviewTab] failed to create stub student for", c.name, stubErr);
            failures.push(c.name);
            continue;
          }
          studentId = stub?.id;
        }
        rows.push({
          lmp_id: dbLmpId,
          student_name: c.name,
          student_id: studentId,
          pipeline_stage: (c.roundId || "shortlisted") as string,
        });
      }

      if (!rows.length) {
        toast.error("Failed to add candidates", {
          description: failures.length ? `Could not create student records for: ${failures.join(", ")}` : "No valid candidates to add.",
        });
        return;
      }

      addCandidatesMutation.mutate(rows, {
        onSuccess: () => {
          toast.success(`${rows.length} candidate${rows.length === 1 ? "" : "s"} added`);
          if (failures.length) {
            toast.warning(`${failures.length} skipped`, { description: failures.join(", ") });
          }
        },
        onError: (err: any) => {
          toast.error("Failed to add candidates", { description: err?.message ?? "Unknown error" });
        },
      });
    } catch (err: any) {
      toast.error("Failed to add candidates", { description: err?.message ?? "Unknown error" });
    }
  };

  return (
    <div className="space-y-6">
      {/* Pentogrid: left = narrative (JD + Timeline), right = execution panels */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* LEFT — primary narrative */}
        <div className="lg:col-span-3 space-y-6">
          <JdSummaryCard req={req} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DailyProgressSummaryCard lmpId={lmpId} />
            <ChecklistSummaryCard lmpId={lmpId} lmp={lmp} />
          </div>
          {lmp && (
            <MentorSnapshotCard rec={lmp} mode="summary" />
          )}
          {lmp && (
            <DocumentsCard
              mode="summary"
              documents={(lmp.documents as DocumentLink[]) ?? []}
            />
          )}
          <LmpTimeline lmpId={lmpId} />
        </div>

        {/* RIGHT — execution panels */}
        <div className="lg:col-span-2 space-y-4">
          <CandidatesCard
            candidates={allCandidates}
            rounds={rounds}
            onAdd={() => setAddOpen(true)}
          />
          <SessionsCard />
          <StatusChangeCard status={status} />
        </div>
      </div>

      <AddCandidatesModal
        open={addOpen}
        onOpenChange={setAddOpen}
        existingIds={allCandidates.map((c) => c.studentId).filter(Boolean) as string[]}
        existingNames={allCandidates.map((c) => (c.name || "").trim().toLowerCase()).filter(Boolean)}
        onAdd={handleAddCandidates}
        rounds={rounds}
      />
    </div>
  );
}

/* ───────────────── JD Summary (collapsible) ───────────────── */

function JdSummaryCard({ req }: { req: Requisition }) {
  const [expanded, setExpanded] = useState(false);
  const [jdData, setJdData] = useJd(req.id);
  const [uploading, setUploading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compactFields = [
    { l: "Company", v: req.company },
    { l: "Role", v: req.role },
    { l: "Domain", v: req.domain },
    { l: "Seniority", v: req.seniority },
    { l: "Industry", v: "Internet · SaaS" },
  ];

  const handleJdUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setParseError(null);

    try {
      let text = "";

      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        text = await file.text();
      } else if (file.name.endsWith(".pdf") || file.name.endsWith(".docx")) {
        text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            const clean = result.replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s+/g, " ").trim();
            resolve(clean.length > 50 ? clean : `JD for ${req.role} at ${req.company}`);
          };
          reader.onerror = () => resolve(`JD for ${req.role} at ${req.company}`);
          reader.readAsText(file);
        });
      }

      if (text.length < 30) {
        text = `${req.role} at ${req.company}. Domain: ${req.domain}. Seniority: ${req.seniority}.`;
      }

      const skills = extractSkillsFromText(text + " " + req.role + " " + req.domain);
      const seniority = extractSeniority(text + " " + req.role + " " + (req.seniority || ""));

      const data: JdData = {
        lmpId: req.id,
        fileName: file.name,
        rawText: text.slice(0, 5000),
        skills,
        seniority,
        role: req.role,
        company: req.company,
        uploadedAt: new Date().toISOString(),
        source: "file",
      };

      saveJd(data);
      setJdData(data);
    } catch {
      setParseError("Could not read file. Please try a .txt or .pdf.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemoveJd = () => {
    deleteJd(req.id);
    setJdData(null);
  };

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
              lmpId={req.id}
              role={req.role}
              company={req.company}
              domain={req.domain}
              seniority={req.seniority}
              compact
              onChange={(data) => setJdData(data)}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            {compactFields.map((f) => (
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
            <div className="px-5 pb-5 pt-3 space-y-4 border-t border-n100">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt"
                className="hidden"
                onChange={handleJdUpload}
              />

              {/* Uploading state */}
              {uploading && (
                <div className="flex items-center gap-2 text-[13px] text-n500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Reading JD document…
                </div>
              )}

              {/* No JD uploaded */}
              {!uploading && !jdData && (
                <div className="text-center py-4">
                  <Upload className="h-8 w-8 text-n300 mx-auto mb-2" strokeWidth={1.5} />
                  <p className="text-[14px] font-medium text-n700 mb-1">No JD uploaded yet</p>
                  <p className="text-[12px] text-n400 mb-3 max-w-xs mx-auto">
                    Upload a PDF or DOCX to enable mentor matching for this process.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 shadow-sm transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload JD
                  </button>
                  {parseError && (
                    <p className="mt-2 text-[12px] text-red-500">{parseError}</p>
                  )}
                </div>
              )}

              {/* JD uploaded — show metadata */}
              {!uploading && jdData && (
                <div className="space-y-3">
                  {/* File badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 text-orange-500 shrink-0" />
                      <span className="text-[13px] font-medium text-n800 truncate">
                        {jdData.fileName}
                      </span>
                      <span className="text-[11px] text-n400 shrink-0">
                        · Uploaded{" "}
                        {new Date(jdData.uploadedAt).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <button
                      onClick={handleRemoveJd}
                      className="p-1 rounded hover:bg-n100 text-n400 hover:text-red-500 transition-colors"
                      title="Remove JD"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Extracted skills */}
                  {jdData.skills.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.5px] text-n400 font-medium mb-1.5">
                        Skills detected from JD
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {jdData.skills.map((skill) => (
                          <span
                            key={skill}
                            className="rounded-full bg-n100 border border-n200 px-2 py-0.5 text-[11px] text-n600 font-medium"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* JD text preview */}
                  {jdData.rawText && (
                    <div>
                      <p className="text-[12px] text-n500 leading-relaxed">
                        {jdData.rawText.slice(0, 400)}
                        {jdData.rawText.length > 400 ? "…" : ""}
                      </p>
                    </div>
                  )}

                  {/* Ready indicator */}
                  <div className="flex items-center gap-1.5 text-[12px] text-teal-600 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    JD uploaded · Mentor matching is enabled for this process
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ───────────────── POC Assignment ───────────────── */

function PocAssignmentCard({ req }: { req: Requisition }) {
  return (
    <div className="rounded-xl bg-card shadow-sm border border-n200 p-4">
      <h5 className="text-[13px] font-semibold text-n800 mb-3">POC Assignment</h5>
      <DualPocRow
        prepPoc={req.prepPoc || req.domainPrepPoc}
        supportPoc={req.supportPoc}
        outreachPoc={req.outreachPoc}
        tags={req.allocationTags}
        jdMode={req.jdMode}
      />
    </div>
  );
}

/* ───────────────── Candidates ───────────────── */

function CandidatesCard({
  candidates,
  rounds,
  onAdd,
}: {
  candidates: Candidate[];
  rounds?: Round[];
  onAdd: () => void;
}) {
  const roundLabel = (id: string) => {
    if (!id || id === "pool") return "Pool";
    const match = rounds?.find((r) => r.id === id);
    return match?.name ?? id.toUpperCase();
  };
  return (
    <div className="rounded-xl bg-card border border-n200 shadow-sm p-4">
      <div className="flex items-center justify-between">
        <h5 className="text-[13px] font-semibold text-n800">
          Candidates <span className="text-n400 font-normal">({candidates.length})</span>
        </h5>
        <button
          onClick={onAdd}
          className="h-7 w-7 grid place-items-center rounded-md border border-n200 bg-card text-n600 hover:text-orange-600 hover:border-orange-300 hover:bg-orange-50 transition-colors"
          aria-label="Add candidates"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        </button>
      </div>
      <ul className="mt-3 divide-y divide-n100">
        {candidates.slice(0, 5).map((c) => (
          <li key={c.id} className="py-2 flex items-center gap-2.5">
            <div
              className={cn(
                "h-7 w-7 rounded-full flex items-center justify-center text-[11px] font-semibold",
                c.color,
              )}
            >
              {c.initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-medium text-n800 truncate">{c.name}</div>
              <div className="text-[11px] text-n400">{c.cohort}</div>
            </div>
            <span className="rounded-full bg-n100 border border-n200 text-n600 px-2 py-0.5 text-[10px] uppercase tracking-[0.5px] font-medium">
              {roundLabel(c.roundId)}
            </span>
          </li>
        ))}
      </ul>
      {candidates.length > 5 && (
        <div className="mt-2 text-[12px] text-orange-600 font-medium">
          + {candidates.length - 5} more
        </div>
      )}
    </div>
  );
}

/* ───────────────── Sessions ───────────────── */

function SessionsCard() {
  return (
    <div className="rounded-xl bg-card border border-n200 shadow-sm p-4">
      <h5 className="text-[13px] font-semibold text-n800 mb-3">Sessions</h5>
      <p className="text-[12.5px] text-n500 italic">No sessions found for this LMP.</p>
    </div>
  );
}

/* ───────────────── Health & SLA ───────────────── */

function HealthSlaCard({
  health,
  slaDays,
  lastActivity,
}: {
  health: "Healthy" | "Slow" | "Stuck";
  slaDays: number;
  lastActivity: string;
}) {
  const meta = HEALTH_META[health];
  const pct = Math.min(100, (slaDays / 45) * 100);
  return (
    <div className="rounded-xl bg-card shadow-sm border border-n200 p-4">
      <h5 className="text-[13px] font-semibold text-n800 mb-3">Health & SLA</h5>
      <div
        className={cn(
          "inline-flex items-center gap-2 rounded-full bg-n100 border border-n200 px-3 h-7 text-[12px] font-medium",
          meta.text,
        )}
      >
        <span className={cn("h-2.5 w-2.5 rounded-full", meta.dot)} />
        {health}
      </div>

      <div className="mt-4">
        <div className="relative h-2 rounded-full bg-n100 overflow-hidden">
          <div className="absolute inset-y-0 left-0 bg-orange-500" style={{ width: `${pct}%` }} />
          <span
            className="absolute top-0 bottom-0 w-px bg-n300"
            style={{ left: `${(14 / 45) * 100}%` }}
          />
          <span
            className="absolute top-0 bottom-0 w-px bg-n300"
            style={{ left: `${(30 / 45) * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-n400 tabular-nums">
          <span>0d</span>
          <span>14d</span>
          <span>30d</span>
          <span>45d+</span>
        </div>
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div className="min-w-0">
          <div className="text-[11px] text-n500">Last activity</div>
          <div className="text-[12px] text-n700 truncate">
            {lastActivity.split(" — ")[0]}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-n500">Days open</div>
          <div className="text-[24px] font-bold text-n900 tabular-nums leading-none">
            {slaDays}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ───────────────── Status Change ───────────────── */

function StatusChangeCard({ status }: { status: keyof typeof STATUS_META }) {
  const { role } = useRole();
  const isViewingAsOther = useIsViewingAsOther();
  const canEdit = !isViewingAsOther && (role === "allocator" || role === "admin");
  const meta = STATUS_META[status];
  if (!canEdit) return null;
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
      <button className="w-full inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium h-9 shadow-sm transition-colors">
        Change Status →
      </button>
    </div>
  );
}
