import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { Sparkles, Upload, FileText, Check, AlertTriangle, X, Loader2, ClipboardPaste, Tag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { getJd, saveJd, fetchJdFromDb, useJd, extractSkillsFromText, extractSeniority, SKILL_KEYWORDS, type JdData } from "@/lib/jdStore";
import { getALUStore } from "@/lib/alumniStore";
import { useAlumniMentors } from "@/lib/hooks/useDbData";
import { getExternalDiscoveryConfig } from "@/lib/externalDiscoveryConfig";
import type { MentorSource } from "@/lib/mentor";
import type { MatchMode } from "@/lib/mentorMatching";

export type { MatchMode };

export type MatchContext = {
  jdMode: "jd" | "fallback";
  jdData: JdData | null;
  fallbackKeywords: string;
  useResumes: boolean;
  resumeSkills: string[];
  resumeGapSkills: string[];
  sources: MentorSource[];
  selectedSkills: string[];
  selectedIndustries: string[];
  matchMode: MatchMode;
};

const MATCH_MODES: { id: MatchMode; emoji: string; label: string; description: string }[] = [
  { id: "balanced", emoji: "⚖️", label: "Balanced",       description: "Equal weight across role, skills, company, industry." },
  { id: "role",     emoji: "🎯", label: "Role-First",     description: "Prioritise mentors with a matching title or function." },
  { id: "industry", emoji: "🏭", label: "Industry-First", description: "Prioritise mentors from the same sector or domain." },
  { id: "company",  emoji: "🏢", label: "Company-First",  description: "Prioritise mentors who worked at the target company." },
];

// We can't import getMUStore if it doesn't exist - read from DB mentors hook instead
// But for source counts we check localStorage directly
function getMUCount(): number {
  try {
    const raw = localStorage.getItem("mu_mentors_v1");
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.totalCount || 0;
    }
  } catch { /* ignore */ }
  return 0;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lmpId: string;
  role: string;
  company: string;
  domain: string;
  activeSources: MentorSource[];
  onConfirm: (context: MatchContext) => void;
  /** Fallback MU count from DB if localStorage is empty */
  dbMentorCount?: number;
};

export function MatchContextModal({
  open, onOpenChange, lmpId, role, company, domain, activeSources, onConfirm, dbMentorCount = 0,
}: Props) {
  const [jdData] = useJd(lmpId);
  const [jdLoading, setJdLoading] = useState(false);
  const { mentors: aluMentors } = useAlumniMentors();
  const aluStore = getALUStore();
  const muCount = getMUCount() || dbMentorCount;
  const aluCount = aluMentors.length || aluStore.totalCount;

  const extCfg = useMemo(() => getExternalDiscoveryConfig(), []);
  const extEnabledPlatforms = useMemo(() => {
    const list: string[] = [];
    if (extCfg.topmate) list.push("Topmate");
    if (extCfg.adplist) list.push("ADPList");
    if (extCfg.linkedin) list.push("LinkedIn");
    if (extCfg.superpeer) list.push("Superpeer");
    return list;
  }, [extCfg]);
  const extEnabledCount = extEnabledPlatforms.length;

  // JD mode
  const [jdMode, setJdMode] = useState<"jd" | "fallback">(jdData ? "jd" : "fallback");
  const [fallbackKeywords, setFallbackKeywords] = useState("");

  // Inline JD upload (when no JD)
  const [inlineJdFile, setInlineJdFile] = useState<File | null>(null);
  const [inlineJdText, setInlineJdText] = useState("");
  const [inlineJdSkills, setInlineJdSkills] = useState<string[]>([]);
  const [jdEntryMode, setJdEntryMode] = useState<"upload" | "paste" | "skills" | null>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);

  // Resume
  const [useResumes, setUseResumes] = useState(false);
  const [resumeSkills, setResumeSkills] = useState<string[]>([]);
  const [resumeFiles, setResumeFiles] = useState<string[]>([]);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // Required skills (multi-select chips)
  const [selectedSkills, setSelectedSkills] = useState<string[]>(() => jdData?.skills ?? []);
  const [customSkills, setCustomSkills] = useState<string[]>([]);
  const [customSkillInput, setCustomSkillInput] = useState("");
  useEffect(() => {
    if (jdData?.skills?.length && selectedSkills.length === 0) {
      setSelectedSkills(jdData.skills);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jdData]);
  const allSkillChips = useMemo(() => {
    const merged = new Set<string>([...SKILL_KEYWORDS, ...(jdData?.skills ?? []), ...customSkills]);
    return Array.from(merged);
  }, [jdData, customSkills]);
  const toggleSkill = (s: string) => {
    setSelectedSkills(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };
  const addCustomSkill = () => {
    const v = customSkillInput.trim();
    if (!v) return;
    if (!allSkillChips.includes(v)) setCustomSkills(prev => [v, ...prev]);
    if (!selectedSkills.includes(v)) setSelectedSkills(prev => [v, ...prev]);
    setCustomSkillInput("");
  };

  // Optional industry context is passed through the existing industry text
  // signal. It does not change matching weights or pipeline behavior.
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(() =>
    domain.trim() ? [domain.trim()] : [],
  );
  const [industryInput, setIndustryInput] = useState("");
  useEffect(() => {
    if (!open || !domain.trim()) return;
    setSelectedIndustries((prev) => prev.includes(domain.trim()) ? prev : [domain.trim(), ...prev]);
  }, [domain, open]);
  const addIndustry = () => {
    const value = industryInput.trim();
    if (!value) return;
    setSelectedIndustries((prev) => prev.some((item) => item.toLowerCase() === value.toLowerCase())
      ? prev
      : [...prev, value]);
    setIndustryInput("");
  };

  // Sources
  const [sources, setSources] = useState<MentorSource[]>(activeSources);
  // Auto-include EXT when modal opens if external discovery is enabled
  useEffect(() => {
    if (open && extCfg.anyEnabled) {
      setSources(prev => prev.includes("EXT") ? prev : [...prev, "EXT"]);
    }
  }, [open, extCfg.anyEnabled]);

  // Button click feedback — reset whenever modal re-opens
  const [starting, setStarting] = useState(false);
  const [matchMode, setMatchMode] = useState<MatchMode>("balanced");
  useEffect(() => { if (open) setStarting(false); }, [open]);

  // Auto-fetch JD from DB if no localStorage JD
  useEffect(() => {
    if (!open || jdData) return;
    let cancelled = false;
    setJdLoading(true);
    fetchJdFromDb(lmpId)
      .then(result => {
        if (cancelled || !result) return;
        // fetchJdFromDb persists via saveJd → useJd re-renders.
        setJdMode("jd");
      })
      .finally(() => { if (!cancelled) setJdLoading(false); });
    return () => { cancelled = true; };
  }, [open, lmpId, jdData]);
  const toggleSource = (s: MentorSource) => {
    if (s === "EXT" && !extCfg.anyEnabled) return; // disabled only if no platforms enabled
    setSources(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const handleInlineJdFile = useCallback(async (file: File) => {
    setInlineJdFile(file);
    try {
      const text = await file.text();
      setInlineJdText(text);
      const skills = extractSkillsFromText(text);
      setInlineJdSkills(skills);
      setJdMode("jd");
    } catch {
      setInlineJdText("");
      setInlineJdSkills([]);
    }
  }, []);

  const handleResumeFiles = useCallback(async (files: FileList) => {
    const allSkills: string[] = [];
    const names: string[] = [];
    for (const file of Array.from(files)) {
      names.push(file.name);
      try {
        const text = await file.text();
        allSkills.push(...extractSkillsFromText(text));
      } catch { /* ignore */ }
    }
    const unique = [...new Set(allSkills)];
    setResumeSkills(unique);
    setResumeFiles(names);
  }, []);

  // Compute gap skills
  const jdSkills = jdData?.skills || inlineJdSkills;
  const gapSkills = useResumes && resumeSkills.length > 0
    ? jdSkills.filter(s => !resumeSkills.includes(s))
    : [];

  const hasDataInSources = sources.some(s =>
    (s === "MU" && muCount > 0) || (s === "ALU" && aluCount > 0) || (s === "EXT" && extCfg.anyEnabled)
  );
  const totalAvailable = muCount + aluCount + (extCfg.anyEnabled ? extEnabledCount : 0);
  const noDataAnywhere = totalAvailable === 0;
  // JD-context gate: must have a JD attached, inline JD content, fallback keywords, or selected skills
  const hasJdContext =
    !!jdData ||
    !!inlineJdText.trim() ||
    !!inlineJdFile ||
    fallbackKeywords.trim().length > 0 ||
    selectedSkills.length > 0;
  const canRun = sources.length > 0 && hasDataInSources && !noDataAnywhere && hasJdContext;

  const handleReplaceJdFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const skills = extractSkillsFromText(text);
      const next: JdData = {
        lmpId,
        fileName: file.name,
        rawText: text,
        skills,
        seniority: extractSeniority(text),
        role,
        company,
        uploadedAt: new Date().toISOString(),
        source: "file",
      };
      saveJd(next);
      setSelectedSkills(skills);
      setJdMode("jd");
    } catch { /* ignore */ }
  }, [lmpId, role, company]);

  const handleConfirm = () => {
    if (starting) return;
    setStarting(true);
    // Build inline JD data if uploaded inline
    let finalJdData = jdData;
    if (!jdData && inlineJdText && jdMode === "jd") {
      // Don't persist - just pass through for this matching run
      finalJdData = {
        lmpId,
        fileName: inlineJdFile?.name || "Inline JD",
        rawText: inlineJdText,
        skills: inlineJdSkills,
        seniority: extractSeniority(inlineJdText),
        role,
        company,
        uploadedAt: new Date().toISOString(),
        source: "file",
      };
    }

    // Leave the immediate loader visible for a frame before the modal hands
    // off to the existing MatchingOverlay.
    window.setTimeout(() => {
      onConfirm({
        jdMode,
        jdData: finalJdData,
        fallbackKeywords,
        useResumes,
        resumeSkills,
        resumeGapSkills: gapSkills,
        sources,
        selectedSkills,
        selectedIndustries,
        matchMode,
      });
    }, 100);
  };

  const SOURCE_CHIPS: { id: MentorSource; label: string; fullLabel: string; count: number; disabled?: boolean; badgeText?: string; tooltip: { title: string; subtitle?: string } }[] = [
    { id: "MU", label: "MU", fullLabel: "Mentor Union", count: muCount,
      tooltip: { title: "Mentor Union — your uploaded mentor database" } },
    { id: "ALU", label: "ALU", fullLabel: "Alumni DB", count: aluCount,
      tooltip: { title: "Alumni — Masters' Union alumni network" } },
    {
      id: "EXT",
      label: "EXT",
      fullLabel: "External",
      count: 0,
      disabled: !extCfg.anyEnabled,
      badgeText: extCfg.anyEnabled ? undefined : "soon",
      tooltip: {
        title: "External — Topmate, ADPList, LinkedIn discovery",
        subtitle: extCfg.anyEnabled ? extEnabledPlatforms.join(" · ") : "Enable external platforms in Data Sources",
      },
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden flex flex-col max-h-[min(65vh,600px)]">
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200 shrink-0">
          <DialogTitle className="text-[16px] font-semibold text-n900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-orange-500" />
            Match Context
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5 flex-1 overflow-y-auto min-h-0">
          {/* Section 1 — JD Status */}
          <div>
            <div className="label-eyebrow mb-2 flex items-center gap-2">
              Job Description
              {jdLoading && <Loader2 className="h-3 w-3 animate-spin text-orange-500" />}
            </div>
            <input
              ref={jdInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) {
                  if (jdData) handleReplaceJdFile(f);
                  else handleInlineJdFile(f);
                }
                e.target.value = "";
              }}
            />
            {jdData ? (
              <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
                <div className="flex items-center gap-2 text-[13px] text-teal-700 font-medium">
                  <Check className="h-3.5 w-3.5" />
                  <span>JD Attached — {jdData.fileName}</span>
                  <button
                    type="button"
                    onClick={() => jdInputRef.current?.click()}
                    className="ml-auto text-[11px] font-medium text-orange-600 hover:text-orange-700 underline-offset-2 hover:underline"
                  >
                    Change
                  </button>
                </div>
                <p className="text-[11px] text-teal-600 mt-1">
                  Extracted {jdData.skills.length} skills · Seniority: {jdData.seniority}
                </p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {jdData.skills.slice(0, 8).map(s => (
                    <span key={s} className="rounded-full bg-teal-100 text-teal-700 text-[10px] px-2 py-0.5">{s}</span>
                  ))}
                  {jdData.skills.length > 8 && (
                    <span className="text-[10px] text-teal-500">+{jdData.skills.length - 8} more</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[12px] text-amber-600 mb-2">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  We couldn't find a JD for this LMP process. Pick one to continue:
                </div>

                {/* Option A: Upload JD file */}
                <button
                  onClick={() => { setJdEntryMode("upload"); setJdMode("jd"); jdInputRef.current?.click(); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    jdEntryMode === "upload" || (jdMode === "jd" && inlineJdFile)
                      ? "border-teal-300 bg-teal-50/50"
                      : "border-n200 hover:border-n300",
                  )}
                >
                  <div className="h-8 w-8 rounded-md bg-card border border-n200 grid place-items-center shrink-0">
                    <Upload className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <div>
                    <div className="text-[13px] font-medium text-n900">
                      {inlineJdFile ? inlineJdFile.name : "Upload a JD file"}
                    </div>
                    {inlineJdFile ? (
                      <p className="text-[11px] text-teal-600">
                        {inlineJdSkills.length} skills extracted
                      </p>
                    ) : (
                      <p className="text-[11px] text-n500">.pdf, .docx, .txt</p>
                    )}
                  </div>
                </button>

                {/* Option B: Paste JD text */}
                <button
                  onClick={() => { setJdEntryMode("paste"); setJdMode("jd"); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    jdEntryMode === "paste"
                      ? "border-teal-300 bg-teal-50/50"
                      : "border-n200 hover:border-n300",
                  )}
                >
                  <div className="h-8 w-8 rounded-md bg-card border border-n200 grid place-items-center shrink-0">
                    <ClipboardPaste className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-n900">Paste JD text</div>
                    <p className="text-[11px] text-n500">Paste the job description directly</p>
                  </div>
                </button>

                {jdEntryMode === "paste" && (
                  <div className="pl-11">
                    <textarea
                      value={inlineJdText}
                      onChange={e => {
                        const text = e.target.value;
                        setInlineJdText(text);
                        setInlineJdSkills(extractSkillsFromText(text));
                      }}
                      placeholder="Paste the full job description here…"
                      rows={5}
                      className="w-full rounded-md border border-n300 bg-card px-3 py-2 text-[12px] text-n900 placeholder:text-n400 focus:outline-none focus:border-orange-400"
                    />
                    {inlineJdSkills.length > 0 && (
                      <p className="text-[11px] text-teal-600 mt-1">
                        ✓ {inlineJdSkills.length} skills extracted
                      </p>
                    )}
                  </div>
                )}

                {/* Option C: Type key skills manually (fallback signals) */}
                <button
                  onClick={() => { setJdEntryMode("skills"); setJdMode("fallback"); }}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors",
                    jdEntryMode === "skills" || jdMode === "fallback"
                      ? "border-orange-300 bg-orange-50/50"
                      : "border-n200 hover:border-n300",
                  )}
                >
                  <div className="h-8 w-8 rounded-md bg-card border border-n200 grid place-items-center shrink-0">
                    <Tag className="h-3.5 w-3.5 text-n500" />
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] font-medium text-n900">Type key skills manually</div>
                    <p className="text-[11px] text-n500">
                      Use role signals: {role} · {company || "—"} · {domain || "—"}
                    </p>
                  </div>
                </button>

                {(jdEntryMode === "skills" || jdMode === "fallback") && (
                  <div className="pl-11">
                    <input
                      value={fallbackKeywords}
                      onChange={e => setFallbackKeywords(e.target.value)}
                      placeholder="Add keywords — e.g. B2B SaaS growth product analytics"
                      className="w-full h-8 rounded-md border border-n300 bg-card px-3 text-[12px] text-n900 placeholder:text-n400 focus:outline-none focus:border-orange-400"
                    />
                    <p className="text-[11px] text-n500 mt-1">
                      Or pick required skills from the chips below.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 1.5 — Required Skills */}
          <SkillsCombobox
            options={allSkillChips}
            selected={selectedSkills}
            onToggle={toggleSkill}
            inputValue={customSkillInput}
            setInputValue={setCustomSkillInput}
            onAddCustom={addCustomSkill}
            jdAttached={!!jdData}
          />

          {/* Optional industry context */}
          <div>
            <div className="label-eyebrow mb-2">Required Industries <span className="normal-case text-n400">(optional)</span></div>
            <p className="text-[11px] text-n500 mb-2">
              Pre-filled from this LMP's domain. Add industries to strengthen the existing industry context.
            </p>
            <div className="flex gap-2">
              <input
                value={industryInput}
                onChange={(event) => setIndustryInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addIndustry();
                  }
                }}
                placeholder="Add an industry, then press Enter"
                className="flex-1 h-9 rounded-md border border-n300 bg-card px-3 text-[12px] text-n900 placeholder:text-n400 focus:outline-none focus:border-orange-400"
              />
              <button
                type="button"
                onClick={addIndustry}
                disabled={!industryInput.trim()}
                className="h-9 rounded-md border border-n300 bg-card px-3 text-[12px] font-medium text-n700 hover:bg-n100 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {selectedIndustries.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedIndustries.map((item) => (
                  <span
                    key={item}
                    className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-2.5 py-1 text-[11px] font-medium"
                  >
                    {item}
                    <button
                      type="button"
                      onClick={() => setSelectedIndustries((prev) => prev.filter((value) => value !== item))}
                      aria-label={`Remove ${item}`}
                      className="hover:text-sky-900"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {!jdData && !inlineJdText.trim() && !fallbackKeywords.trim() && selectedSkills.length === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>Without a JD or skills, results will be ranked by role and domain only — quality may be lower.</span>
            </div>
          )}

          {/* Section 2 — Resume Skill Gap */}
          <div className="rounded-lg border border-n200 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-n500" />
                <span className="text-[13px] font-medium text-n900">Include resume skill-gap analysis</span>
              </div>
              <Switch
                checked={useResumes}
                onCheckedChange={setUseResumes}
                className="data-[state=checked]:bg-orange-500 data-[state=unchecked]:bg-n300"
              />
            </div>
            <p className="text-[11px] text-n500 mt-1">
              Upload candidate resumes to identify skill gaps and boost mentors who cover those gaps.
            </p>

            {useResumes && (
              <div className="mt-3 space-y-2">
                <button
                  onClick={() => resumeInputRef.current?.click()}
                  className="w-full rounded-md border-2 border-dashed border-orange-200 bg-orange-50/40 p-3 text-center text-[12px] text-n600 hover:border-orange-400"
                >
                  <Upload className="h-3.5 w-3.5 mx-auto mb-1 text-orange-500" />
                  Drop resumes here (.pdf, .docx, .txt)
                </button>
                <input
                  ref={resumeInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  multiple
                  className="hidden"
                  onChange={e => { if (e.target.files) handleResumeFiles(e.target.files); }}
                />

                {resumeFiles.length > 0 && (
                  <div className="space-y-1">
                    {resumeFiles.map(name => (
                      <div key={name} className="flex items-center gap-1.5 text-[11px] text-n600">
                        <Check className="h-3 w-3 text-sage-500" /> {name}
                      </div>
                    ))}
                    {resumeSkills.length > 0 && (
                      <p className="text-[11px] text-teal-600 mt-1">
                        ✓ Resume skills detected: {resumeSkills.slice(0, 5).join(", ")}
                        {resumeSkills.length > 5 && ` +${resumeSkills.length - 5} more`}
                      </p>
                    )}
                    {gapSkills.length > 0 && (
                      <p className="text-[11px] text-orange-600 mt-0.5">
                        ↑ Skill gaps vs JD: {gapSkills.slice(0, 5).join(", ")}
                        {gapSkills.length > 5 && ` +${gapSkills.length - 5} more`}
                        {" — these will be boosted in scoring"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 3 — Sources */}
          <div>
            <div className="label-eyebrow mb-2">Sources</div>
            <div className="flex items-center gap-2">
              {SOURCE_CHIPS.map(s => (
                <Tooltip key={s.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => toggleSource(s.id)}
                      disabled={s.disabled}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors",
                        s.disabled
                          ? "border-n200 bg-n100 text-n400 cursor-not-allowed"
                          : sources.includes(s.id)
                            ? "border-orange-300 bg-orange-50 text-orange-700"
                            : "border-n200 bg-card text-n600 hover:border-n300",
                      )}
                    >
                      {sources.includes(s.id) && !s.disabled && <Check className="h-3 w-3" />}
                      {s.label}
                      {(s.badgeText || s.count > 0) && (
                        <span className={cn(
                          "rounded-full px-1.5 text-[10px] tabular-nums",
                          s.count > 0 ? "bg-n200 text-n700" : "bg-n100 text-n400",
                        )}>
                          {s.badgeText ?? s.count}
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[260px]">
                    <div className="text-[12px] font-medium">{s.tooltip.title}</div>
                    {s.tooltip.subtitle && (
                      <div className="text-[11px] opacity-80 mt-0.5">{s.tooltip.subtitle}</div>
                    )}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {sources.includes("MU") && muCount === 0 && (
                <span className="text-[11px] text-amber-600">⚠ No MU data uploaded</span>
              )}
              {sources.includes("ALU") && aluCount === 0 && (
                <span className="text-[11px] text-amber-600">⚠ No ALU data uploaded</span>
              )}
            </div>
          </div>

          {/* Match Mode */}
          <div>
            <div className="label-eyebrow mb-2">Match Priority</div>
            <p className="text-[11px] text-n500 mb-3">
              How should results be ranked? Choose a focus or leave as balanced.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {MATCH_MODES.map(m => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMatchMode(m.id)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors",
                    matchMode === m.id
                      ? "border-orange-400 bg-orange-50 ring-1 ring-orange-300"
                      : "border-n200 bg-card hover:border-n300",
                  )}
                >
                  <span className="text-base leading-none">{m.emoji}</span>
                  <span className={cn("text-[13px] font-semibold", matchMode === m.id ? "text-orange-700" : "text-n900")}>
                    {m.label}
                  </span>
                  <span className="text-[11px] text-n500 leading-snug">{m.description}</span>
                  {m.id === "balanced" && (
                    <span className="mt-0.5 text-[10px] font-medium text-n400 uppercase tracking-wide">Default</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-n200 bg-n50/50 shrink-0 flex !flex-row items-center !justify-between gap-3">
          <div className="text-[11px] text-n500 min-w-0 flex-1">
            {noDataAnywhere
              ? "Add mentor data in Data Sources to enable matching."
              : !hasJdContext
                ? "Attach a JD, paste JD text, add keywords, or pick required skills to enable matching."
                : ""}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onOpenChange(false)}
              disabled={starting}
              className="h-9 rounded-md border border-n300 bg-card px-4 text-[13px] font-medium text-n700 hover:bg-n100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!canRun || starting}
              className={cn(
                "h-9 rounded-md px-4 text-[13px] font-medium shadow-sm transition-all inline-flex items-center gap-2",
                canRun && !starting
                  ? "bg-gradient-to-r from-orange-500 via-orange-400 to-orange-500 bg-[length:200%_100%] animate-shimmer text-white hover:brightness-110"
                  : starting
                    ? "bg-orange-500/90 text-white cursor-wait"
                    : "bg-n200 text-n400 cursor-not-allowed",
              )}
            >
              {starting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running mentor matching…
                </>
              ) : (
                <>Run Matching →</>
              )}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkillsCombobox({
  options, selected, onToggle, inputValue, setInputValue, onAddCustom, jdAttached,
}: {
  options: string[];
  selected: string[];
  onToggle: (s: string) => void;
  inputValue: string;
  setInputValue: (v: string) => void;
  onAddCustom: () => void;
  jdAttached: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = inputValue.trim().toLowerCase();
  const filtered = useMemo(
    () => options.filter(o => !q || o.toLowerCase().includes(q)).slice(0, 50),
    [options, q],
  );
  const exactMatch = options.some(o => o.toLowerCase() === q);

  return (
    <div ref={wrapRef}>
      <div className="label-eyebrow mb-2">Required Skills</div>
      <p className="text-[11px] text-n500 mb-2">
        {jdAttached ? "Pre-selected from JD. Search and select skills below." : "Search and select skills, or add your own."}
      </p>
      <div className="relative">
        <input
          value={inputValue}
          onChange={e => { setInputValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (q && !exactMatch) { onAddCustom(); }
              else if (filtered[0]) { onToggle(filtered[0]); setInputValue(""); }
            } else if (e.key === "Escape") setOpen(false);
          }}
          placeholder="Search skills or type to add new…"
          className="w-full h-9 rounded-md border border-n300 bg-card px-3 text-[12px] text-n900 placeholder:text-n400 focus:outline-none focus:border-orange-400"
        />
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-md border border-n200 bg-card shadow-lg max-h-60 overflow-y-auto">
            {filtered.length === 0 && !q && (
              <div className="px-3 py-2 text-[12px] text-n500">No skills</div>
            )}
            {q && !exactMatch && (
              <button
                type="button"
                onClick={() => { onAddCustom(); }}
                className="w-full text-left px-3 py-2 text-[12px] text-orange-600 hover:bg-orange-50 border-b border-n100"
              >
                + Add "{inputValue.trim()}"
              </button>
            )}
            {filtered.map(s => {
              const sel = selected.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => { onToggle(s); setInputValue(""); }}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-n50",
                    sel ? "text-orange-700" : "text-n800",
                  )}
                >
                  <span>{s}</span>
                  {sel && <Check className="h-3.5 w-3.5 text-orange-600" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {selected.map(s => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 text-orange-700 px-2.5 py-1 text-[11px] font-medium"
            >
              {s}
              <button
                type="button"
                onClick={() => onToggle(s)}
                className="hover:text-orange-900"
                aria-label={`Remove ${s}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <p className="text-[11px] text-n500 mt-1.5">{selected.length} selected</p>
    </div>
  );
}
