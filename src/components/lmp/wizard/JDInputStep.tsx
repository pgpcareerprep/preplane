import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  CloudUpload,
  FileText,
  X,
  AlertTriangle,
  Info,
  Zap,
  Users,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { detectDomain, KNOWN_DOMAINS, type DomainDetectionResult } from "@/lib/domainDetection";
import type { ParsedJD } from "./AIPreviewPanel";
import { extractTextFromFile } from "@/lib/jdExtract";
import { AddCandidatesModal } from "@/components/lmp/detail/AddCandidatesModal";
import type { Candidate } from "@/lib/lmpProcessMutations";
import { toast } from "sonner";

type ProcessType = "full-time" | "internship";

export type JDInputExtras = {
  jdText: string;
  jdFile?: File;
  selectedCandidates: Candidate[];
};

export type JDInputInitial = {
  company?: string;
  role?: string;
  type?: ProcessType;
  domain?: string;
  jdText?: string;
  jdFileName?: string;
  selectedCandidates?: Candidate[];
};

/**
 * Step 1 — Basic Info.
 * Company + Role + collapsible sections for JD upload and Candidates.
 */
export function JDInputStep({
  onContinue,
  initial,
  onSaveDraft,
}: {
  onContinue: (data: ParsedJD, extras: JDInputExtras) => void;
  initial?: JDInputInitial;
  onSaveDraft?: (payload: {
    company: string;
    role: string;
    type: ProcessType;
    domain: string;
    jdText: string;
    jdFileName?: string;
    selectedCandidates: Candidate[];
  }) => Promise<void> | void;
}) {
  const [company, setCompany] = useState(initial?.company ?? "");
  const [role, setRole] = useState(initial?.role ?? "");
  const [processType, setProcessType] = useState<ProcessType>(initial?.type ?? "full-time");
  const [detectedDomain, setDetectedDomain] = useState<DomainDetectionResult | null>(null);
  const [domainOverride, setDomainOverride] = useState(initial?.domain ?? "");
  const debounceRef = useRef<number | null>(null);

  // Collapsible sections
  const [jdOpen, setJdOpen] = useState(!!initial?.jdText);

  // JD section state
  const [jdText, setJdText] = useState(initial?.jdText ?? "");
  const [jdFile, setJdFile] = useState<File | undefined>();
  const [jdFileName, setJdFileName] = useState<string | undefined>(initial?.jdFileName);
  const [jdDrag, setJdDrag] = useState(false);
  const [jdParsing, setJdParsing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Candidates section state
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [selectedCandidates, setSelectedCandidates] = useState<Candidate[]>(initial?.selectedCandidates ?? []);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      const result = detectDomain(role);
      setDetectedDomain(result);
      if (result) setDomainOverride("");
    }, 300);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [role]);

  const activeDomain = domainOverride || detectedDomain?.domain || "";
  const canContinue = company.trim().length > 0 && role.trim().length > 0 && activeDomain.length > 0;

  const handleJdFile = async (file: File) => {
    setJdFile(file);
    setJdFileName(file.name);
    setJdParsing(true);
    try {
      const text = await extractTextFromFile(file);
      setJdText(text.slice(0, 5000));
      toast.success("JD extracted", { description: `${file.name} parsed.` });
    } catch (e: any) {
      toast.error("Could not parse JD", { description: e?.message ?? "Unsupported file." });
    } finally {
      setJdParsing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;
    setSavingDraft(true);
    try {
      await onSaveDraft({
        company: company.trim(),
        role: role.trim(),
        type: processType,
        domain: activeDomain,
        jdText,
        jdFileName,
        selectedCandidates,
      });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 1500);
    } finally {
      setSavingDraft(false);
    }
  };
  const canSaveDraft = company.trim().length > 0 || role.trim().length > 0;

  const handleContinue = () => {
    if (!canContinue) return;
    onContinue(
      {
        role: role.trim(),
        company: company.trim(),
        domain: activeDomain,
        seniority: "Unspecified",
        requiredSkills: [],
        preferredSkills: [],
        confidence: detectedDomain?.confidence ?? 100,
        // Carry the selected process type forward so create flow uses it.
        processType,
      } as ParsedJD & { processType: ProcessType },
      { jdText, jdFile, selectedCandidates },
    );
  };

  return (
    <div>
      <h3 className="text-[20px] font-semibold text-n900 tracking-[-0.3px]">Process Details</h3>
      <p className="text-[13px] text-n500 mt-1">Enter company and role — the engine does the rest.</p>

      <div className="mt-5 space-y-4">
        {/* Company + Role */}
        <div className="grid md:grid-cols-2 gap-3">
          <Field label="Company Name" value={company} onChange={setCompany} placeholder="e.g. Flipkart, Razorpay" required />
          <Field label="Role Title" value={role} onChange={setRole} placeholder="e.g. Product Intern, Growth Associate" required />
        </div>

        {/* Auto Domain Detection */}
        <AnimatePresence mode="wait">
          {role.trim().length >= 2 && (
            <motion.div
              key="domain-detection"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
            >
              {detectedDomain ? (
                <div className="rounded-xl border border-sage-200 bg-sage-50/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="h-4 w-4 text-sage-600" strokeWidth={2} />
                    <span className="text-[12px] font-semibold text-sage-700 uppercase tracking-[0.5px]">
                      Domain Auto-Detected
                    </span>
                    <span className="ml-auto text-[11px] text-sage-600 tabular-nums font-medium">
                      {detectedDomain.confidence}% confidence
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center rounded-full bg-card border border-sage-200 text-sage-700 px-3 py-1 text-[13px] font-semibold shadow-xs">
                      {detectedDomain.domain}
                    </span>
                    <button
                      onClick={() => setDomainOverride(detectedDomain.domain)}
                      className="text-[11px] text-n500 hover:text-n800 underline underline-offset-2"
                    >
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-yellow-200 bg-yellow-50/60 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" strokeWidth={2} />
                    <span className="text-[12px] font-semibold text-yellow-700">
                      Could not auto-detect domain
                    </span>
                  </div>
                  <label className="block text-[12px] font-medium text-n600 mb-1.5">Select domain to continue</label>
                  <select
                    value={domainOverride}
                    onChange={(e) => setDomainOverride(e.target.value)}
                    className="w-full max-w-xs h-9 rounded-[10px] border border-n300 bg-card px-3 text-[14px] text-n800 focus:outline-none focus:border-orange-400"
                  >
                    <option value="">Select…</option>
                    {KNOWN_DOMAINS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              )}

              {domainOverride && (
                <div className="mt-2">
                  <label className="block text-[12px] font-medium text-n600 mb-1.5">Override domain</label>
                  <select
                    value={domainOverride}
                    onChange={(e) => setDomainOverride(e.target.value)}
                    className="w-full max-w-xs h-9 rounded-[10px] border border-n300 bg-card px-3 text-[14px] text-n800 focus:outline-none focus:border-orange-400"
                  >
                    <option value="">Use auto-detected</option>
                    {KNOWN_DOMAINS.map((d) => <option key={d}>{d}</option>)}
                  </select>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Process Type */}
        <div>
          <label className="block text-[13px] font-medium text-n600 mb-1.5">Type</label>
          <div className="flex gap-2">
            {(["full-time", "internship"] as ProcessType[]).map((t) => (
              <button
                key={t}
                onClick={() => setProcessType(t)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[13px] font-medium border transition-colors",
                  processType === t
                    ? "bg-orange-50 border-orange-300 text-orange-700"
                    : "bg-card border-n200 text-n600 hover:border-n300",
                )}
              >
                {t === "full-time" ? "Full Time" : "Internship"}
              </button>
            ))}
          </div>
        </div>

        {/* Collapsible: JD Upload */}
        <CollapsibleSection
          open={jdOpen}
          onToggle={() => setJdOpen((v) => !v)}
          icon={<FileText className="h-4 w-4 text-n500" strokeWidth={1.75} />}
          title="Job Description (optional)"
          subtitle="Paste or upload a JD to enable full expertise scoring"
          badge={jdText || jdFile ? "Added" : undefined}
        >
          <div className="space-y-3">
            {/* Dropzone */}
            <label
              onDragOver={(e) => { e.preventDefault(); setJdDrag(true); }}
              onDragLeave={() => setJdDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setJdDrag(false);
                const f = e.dataTransfer.files?.[0];
                if (f) handleJdFile(f);
              }}
              className={cn(
                "block h-[120px] rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all",
                jdDrag ? "border-orange-500 bg-orange-50" : "border-n300 hover:border-orange-500 hover:bg-orange-50/50",
              )}
            >
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                className="sr-only"
                onChange={(e) => e.target.files?.[0] && handleJdFile(e.target.files[0])}
              />
              <CloudUpload className="h-6 w-6 text-n400" strokeWidth={1.5} />
              <div className="mt-1.5 text-[13px] text-n600">
                {jdParsing ? "Parsing…" : "Drop JD file or click to browse"}
              </div>
              <div className="text-[11px] text-n400 mt-0.5">PDF, DOCX, TXT</div>
            </label>

            {jdFile && (
              <div className="flex items-center gap-2 rounded-lg border border-n200 bg-n50 px-3 py-2">
                <FileText className="h-4 w-4 text-n500" strokeWidth={1.75} />
                <span className="flex-1 text-[12px] text-n700 truncate">{jdFile.name}</span>
                <button
                  onClick={() => { setJdFile(undefined); setJdText(""); }}
                  className="text-n500 hover:text-coral-600"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <textarea
              value={jdText}
              onChange={(e) => setJdText(e.target.value.slice(0, 5000))}
              placeholder="…or paste JD text here"
              className="w-full min-h-[120px] rounded-[10px] border border-n300 bg-card px-3 py-2.5 text-[14px] text-n800 placeholder:text-n400 focus:outline-none focus:border-orange-400"
            />
            <div className="flex items-start gap-2 rounded-lg bg-sky-400/10 border border-sky-400/30 p-3">
              <Info className="h-4 w-4 text-sky-400 mt-0.5" strokeWidth={2} />
              <p className="text-[12px] text-n700 leading-relaxed">
                Adding a JD enables <span className="font-semibold">Full Scoring mode</span> with expertise matching.
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Students — click opens add modal */}
        <button
          type="button"
          onClick={() => setCandidateModalOpen(true)}
          className="w-full flex items-center justify-between rounded-xl border border-n200 bg-card px-4 py-3.5 text-left hover:border-orange-400 hover:bg-orange-50/40 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-9 w-9 rounded-lg bg-n100 grid place-items-center shrink-0">
              <Users className="h-4 w-4 text-n500" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-n800">Students (optional)</div>
              <div className="text-[11px] text-n500">Pick from the student database or bulk upload CVs</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-orange-600 shrink-0">
            <Plus className="h-3.5 w-3.5" strokeWidth={2} />
            Add
            {selectedCandidates.length > 0 ? ` (${selectedCandidates.length})` : ""}
          </span>
        </button>

        {selectedCandidates.length > 0 && (
          <div className="flex flex-wrap gap-1.5 -mt-1">
            {selectedCandidates.map((c) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1.5 rounded-full bg-n100 border border-n200 pl-2.5 pr-1 py-1 text-[12px] text-n800"
              >
                <span className={cn("h-5 w-5 rounded-full grid place-items-center text-[9px] font-semibold", c.color || "bg-n200 text-n700")}>
                  {c.initials || "??"}
                </span>
                <span className="truncate max-w-[140px]">{c.name}</span>
                <button
                  type="button"
                  onClick={() => setSelectedCandidates((p) => p.filter((x) => x.id !== c.id))}
                  className="ml-0.5 h-4 w-4 grid place-items-center rounded-full hover:bg-n200 text-n500"
                  aria-label={`Remove ${c.name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Continue */}
      <div className="mt-6 flex flex-col-reverse md:flex-row md:items-center md:justify-end gap-3">
        {onSaveDraft && (
          <button
            type="button"
            disabled={!canSaveDraft || savingDraft}
            onClick={handleSaveDraft}
            className={cn(
              "px-5 py-3 rounded-md text-[14px] font-medium border transition-colors w-full md:w-auto",
              canSaveDraft
                ? "bg-card border-n300 text-n800 hover:border-orange-400 hover:bg-orange-50/40"
                : "bg-n50 border-n200 text-n400 cursor-not-allowed",
            )}
          >
            {savingDraft ? "Saving…" : draftSaved ? "Saved ✓" : "Save as Draft"}
          </button>
        )}
        <button
          disabled={!canContinue}
          onClick={handleContinue}
          className={cn(
            "px-6 py-3 rounded-md text-[16px] font-medium transition-colors w-full md:w-auto",
            canContinue
              ? "bg-orange-500 hover:bg-orange-600 text-white shadow-sm"
              : "bg-n100 text-n400 cursor-not-allowed",
          )}
        >
          Continue → Auto Allocate POCs
        </button>
      </div>

      {/* Modal */}
      <AddCandidatesModal
        open={candidateModalOpen}
        onOpenChange={setCandidateModalOpen}
        existingIds={selectedCandidates.map((c) => c.id)}
        onAdd={(newOnes) => {
          setSelectedCandidates((p) => {
            const seen = new Set(p.map((x) => x.id));
            return [...p, ...newOnes.filter((n) => !seen.has(n.id))];
          });
        }}
      />
    </div>
  );
}

function CollapsibleSection({
  open,
  onToggle,
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-n200 bg-card overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-n50 transition-colors"
      >
        <span className="h-8 w-8 rounded-lg bg-n100 grid place-items-center shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[13.5px] font-semibold text-n900">{title}</span>
          {subtitle && <span className="block text-[11.5px] text-n500 mt-0.5">{subtitle}</span>}
        </span>
        {badge && (
          <span className="rounded-full bg-sage-50 border border-sage-200 text-sage-700 text-[11px] font-medium px-2 py-0.5">
            {badge}
          </span>
        )}
        <ChevronDown className={cn("h-4 w-4 text-n500 transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-n100">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, required,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-n600 mb-1.5">
        {label}
        {required && <span className="text-coral-500 ml-0.5">*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 rounded-[10px] border border-n300 bg-card px-3 text-[14px] text-n800 placeholder:text-n400 focus:outline-none focus:border-orange-400"
      />
    </div>
  );
}
