import { useMemo, useState } from "react";
import { Sparkles, Loader2, X, Check, Copy, Download } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SKILL_KEYWORDS } from "@/lib/jdStore";
import { useAllMentors, useAlumniMentors } from "@/lib/hooks/useDbData";
import { runMentorMatch, type RunMentorStepId } from "@/lib/mentorMatchRunner";
import { MentorCard } from "@/components/lmp/detail/mentors/MentorCard";
import { STEP_LABELS } from "@/components/lmp/detail/mentors/MatchingOverlay";
import type { Mentor, MentorSource } from "@/lib/mentor";
import type { MatchMode } from "@/lib/mentorPipeline";

type Props = { open: boolean; onOpenChange: (o: boolean) => void };

const STEP_ORDER: RunMentorStepId[] = ["MU", "ALU", "EXT", "PRIOR", "RANK"];
const EXTRA_STEP_LABELS: Record<RunMentorStepId, string> = {
  ...STEP_LABELS,
  PRIOR: "Previously aligned + prior sessions",
};

export function RunMentorModal({ open, onOpenChange }: Props) {
  const { data: allMentors = [] } = useAllMentors();
  const { mentors: alumniMentors } = useAlumniMentors();

  const [tab, setTab] = useState<"jd" | "skills">("skills");
  const [jdText, setJdText] = useState("");
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [industry, setIndustry] = useState("");
  const [seniority, setSeniority] = useState("");
  const [sources, setSources] = useState<MentorSource[]>(["MU", "ALU", "EXT"]);
  const [matchMode, setMatchMode] = useState<MatchMode>("balanced");

  const [phase, setPhase] = useState<"form" | "running" | "results">("form");
  const [currentStep, setCurrentStep] = useState<RunMentorStepId | null>(null);
  const [results, setResults] = useState<Mentor[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [runError, setRunError] = useState<string | null>(null);

  const allChips = useMemo(() => Array.from(new Set([...SKILL_KEYWORDS])), []);

  const toggleSkill = (s: string) =>
    setSelectedSkills((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const addCustom = () => {
    const v = customSkill.trim();
    if (!v) return;
    if (!selectedSkills.includes(v)) setSelectedSkills((p) => [v, ...p]);
    setCustomSkill("");
  };
  const toggleSource = (s: MentorSource) =>
    setSources((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  const toggleSelect = (id: string) =>
    setSelectedIds((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const reset = () => {
    setPhase("form"); setResults([]); setSelectedIds(new Set()); setCurrentStep(null); setRunError(null);
  };
  // Close without resetting — keeps results around if user reopens.
  const dismiss = () => onOpenChange(false);
  const close = () => { reset(); onOpenChange(false); };


  const canRun = (tab === "jd" ? jdText.trim().length > 20 : selectedSkills.length > 0)
    && sources.length > 0;

  const run = async () => {
    setPhase("running"); setCurrentStep(null); setRunError(null);
    const externalMessages: string[] = [];
    try {
      const out = await runMentorMatch(
        {
          jdText: tab === "jd" ? jdText : undefined,
          selectedSkills: tab === "skills" ? selectedSkills : [],
          role, company, industry, seniority,
          sources, matchMode,
        },
        {
          allMentors, alumniMentors,
          onStep: (id) => setCurrentStep(id),
          onError: (msg) => { if (!externalMessages.includes(msg)) externalMessages.push(msg); },
        },
      );
      setResults(out.suggested);
      // Deduplicate and pick the most actionable error message for the banner.
      const uniqueErrors = Array.from(new Set(externalMessages));
      // Prefer the last message (EXT-only advisory is emitted last and most specific).
      const primaryError = uniqueErrors[uniqueErrors.length - 1] ?? null;
      setRunError(primaryError);
      setPhase("results");
      if (!out.suggested.length) {
        toast.warning(primaryError || "No mentors matched — broaden the role or skills.");
      } else {
        toast.success(`Found ${out.suggested.length} mentors · MU ${out.counts.MU} · ALU ${out.counts.ALU} · EXT ${out.counts.EXT}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Matching failed");
      setPhase("form");
    }
  };


  const selectedMentors = results.filter((m) => selectedIds.has(m.id));
  const copyEmails = () => {
    const emails = selectedMentors.map((m) => m.email).filter(Boolean).join(", ");
    if (!emails) { toast("No emails on selected mentors"); return; }
    navigator.clipboard.writeText(emails); toast.success(`Copied ${selectedMentors.length} emails`);
  };
  const exportCsv = () => {
    const head = ["Name", "Role", "Company", "Source", "Score", "Tier", "Email", "LinkedIn"];
    const rows = selectedMentors.map((m) => [
      m.name, m.role, m.company, m.source, m.score, m.tier_label || "", m.email || "", m.linkedin || "",
    ]);
    const csv = [head, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mentor-match-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const lockClose = phase !== "form";
  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (o) { onOpenChange(true); return; }
      // While running/results are visible, dismiss only — keep state intact.
      if (lockClose) { dismiss(); return; }
      close();
    }}>
      <DialogContent
        className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col"
        onInteractOutside={(e) => { if (lockClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (phase === "running") e.preventDefault(); }}
      >

        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-orange-500" />
            Run Mentor — Quick match
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-1">
          {phase === "form" && (
            <div className="space-y-5">
              {/* Mode tabs */}
              <div className="inline-flex rounded-lg border border-n200 p-0.5 bg-n50">
                {(["skills", "jd"] as const).map((t) => (
                  <button key={t} onClick={() => setTab(t)}
                    className={cn("px-3 py-1.5 text-[12px] rounded-md transition",
                      tab === t ? "bg-card shadow-sm text-n900 font-medium" : "text-n500 hover:text-n800")}>
                    {t === "skills" ? "Add required skills" : "Paste JD"}
                  </button>
                ))}
              </div>

              {tab === "jd" ? (
                <div>
                  <label className="text-[11px] uppercase tracking-wider text-n500 font-medium">Job description</label>
                  <Textarea rows={8} value={jdText} onChange={(e) => setJdText(e.target.value)}
                    placeholder="Paste the full JD here. Skills + seniority will be auto-extracted." />
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-n500 font-medium">Required skills</label>
                  <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto p-2 rounded-lg border border-n200 bg-n50/40">
                    {allChips.map((s) => (
                      <button key={s} onClick={() => toggleSkill(s)}
                        className={cn("px-2 py-1 text-[11px] rounded-full border transition",
                          selectedSkills.includes(s)
                            ? "bg-orange-100 border-orange-300 text-orange-700"
                            : "bg-card border-n200 text-n600 hover:border-n400")}>
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input value={customSkill} onChange={(e) => setCustomSkill(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustom())}
                      placeholder="Add custom skill…" className="h-8 text-[12px]" />
                    <Button size="sm" variant="outline" onClick={addCustom}>Add</Button>
                  </div>
                </div>
              )}

              {/* Context fields */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div><label className="text-[10px] uppercase tracking-wider text-n500">Role</label>
                  <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Product Manager" className="h-8 text-[12px]" /></div>
                <div><label className="text-[10px] uppercase tracking-wider text-n500">Company</label>
                  <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Optional" className="h-8 text-[12px]" /></div>
                <div><label className="text-[10px] uppercase tracking-wider text-n500">Industry</label>
                  <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Optional" className="h-8 text-[12px]" /></div>
                <div><label className="text-[10px] uppercase tracking-wider text-n500">Seniority</label>
                  <select value={seniority} onChange={(e) => setSeniority(e.target.value)}
                    className="h-8 w-full rounded-md border border-n200 text-[12px] px-2 bg-card">
                    <option value="">Auto</option>
                    <option>Junior</option><option>Mid</option><option>Senior</option>
                    <option>Lead</option><option>Director</option><option>VP</option><option>C-Suite</option>
                  </select></div>
              </div>

              {/* Sources */}
              <div>
                <label className="text-[11px] uppercase tracking-wider text-n500 font-medium">Sources</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(["MU", "ALU", "EXT"] as MentorSource[]).map((s) => (
                    <button key={s} onClick={() => toggleSource(s)}
                      className={cn("px-3 py-1.5 text-[12px] rounded-full border",
                        sources.includes(s) ? "bg-n900 text-white border-n900" : "bg-card text-n600 border-n200")}>
                      {s === "MU" ? "Mentor Union" : s === "ALU" ? "Alumni" : "External"}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    <label className="text-[10px] uppercase tracking-wider text-n500">Match mode</label>
                    <select value={matchMode} onChange={(e) => setMatchMode(e.target.value as MatchMode)}
                      className="h-7 rounded-md border border-n200 text-[12px] px-2 bg-card">
                      <option value="balanced">Balanced</option>
                      <option value="role">Role-first</option>
                      <option value="industry">Industry-first</option>
                      <option value="company">Company-first</option>
                    </select>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-n500">
                  Always includes previously aligned mentors and mentors with prior sessions.
                </p>
              </div>
            </div>
          )}

          {phase === "running" && (
            <div className="py-10 space-y-4">
              <div className="flex items-center gap-2 text-n700">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[14px] font-medium">Matching mentors…</span>
              </div>
              <ul className="space-y-1.5">
                {STEP_ORDER.map((id) => {
                  const idx = STEP_ORDER.indexOf(id);
                  const cur = currentStep ? STEP_ORDER.indexOf(currentStep) : -1;
                  const state = idx < cur ? "done" : idx === cur ? "active" : "pending";
                  return (
                    <li key={id} className="flex items-center gap-2 text-[12px]">
                      {state === "done" ? <Check className="h-3.5 w-3.5 text-teal-600" />
                        : state === "active" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
                        : <span className="h-3.5 w-3.5 rounded-full border border-n300" />}
                      <span className={state === "pending" ? "text-n400" : "text-n700"}>{EXTRA_STEP_LABELS[id]}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {phase === "results" && (
            <div className="space-y-3">
              <div className="text-[12px] text-n500">
                {results.length} mentors · {selectedIds.size} selected
              </div>
              {runError && (
                <div className="rounded-md border border-orange-300 bg-orange-50 text-orange-800 px-3 py-2 text-[12px]">
                  ⚠ {runError}
                </div>
              )}
              {results.length === 0 ? (
                <div className="text-center py-10 text-n500 text-[13px]">
                  No matches. Try broadening the role or skills, or click <strong>← Re-run</strong>.
                </div>
              ) : (
                <div className="space-y-3">
                  {results.map((m, i) => (
                    <div key={m.id} className="flex items-start gap-3">
                      <input type="checkbox" className="mt-5 accent-orange-500"
                        checked={selectedIds.has(m.id)} onChange={() => toggleSelect(m.id)} />
                      <div className="flex-1">
                        <MentorCard mentor={m} index={i}
                          onShortlist={() => toggleSelect(m.id)}
                          onView={() => toggleSelect(m.id)}
                          onSelect={() => toggleSelect(m.id)} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        <DialogFooter className="border-t pt-3">
          {phase === "form" && (
            <>
              <Button variant="ghost" onClick={close}><X className="h-4 w-4 mr-1" />Cancel</Button>
              <Button onClick={run} disabled={!canRun}>
                <Sparkles className="h-4 w-4 mr-1" />Run match
              </Button>
            </>
          )}
          {phase === "running" && (
            <Button variant="ghost" onClick={close}>Cancel</Button>
          )}
          {phase === "results" && (
            <>
              <Button variant="ghost" onClick={reset}>← Re-run</Button>
              <Button variant="outline" onClick={copyEmails} disabled={selectedIds.size === 0}>
                <Copy className="h-4 w-4 mr-1" />Copy emails
              </Button>
              <Button variant="outline" onClick={exportCsv} disabled={selectedIds.size === 0}>
                <Download className="h-4 w-4 mr-1" />Export CSV
              </Button>
              <Button onClick={dismiss}>Done</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
