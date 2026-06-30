/**
 * /quick/create-lmp — Mobile LMP creation wizard.
 *
 * 4 steps: Details → JD (optional) → POC → Candidates (optional) → Submit
 * Uses existing createLmpProcess() + usePocCapabilityList() + useAddLmpCandidates().
 * No new schema. Sheet sync flows through createLmpProcess DB trigger.
 */
import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronLeft, X, Search, Check, AlertTriangle, ArrowLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useDomains, useStudents, useAddLmpCandidates } from "@/lib/hooks/useDbData";
import { usePocCapabilityList } from "@/lib/hooks/usePocCapabilityLive";
import { createLmpProcess, DuplicateLmpError, type CreateLmpPayload } from "@/lib/createLmpProcess";
import type { AssignedPoc, AllocationResult, DomainTier } from "@/lib/pocAllocation";
import type { PocCapability } from "@/lib/pocCapability";
import { useRole } from "@/lib/rolesContext";
import { usePermission } from "@/lib/rolesContext";
import { QuickMobileShell } from "./QuickMobileShell";
import { QuickBottomBar, QuickSubmitButton } from "./QuickBottomBar";

// ── Build AssignedPoc from PocCapability ──────────────────────────────────────

function makePocAssignment(p: PocCapability, domain: string): AssignedPoc {
  const tier: DomainTier = p.primaryDomains?.includes(domain)
    ? "primary"
    : (p.domains ?? []).includes(domain)
    ? "secondary"
    : "cross";
  return {
    pocId: p.id,
    name: p.name,
    initials: p.initials,
    color: p.color,
    matchType: "Manual Override",
    currentLoad: p.currentLoad,
    maxThreshold: p.maxThreshold,
    scoreBreakdown: null,
    confidence: 0,
    domainTier: tier,
  };
}

function buildAllocation(prep: AssignedPoc, support?: AssignedPoc | null): AllocationResult {
  return {
    path: "A",
    prep,
    supportSuggestions: support ? [support] : [],
    tags: ["Manual Override"],
    allocationReason: "Mobile quick-create — manual POC selection",
    allocatedAt: new Date().toISOString(),
    alternatives: [],
  };
}

// ── Step indicator ────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 py-3 px-4 justify-center">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            "h-1.5 rounded-full transition-all",
            i < current ? "bg-primary w-6" : i === current ? "bg-primary w-10" : "bg-muted w-6",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// ── POC list item ─────────────────────────────────────────────────────────────

function pocKey(p: PocCapability): string {
  return p.id ?? p.name;
}

function PocItem({ poc, selected, onSelect }: { poc: PocCapability; selected: boolean; onSelect: () => void }) {
  const load = poc.currentLoad;
  const max = poc.maxThreshold || 8;
  const pct = Math.min(100, Math.round((load / max) * 100));
  const overloaded = load >= max;

  return (
    <button
      onClick={onSelect}
      className={[
        "w-full flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.98]",
        selected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card hover:bg-muted/30",
        overloaded ? "opacity-60" : "",
      ].join(" ")}
      style={{ minHeight: "60px" }}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold ${poc.color || "bg-orange-100 text-orange-600"}`}
      >
        {poc.initials}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold leading-snug line-clamp-1">{poc.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <div className="h-1.5 flex-1 max-w-[80px] rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct > 80 ? "bg-amber-500" : "bg-primary"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{load}/{max}</span>
        </div>
      </div>
      {selected && (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary">
          <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

function SelectedPocChip({ label, name, onClear }: { label: string; name: string; onClear?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary">
      <span className="text-muted-foreground font-normal">{label}:</span> {name}
      {onClear && (
        <button type="button" onClick={onClear} className="rounded-full p-0.5 hover:bg-primary/10" aria-label={`Clear ${label}`}>
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function OptionalPocPicker({
  label,
  pocs,
  selectedId,
  excludedIds,
  onSelect,
}: {
  label: string;
  pocs: PocCapability[];
  selectedId: string | null;
  excludedIds: Set<string>;
  onSelect: (id: string | null) => void;
}) {
  const options = pocs.filter((p) => !excludedIds.has(pocKey(p)));
  return (
    <div className="rounded-xl border border-border bg-card/50 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">{label}</label>
        {selectedId && (
          <button type="button" onClick={() => onSelect(null)} className="text-[11px] font-medium text-primary">
            Clear
          </button>
        )}
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">No other POCs available.</p>
      ) : (
        <ul className="space-y-1.5 max-h-36 overflow-y-auto">
          {options.map((poc) => {
            const key = pocKey(poc);
            return (
              <li key={key}>
                <PocItem
                  poc={poc}
                  selected={selectedId === key}
                  onSelect={() => onSelect(selectedId === key ? null : key)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Main wizard ───────────────────────────────────────────────────────────────

export function QuickCreateLmpView() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useRole();
  const { canCreateLmp } = usePermission();

  const { data: domains = [] } = useDomains();
  const { list: pocList, isLoading: pocLoading } = usePocCapabilityList();
  const { data: students = [], isLoading: studentsLoading } = useStudents();
  const addCandidates = useAddLmpCandidates();

  // Step state
  const [step, setStep] = useState(0); // 0=details, 1=jd, 2=poc, 3=candidates

  // Step 0 — Details
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [domain, setDomain] = useState("");
  const [type, setType] = useState<"Full Time" | "Internship">("Full Time");

  // Step 1 — JD
  const [jdMode, setJdMode] = useState<"paste" | "link" | "skip">("skip");
  const [jdText, setJdText] = useState("");
  const [jdLink, setJdLink] = useState("");

  // Step 2 — POC
  const [pocSearch, setPocSearch] = useState("");
  const [prepPocId, setPrepPocId] = useState<string | null>(null);
  const [supportPocId, setSupportPocId] = useState<string | null>(null);
  const [outreachPocId, setOutreachPocId] = useState<string | null>(null);

  // Step 3 — Candidates
  const [candidateSearch, setCandidateSearch] = useState("");
  const [pickedStudents, setPickedStudents] = useState<Set<string>>(new Set());

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [duplicateInfo, setDuplicateInfo] = useState<string | null>(null);
  const [createdLmpId, setCreatedLmpId] = useState<string | null>(null);

  const TOTAL_STEPS = 4;

  // Guard: only admin/allocator
  if (!canCreateLmp) {
    return (
      <QuickMobileShell title="Create LMP" back>
        <div className="py-16 text-center space-y-3">
          <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
          <p className="text-sm font-semibold">Permission denied</p>
          <p className="text-xs text-muted-foreground">Only Admin or Allocator can create LMPs.</p>
        </div>
      </QuickMobileShell>
    );
  }

  const filteredPocs = useMemo(() => {
    const q = pocSearch.toLowerCase().trim();
    return pocList
      .filter((p) => !q || p.name.toLowerCase().includes(q) || (p.domains ?? []).some((d) => d.toLowerCase().includes(q)))
      .sort((a, b) => a.currentLoad - b.currentLoad);
  }, [pocList, pocSearch]);

  const filteredStudents = useMemo(() => {
    const q = candidateSearch.toLowerCase().trim();
    if (!q) return (students as any[]).slice(0, 80);
    return (students as any[]).filter(
      (s) =>
        String(s.name ?? "").toLowerCase().includes(q) ||
        String(s.email ?? "").toLowerCase().includes(q) ||
        String(s.roll_no ?? "").toLowerCase().includes(q)
    ).slice(0, 80);
  }, [students, candidateSearch]);

  const prepPoc = pocList.find((p) => pocKey(p) === prepPocId);
  const supportPoc = pocList.find((p) => pocKey(p) === supportPocId) ?? null;
  const outreachPoc = pocList.find((p) => pocKey(p) === outreachPocId) ?? null;

  const supportExcluded = useMemo(() => {
    const ids = new Set<string>();
    if (prepPocId) ids.add(prepPocId);
    return ids;
  }, [prepPocId]);

  const outreachExcluded = useMemo(() => {
    const ids = new Set<string>(supportExcluded);
    if (supportPocId) ids.add(supportPocId);
    return ids;
  }, [supportExcluded, supportPocId]);

  const canProceedStep0 = company.trim().length > 0 && role.trim().length > 0 && domain.length > 0;
  const canProceedStep1 = true; // JD is optional
  const canProceedStep2 = prepPocId !== null;

  const canProceed = [canProceedStep0, canProceedStep1, canProceedStep2, true][step] ?? true;

  // ── Submission ──────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (allowDuplicate = false) => {
    if (!prepPoc) return;
    setIsSubmitting(true);
    setDuplicateInfo(null);

    try {
      const prepAssigned = makePocAssignment(prepPoc, domain);
      const supportAssigned = supportPoc ? makePocAssignment(supportPoc, domain) : null;
      const outreachAssigned = outreachPoc ? makePocAssignment(outreachPoc, domain) : null;
      const allocation = buildAllocation(prepAssigned, supportAssigned);

      const jdPayload: CreateLmpPayload["jd"] = jdMode === "paste" && jdText.trim()
        ? { text: jdText.trim(), skills: [], source: "paste", uploadedBy: user.pocProfileName ?? user.name, label: `${company} — ${role}` }
        : jdMode === "link" && jdLink.trim()
        ? { url: jdLink.trim(), skills: [], source: "link", uploadedBy: user.pocProfileName ?? user.name, label: `${company} — ${role}` }
        : undefined;

      const lmp = await createLmpProcess({
        company: company.trim(),
        role: role.trim(),
        domain,
        type,
        createdById: user.id,
        createdByName: user.pocProfileName ?? user.name,
        selection: {
          prepPoc: prepAssigned,
          supportPoc: supportAssigned,
          outreachPoc: outreachAssigned,
          allocation,
        },
        jd: jdPayload,
        allowDuplicate,
      });

      // Invalidate LMP list so desktop + mobile pick up new row
      queryClient.invalidateQueries({ queryKey: ["db-lmp-processes"] });

      const lmpIdCreated = (lmp as any).id;

      // Add candidates if any were picked
      if (pickedStudents.size > 0) {
        const toAdd = (students as any[])
          .filter((s) => pickedStudents.has(s.id))
          .map((s) => ({ lmp_id: lmpIdCreated, student_name: s.name, student_id: s.id }));
        await addCandidates.mutateAsync(toAdd);
      }

      setCreatedLmpId(lmpIdCreated);
      toast({ title: "LMP Created", description: `${company.trim()} — ${role.trim()}` });
    } catch (err: any) {
      if (err instanceof DuplicateLmpError) {
        setDuplicateInfo(`An LMP for "${err.existing.company} — ${err.existing.role}" already exists. Proceed anyway?`);
      } else {
        toast({ title: "Creation failed", description: err.message ?? "Unknown error", variant: "destructive" });
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [prepPoc, supportPoc, outreachPoc, domain, jdMode, jdText, jdLink, type, company, role, user, pickedStudents, students, addCandidates, queryClient]);

  // ── Success screen ──────────────────────────────────────────────────────────

  if (createdLmpId) {
    return (
      <QuickMobileShell title="LMP Created">
        <div className="py-12 flex flex-col items-center text-center gap-5">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-100">
            <Check className="h-8 w-8 text-emerald-600" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-lg font-bold">{company}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{role}</p>
          </div>
          <p className="text-xs text-muted-foreground">LMP created and syncing to Google Sheets.</p>
          <div className="flex gap-3 w-full">
            <button
              onClick={() => navigate(`/lmp/${createdLmpId}`)}
              className="flex-1 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground"
            >
              View on Desktop
            </button>
            <button
              onClick={() => navigate("/quick/add-candidate")}
              className="flex-1 rounded-xl border border-border bg-card py-3.5 text-sm font-semibold"
            >
              Add Candidates
            </button>
          </div>
          <button
            onClick={() => {
              setCreatedLmpId(null); setStep(0);
              setCompany(""); setRole(""); setDomain(""); setType("Full Time");
              setJdMode("skip"); setJdText(""); setJdLink("");
              setPrepPocId(null); setSupportPocId(null); setOutreachPocId(null);
              setPickedStudents(new Set());
            }}
            className="text-xs text-primary font-medium"
          >
            Create another LMP
          </button>
        </div>
      </QuickMobileShell>
    );
  }

  return (
    <div className="flex flex-col bg-background text-foreground" style={{ height: "100dvh" }}>
      {/* Header */}
      <header
        className="flex items-center gap-3 border-b border-border bg-background/95 backdrop-blur px-4 py-3 shrink-0"
        style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))" }}
      >
        <button
          onClick={() => (step > 0 ? setStep((s) => s - 1) : navigate(-1))}
          className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-sm font-semibold">Create LMP</h1>
          <p className="text-[11px] text-muted-foreground">
            {["Details", "Job Description", "POC Assignment", "Add Candidates"][step]}
          </p>
        </div>
      </header>

      {/* Step indicator */}
      <StepIndicator current={step} total={TOTAL_STEPS} />

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-4">

        {/* ── Step 0: Details ── */}
        {step === 0 && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Company Name *</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Infosys, Bain, McKinsey…"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Role / Title *</label>
              <input
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="e.g. Business Analyst, Product Manager…"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Domain *</label>
              <select
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
              >
                <option value="">— select domain —</option>
                {(domains as any[]).map((d: any) => (
                  <option key={d.id} value={d.name}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">Type</label>
              <div className="grid grid-cols-2 gap-2">
                {(["Full Time", "Internship"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className={[
                      "rounded-xl border px-3.5 py-3.5 text-sm font-medium transition-colors",
                      type === t ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground",
                    ].join(" ")}
                    style={{ minHeight: "52px" }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── Step 1: JD ── */}
        {step === 1 && (
          <>
            <p className="text-xs text-muted-foreground">JD is optional. Skip to proceed with basic allocation.</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["paste", "link", "skip"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setJdMode(m)}
                  className={[
                    "rounded-xl border px-2 py-3 text-xs font-semibold capitalize transition-colors",
                    jdMode === m ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground",
                  ].join(" ")}
                >
                  {m === "paste" ? "Paste JD" : m === "link" ? "JD Link" : "Skip"}
                </button>
              ))}
            </div>
            {jdMode === "paste" && (
              <textarea
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
                rows={8}
                placeholder="Paste the full job description here…"
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                autoFocus
              />
            )}
            {jdMode === "link" && (
              <input
                type="url"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="https://company.com/jobs/…"
                value={jdLink}
                onChange={(e) => setJdLink(e.target.value)}
                autoFocus
              />
            )}
            {jdMode === "skip" && (
              <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-center">
                <p className="text-xs text-muted-foreground">No JD — allocation will use load-based scoring (Path A).</p>
              </div>
            )}
          </>
        )}

        {/* ── Step 2: POC ── */}
        {step === 2 && (
          <>
            <div>
              <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">Prep POC *</label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                  className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Search POC…"
                  value={pocSearch}
                  onChange={(e) => setPocSearch(e.target.value)}
                />
              </div>
              {pocLoading && <p className="text-xs text-muted-foreground text-center py-4">Loading POCs…</p>}
              <ul className="space-y-1.5 max-h-48 overflow-y-auto">
                {filteredPocs.map((poc) => {
                  const key = pocKey(poc);
                  return (
                    <li key={key}>
                      <PocItem
                        poc={poc}
                        selected={prepPocId === key}
                        onSelect={() => {
                          setPrepPocId(key);
                          if (supportPocId === key) setSupportPocId(null);
                          if (outreachPocId === key) setOutreachPocId(null);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </div>

            {prepPocId && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {prepPoc && <SelectedPocChip label="Prep" name={prepPoc.name} />}
                  {supportPoc && (
                    <SelectedPocChip label="Support" name={supportPoc.name} onClear={() => setSupportPocId(null)} />
                  )}
                  {outreachPoc && (
                    <SelectedPocChip label="Outreach" name={outreachPoc.name} onClear={() => setOutreachPocId(null)} />
                  )}
                </div>
                <OptionalPocPicker
                  label="Support POC (optional)"
                  pocs={filteredPocs}
                  selectedId={supportPocId}
                  excludedIds={supportExcluded}
                  onSelect={setSupportPocId}
                />
                <OptionalPocPicker
                  label="Outreach POC (optional)"
                  pocs={filteredPocs}
                  selectedId={outreachPocId}
                  excludedIds={outreachExcluded}
                  onSelect={setOutreachPocId}
                />
              </div>
            )}
          </>
        )}

        {/* ── Step 3: Candidates ── */}
        {step === 3 && (
          <>
            <p className="text-xs text-muted-foreground">Optional. You can also add candidates later from the Add Candidate screen.</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Search by name, email, roll no…"
                value={candidateSearch}
                onChange={(e) => setCandidateSearch(e.target.value)}
              />
            </div>
            {pickedStudents.size > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-primary">{pickedStudents.size} selected</p>
                <button onClick={() => setPickedStudents(new Set())} className="text-xs text-muted-foreground">Clear</button>
              </div>
            )}
            {studentsLoading && <p className="text-xs text-muted-foreground py-4 text-center">Loading students…</p>}
            <ul className="space-y-1.5">
              {filteredStudents.map((s: any) => {
                const sel = pickedStudents.has(s.id);
                return (
                  <li key={s.id}>
                    <button
                      onClick={() => setPickedStudents((prev) => {
                        const next = new Set(prev);
                        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
                        return next;
                      })}
                      className={[
                        "w-full flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                        sel ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/30",
                      ].join(" ")}
                      style={{ minHeight: "52px" }}
                    >
                      <span className={["flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors", sel ? "bg-primary border-primary" : "border-border bg-background"].join(" ")}>
                        {sel && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium line-clamp-1">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">
                          {[s.primary_domain, s.roll_no].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}

        {/* Duplicate prompt */}
        {duplicateInfo && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">{duplicateInfo}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleSubmit(true)} className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white">
                Proceed Anyway
              </button>
              <button onClick={() => setDuplicateInfo(null)} className="flex-1 rounded-lg border border-border py-2 text-xs font-semibold">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="border-t border-border bg-background/95 backdrop-blur px-4 pt-3 shrink-0"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
      >
        {step < TOTAL_STEPS - 1 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary py-3.5 text-sm font-semibold text-primary-foreground disabled:opacity-40 transition-all"
            style={{ minHeight: "52px" }}
          >
            {step === 1 && jdMode === "skip" ? "Skip & Continue" : "Continue"}
            <ChevronRight className="h-4 w-4" />
          </button>
        ) : (
          <QuickBottomBar>
            <button
              onClick={() => setStep((s) => s - 1)}
              className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted/30 transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <QuickSubmitButton
              label={pickedStudents.size > 0 ? `Create LMP + Add ${pickedStudents.size} Candidate${pickedStudents.size === 1 ? "" : "s"}` : "Create LMP"}
              onClick={() => handleSubmit(false)}
              loading={isSubmitting}
              disabled={!prepPoc}
            />
          </QuickBottomBar>
        )}
      </div>
    </div>
  );
}
