import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Check, Loader2, AlertTriangle, Search, X, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ConfirmedPocSelection } from "@/lib/createLmpProcess";
import { cn } from "@/lib/utils";
import { allocatePoc, setDomainAliasResolver, TAG_STYLES, PATH_LABELS, PATH_DESCRIPTIONS, type AssignedPoc, type AllocationResult, type AllocationTag, type AllocationPath, type HistoricalProcess } from "@/lib/pocAllocation";
import { usePocRegistry, type PocRegistryEntry } from "@/lib/hooks/usePocRegistry";
import type { PocCapability } from "@/lib/pocCapability";
import { useDomains, usePocLiveLoads } from "@/lib/hooks/useDbData";
import { supabase } from "@/integrations/supabase/client";

/** Convert DB registry entry + live workload into PocCapability for the engine.
 *  Uses poc_profiles.primary_domain when present; otherwise falls back to
 *  treating domains[0] as primary (legacy behavior). */
function toPocCapability(entry: PocRegistryEntry, liveLoad: number): PocCapability {
  const domains = entry.domains ?? [];
  const primary = entry.primary_domain && domains.includes(entry.primary_domain)
    ? entry.primary_domain
    : (domains[0] ?? null);
  const primaryDomains = primary ? [primary] : [];
  const secondaryDomains = primary ? domains.filter((d) => d !== primary) : domains.slice(1);
  return {
    id: entry.id,
    name: entry.name,
    initials: entry.initials,
    domains,
    primaryDomains,
    secondaryDomains,
    label: entry.label,
    color: entry.color,
    pocType: entry.poc_type === "outreach" ? "outreach" : "prep",
    currentLoad: liveLoad,
    maxThreshold: entry.max_threshold,
    skillTags: entry.skill_tags,
    lastAssignedAt: entry.last_assigned_at,
    availability: entry.availability,
    behavioralPoolMember: entry.behavioral_pool_member,
    companyExperience: entry.company_experience,
    recruiterOwnership: entry.recruiter_ownership,
    accessLevel: entry.access_level,
  };
}

export type POCReviewInitial = {
  prepName?: string;
  supportName?: string;
  supportSkipped?: boolean;
  outreachName?: string;
};

export function POCReviewStep({
  onContinue,
  onBack,
  reqDomain,
  jdText,
  parsedSkills,
  companyName,
  roleTitle,
  initial,
  onSaveDraft,
}: {
  onContinue: (selection: ConfirmedPocSelection) => void;
  onBack: () => void;
  reqDomain?: string;
  jdText?: string | null;
  parsedSkills?: string[];
  companyName?: string;
  roleTitle?: string;
  initial?: POCReviewInitial;
  onSaveDraft?: (state: {
    prepName?: string;
    supportName?: string;
    supportSkipped: boolean;
    outreachName?: string;
  }) => Promise<void> | void;
}) {
  const { data: pocRegistry = [], isLoading: loadingPocs } = usePocRegistry();
  const { data: liveLoads, isLoading: loadingLoads } = usePocLiveLoads();
  const prepLoad = liveLoads?.prepLoad ?? {};
  const outreachLoad = liveLoads?.outreachLoad ?? {};
  const { data: domainsList = [] } = useDomains();

  // Install an alias-aware resolver so engine matches e.g. "Founder's Office/
  // Chief of Staff" against POC tags like "FO/COS". Keyed by domains.aliases.
  useEffect(() => {
    const aliasIndex = new Map<string, string>();
    for (const d of (domainsList as Array<{ name: string; slug: string; aliases?: string[] | null }>)) {
      const slug = (d.slug || d.name || "").toLowerCase();
      aliasIndex.set((d.name || "").toLowerCase(), slug);
      aliasIndex.set(slug, slug);
      for (const a of d.aliases ?? []) aliasIndex.set((a || "").toLowerCase(), slug);
    }
    setDomainAliasResolver((raw) => {
      const k = (raw || "").trim().toLowerCase();
      return aliasIndex.get(k) ?? k;
    });
  }, [domainsList]);

  // Historical processes for this exact company + role — feeds POC history bonus.
  // Prefer UUID join via lmp_processes.prep_poc_id (populated by the
  // resolve_lmp_poc_links trigger) so we attribute history unambiguously even
  // when the sheet stored only a first name. Falls back to name match.
  const { data: historicalProcesses = [] } = useQuery<HistoricalProcess[]>({
    queryKey: ["lmp-history", companyName, roleTitle],
    queryFn: async () => {
      const { data } = await supabase
        .from("lmp_processes")
        .select("company, role, prep_poc, prep_poc_id, status")
        .ilike("company", (companyName ?? "").trim())
        .ilike("role", (roleTitle ?? "").trim())
        .neq("status", "Ongoing")
        .limit(200);
      return (data ?? []).map((r) => ({
        company: r.company ?? "",
        role: r.role ?? "",
        prepPoc: r.prep_poc ?? "",
        prepPocId: r.prep_poc_id ?? null,
        status: r.status ?? "",
      }));
    },
    enabled: !!companyName && !!roleTitle,
    staleTime: 60_000,
  });

  // State for user overrides
  const [prepOverride, setPrepOverride] = useState<AssignedPoc | null>(null);
  const [supportOverride, setSupportOverride] = useState<AssignedPoc | null>(null);
  const [supportSkipped, setSupportSkipped] = useState(initial?.supportSkipped ?? false);
  const [outreachPoc, setOutreachPoc] = useState<AssignedPoc | null>(null);
  const [showPrepSwitcher, setShowPrepSwitcher] = useState(false);
  const [showSupportSwitcher, setShowSupportSwitcher] = useState(false);
  const [showOutreachSelector, setShowOutreachSelector] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [draftSaved, setDraftSaved] = useState(false);

  // Build live POC pool (exclude on_leave & deactivated)
  const pocPool = useMemo(() => {
    return pocRegistry
      .filter(p => p.availability !== "deactivated" && p.availability !== "on_leave")
      .map(p => {
        const load = p.poc_type === "outreach"
          ? (outreachLoad[p.name] ?? 0)
          : (prepLoad[p.name] ?? 0);
        return toPocCapability(p, load);
      });
  }, [pocRegistry, prepLoad, outreachLoad]);

  // Existing processes for this company — Step 0 reassigns the previous Prep
  // POC. Matched first on company+role, then on company alone (most recent
  // row wins, hence the created_at desc ordering).
  const { data: existingProcesses = [] } = useQuery({
    queryKey: ["lmp-existing", companyName],
    queryFn: async () => {
      const { data } = await supabase
        .from("lmp_processes")
        .select("company, role, prep_poc, prep_poc_id, status, created_at")
        .ilike("company", (companyName ?? "").trim())
        .not("status", "in", '("Closed","Not Converted","Dormant","Converted NA","On hold")')
        .order("created_at", { ascending: false })
        .limit(100);
      return (data ?? []).map((r) => ({
        company: r.company ?? "",
        role: r.role ?? "",
        prepPoc: r.prep_poc ?? "",
        prepPocId: (r as { prep_poc_id?: string }).prep_poc_id ?? undefined,
        status: r.status ?? "",
      }));
    },
    enabled: !!companyName,
    staleTime: 60_000,
  });

  // Run allocation engine
  const allocOutcome = useMemo<{ result: AllocationResult | null; error: string | null }>(() => {
    if (!reqDomain || pocPool.length === 0) return { result: null, error: null };
    try {
      const result = allocatePoc({
        companyName: companyName ?? "—",
        roleTitle: roleTitle ?? "—",
        processDomain: reqDomain,
        jdText: jdText ?? null,
        parsedSkills: parsedSkills ?? [],
        processId: "new-process",
        historicalProcesses: historicalProcesses ?? [],
        existingProcesses: existingProcesses ?? [],
      }, pocPool);
      return { result, error: null };
    } catch (e) {
      return { result: null, error: (e as Error)?.message ?? "UNKNOWN" };
    }
  }, [reqDomain, pocPool, companyName, roleTitle, jdText, parsedSkills, historicalProcesses, existingProcesses]);

  // Synthesize an allocation when the engine refused (NO_DOMAIN_POCS) but the
  // allocator has manually picked a Prep POC from the empty state.
  const allocation = useMemo<AllocationResult | null>(() => {
    if (allocOutcome.result) return allocOutcome.result;
    if (allocOutcome.error === "NO_DOMAIN_POCS" && prepOverride) {
      return {
        path: "A",
        prep: { ...prepOverride, matchType: "Manual Override" },
        supportSuggestions: [],
        tags: ["Manual Override"],
        allocationReason: `No POC is tagged with ${reqDomain}. ${prepOverride.name} was manually assigned as Prep POC.`,
        allocatedAt: new Date().toISOString(),
        alternatives: [],
      };
    }
    return null;
  }, [allocOutcome, prepOverride, reqDomain]);


  // Active selections
  const activePrep = prepOverride ?? allocation?.prep ?? null;
  const activeSupport = supportSkipped ? null : (supportOverride ?? allocation?.supportSuggestions?.[0] ?? null);

  // All prep POCs for selector
  const allPrepPocs = useMemo(() =>
    pocPool.filter(p => p.pocType === "prep" || p.pocType === "domain"),
    [pocPool]
  );

  const isOverridden = !!prepOverride || !!supportOverride || supportSkipped;

  const selectAsPrep = useCallback((poc: AssignedPoc) => {
    setPrepOverride(poc);
    setShowPrepSwitcher(false);
    if (activeSupport?.name === poc.name) {
      setSupportOverride(null);
    }
  }, [activeSupport]);

  const selectAsSupport = useCallback((poc: AssignedPoc) => {
    setSupportOverride(poc);
    setSupportSkipped(false);
    setShowSupportSwitcher(false);
  }, []);

  // Hydrate overrides from draft once pool is loaded
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    if (!initial || pocPool.length === 0) return;
    const find = (n?: string) => n ? pocPool.find(p => p.name === n) : undefined;
    const p = find(initial.prepName);
    const s = find(initial.supportName);
    const o = find(initial.outreachName);
    if (p) setPrepOverride(toAssignedFromPool(p));
    if (s) setSupportOverride(toAssignedFromPool(s));
    if (o) setOutreachPoc(toAssignedFromPool(o));
    hydratedRef.current = true;
  }, [initial, pocPool]);

  const handleSaveDraft = async () => {
    if (!onSaveDraft) return;
    setSavingDraft(true);
    try {
      await onSaveDraft({
        prepName: activePrep?.name,
        supportName: activeSupport?.name,
        supportSkipped,
        outreachName: outreachPoc?.name,
      });
      setDraftSaved(true);
      setTimeout(() => setDraftSaved(false), 1500);
    } finally {
      setSavingDraft(false);
    }
  };

  // Loading state
  if (loadingPocs || loadingLoads) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="h-8 w-8 mx-auto text-orange-500 animate-spin" />
        <p className="mt-3 text-[13px] text-n500">Loading live POC data & running allocation engine...</p>
      </div>
    );
  }

  if (!reqDomain) {
    return (
      <div className="py-10 text-center text-n500 text-[13px]">
        <AlertTriangle className="h-6 w-6 mx-auto text-yellow-500 mb-2" />
        Domain not available — go back and enter role details.
        <div className="mt-4">
          <button onClick={onBack} className="text-[13px] text-n600 hover:text-n900">← Back</button>
        </div>
      </div>
    );
  }

  if (!allocation) {
    // Dedicated empty state: a domain with zero opted-in POCs. Force manual selection.
    if (allocOutcome.error === "NO_DOMAIN_POCS") {
      const inDomainPocs = pocPool.filter(
        (p) =>
          (p.primaryDomains ?? p.domains ?? []).some((d) => d.toLowerCase() === reqDomain.toLowerCase()) ||
          (p.secondaryDomains ?? []).some((d) => d.toLowerCase() === reqDomain.toLowerCase()),
      );
      // `inDomainPocs` will be empty by definition here; offer the full prep pool
      // for manual override so the allocator can pick anyone.
      const manualPool = inDomainPocs.length > 0 ? inDomainPocs : allPrepPocs;
      return (
        <div className="space-y-4">
          <section className="rounded-2xl bg-card border border-n200 shadow-sm p-5">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-coral-50 p-2 shrink-0">
                <AlertTriangle className="h-4 w-4 text-coral-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-[14px] font-semibold text-n900">
                  No POC is tagged with {reqDomain}
                </h3>
                <p className="mt-1 text-[12.5px] text-n600 leading-relaxed">
                  Auto-allocation is paused until a POC opts into this domain. You can manually
                  assign a Prep POC below, or open POC Domains to tag someone.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => setShowPrepSwitcher((v) => !v)}
                    className="text-[12.5px] font-medium px-3 py-1.5 rounded-md bg-orange-500 text-white hover:bg-orange-600 transition-colors"
                  >
                    {showPrepSwitcher ? "Close picker" : "Manually pick Prep POC"}
                  </button>
                  <a
                    href="/settings/poc-domains"
                    className="text-[12.5px] font-medium text-n700 hover:text-orange-600 transition-colors"
                  >
                    Open POC Domains →
                  </a>
                </div>
              </div>
            </div>
            {showPrepSwitcher && (
              <div className="mt-4">
                <PocSwitcher
                  pocs={manualPool}
                  domain={reqDomain}
                  onSelect={(p) => selectAsPrep(toAssignedFromPool(p))}
                  onClose={() => setShowPrepSwitcher(false)}
                  label="Manually assign Prep POC"
                />
              </div>
            )}
          </section>
          <div className="text-center">
            <button onClick={onBack} className="text-[13px] text-n600 hover:text-n900">← Back</button>
          </div>
        </div>
      );
    }
    return (
      <div className="py-10 text-center text-n500 text-[13px]">
        <AlertTriangle className="h-6 w-6 mx-auto text-coral-500 mb-2" />
        Unable to run allocation — no POCs available.
        <div className="mt-4">
          <button onClick={onBack} className="text-[13px] text-n600 hover:text-n900">← Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* AI Summary */}
      <section className="relative rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-orange-500" />
        <div className="pl-5 pr-4 py-4">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-3.5 w-3.5 text-orange-500" />
            <span className="text-[10.5px] font-semibold text-n500 uppercase tracking-[0.6px]">AI Allocation Summary</span>
          </div>
          {allocation.prep.matchType === "Existing Process" ? (
            <p className="text-[13.5px] text-n800 leading-relaxed">
              <span className="font-semibold text-orange-600">{allocation.prep.name}</span>{" "}
              is reassigned —{" "}
              {allocation.tags?.includes("Existing Process · Same Role")
                ? <>they previously handled <span className="font-semibold text-n900">{companyName}</span> / <span className="font-semibold text-n900">{roleTitle}</span>.</>
                : <>they previously worked with <span className="font-semibold text-n900">{companyName}</span> on another role.</>}
              {" "}Load is not considered for returning companies.
              {allocation.supportSuggestions[0] && (
                <>
                  {" "}
                  <span className="font-semibold text-sky-600">{allocation.supportSuggestions[0].name}</span>
                  {" "}is suggested as Support POC to share the workload and add a second perspective.
                </>
              )}
            </p>
          ) : (
            <p className="text-[13.5px] text-n800 leading-relaxed">
              For this <span className="font-semibold text-n900">{reqDomain}</span> role,{" "}
              <span className="font-semibold text-orange-600">{allocation.prep.name}</span>
              {" "}is the best-fit Prep POC
              {allocation.prep.domainTier === "primary"
                ? " — this is their primary domain"
                : allocation.prep.domainTier === "secondary"
                ? " — they actively cover this domain"
                : " — strongest available match by skills and load"}
              {typeof allocation.prep.currentLoad === "number" && allocation.prep.maxThreshold ? (
                <> with a current load of {allocation.prep.currentLoad}/{allocation.prep.maxThreshold}</>
              ) : null}.
              {allocation.supportSuggestions[0] && (
                <>
                  {" "}
                  <span className="font-semibold text-sky-600">{allocation.supportSuggestions[0].name}</span>
                  {" "}is suggested as Support POC to share the workload and add a second perspective.
                </>
              )}
            </p>
          )}
        </div>
      </section>

      {/* Unified Allocation Card */}
      <section className="rounded-2xl bg-card border border-n200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-n100">
          <span className="text-[10.5px] font-semibold text-n500 uppercase tracking-[0.6px]">Allocation</span>
          <span className="text-[10.5px] text-n400">AI suggestions · editable</span>
        </div>
        <div className="divide-y divide-n100">
          {/* PREP ROW */}
          <AllocationRow
            dot="bg-orange-500"
            label="Prep POC"
            badges={[
              { text: "Required", cls: "bg-orange-500 text-white border-orange-500" },
              prepOverride
                ? { text: "Manual Override", cls: TAG_STYLES["Manual Override"] }
                : { text: "AI Suggested", cls: "bg-orange-50 text-orange-600 border-orange-200" },
            ]}
            actions={
              <button
                onClick={() => setShowPrepSwitcher(!showPrepSwitcher)}
                className="text-[11.5px] font-medium text-orange-600 hover:text-orange-800"
              >
                Change
              </button>
            }
          >
            {activePrep && <PocCard poc={activePrep} showBreakdown={true} />}
            {showPrepSwitcher && (
              <PocSwitcher
                pocs={allPrepPocs}
                currentName={activePrep?.name}
                excludeName={activeSupport?.name}
                domain={reqDomain}
                onSelect={(p) => selectAsPrep(toAssignedFromPool(p))}
                onClose={() => setShowPrepSwitcher(false)}
                label="Select Assigned Prep POC"
              />
            )}
          </AllocationRow>

          {/* SUPPORT ROW */}
          <AllocationRow
            dot="bg-sky-500"
            label="Support POC"
            badges={[
              { text: "Optional", cls: "bg-n50 text-n600 border-n200" },
              ...(!supportSkipped && !supportOverride && allocation.supportSuggestions[0]
                ? [{ text: "AI Suggested", cls: "bg-sky-50 text-sky-600 border-sky-200" }]
                : []),
            ]}
            actions={
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowSupportSwitcher(!showSupportSwitcher)}
                  className="text-[11.5px] font-medium text-sky-600 hover:text-sky-800"
                >
                  {activeSupport ? "Change" : "Add"}
                </button>
                {!supportSkipped && activeSupport && (
                  <button
                    onClick={() => { setSupportSkipped(true); setSupportOverride(null); setShowSupportSwitcher(false); }}
                    className="text-[11.5px] font-medium text-n500 hover:text-n700"
                  >
                    Skip
                  </button>
                )}
                {supportSkipped && (
                  <button
                    onClick={() => setSupportSkipped(false)}
                    className="text-[11.5px] font-medium text-sky-600 hover:text-sky-800"
                  >
                    Re-enable
                  </button>
                )}
              </div>
            }
          >
            {supportSkipped ? (
              <EmptyHint text="Support POC skipped — process can proceed without one." />
            ) : activeSupport ? (
              <PocCard poc={activeSupport} showBreakdown={true} />
            ) : (
              <EmptyHint text="No Support POC suggestion available — you can add one manually." />
            )}
            {showSupportSwitcher && (
              <PocSwitcher
                pocs={allPrepPocs}
                currentName={activeSupport?.name}
                excludeName={activePrep?.name}
                domain={reqDomain}
                onSelect={(p) => selectAsSupport(toAssignedFromPool(p))}
                onClose={() => setShowSupportSwitcher(false)}
                label="Select Support POC"
              />
            )}
          </AllocationRow>

          {/* OUTREACH ROW */}
          <AllocationRow
            dot="bg-emerald-500"
            label="Outreach POC"
            badges={[{ text: "Optional · Later", cls: "bg-n50 text-n600 border-n200" }]}
            actions={
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowOutreachSelector(!showOutreachSelector)}
                  className="text-[11.5px] font-medium text-emerald-600 hover:text-emerald-800"
                >
                  {outreachPoc ? "Change" : "Add"}
                </button>
                {outreachPoc && (
                  <button
                    onClick={() => { setOutreachPoc(null); setShowOutreachSelector(false); }}
                    className="text-[11.5px] font-medium text-n500 hover:text-n700"
                  >
                    Remove
                  </button>
                )}
              </div>
            }
          >
            {outreachPoc ? (
              <PocCard poc={outreachPoc} showBreakdown={false} />
            ) : (
              <EmptyHint text="Not assigned yet — can be added later by the Prep POC." />
            )}
            {showOutreachSelector && (
              <PocSwitcher
                pocs={pocPool.filter(p => p.pocType === "outreach")}
                currentName={outreachPoc?.name}
                domain={reqDomain}
                onSelect={(p) => { setOutreachPoc(toAssignedFromPool(p)); setShowOutreachSelector(false); }}
                onClose={() => setShowOutreachSelector(false)}
                label="Select Outreach POC"
              />
            )}
          </AllocationRow>
        </div>
      </section>

      {/* Alternatives */}
      {allocation.alternatives.length > 0 && (
        <section>
          <div className="flex items-end justify-between mb-2.5">
            <div>
              <div className="text-[10.5px] font-semibold text-n500 uppercase tracking-[0.6px]">Alternatives</div>
              <p className="text-[12px] text-n500 mt-0.5">Click to assign as Prep or Support.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {allocation.alternatives.slice(0, 3).map(alt => (
              <AlternativeCard
                key={alt.poc.name}
                alt={alt}
                onSetPrep={() => selectAsPrep(alt.poc)}
                onSetSupport={() => selectAsSupport(alt.poc)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Confirm bar */}
      <section className="rounded-2xl bg-card border border-n200 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 px-5 py-4">
          <div className="grid grid-cols-3 gap-2 flex-1 min-w-0">
            <ConfirmChip dot="bg-orange-500" label="Prep" poc={activePrep} required />
            <ConfirmChip dot="bg-sky-500" label="Support" poc={activeSupport} placeholder="Skipped" />
            <ConfirmChip dot="bg-emerald-500" label="Outreach" poc={outreachPoc} placeholder="Later" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={onBack} className="text-[13px] text-n500 hover:text-n800">← Back</button>
            {onSaveDraft && (
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={savingDraft}
                className="rounded-md border border-n300 bg-card px-3.5 py-2 text-[13px] font-medium text-n800 hover:border-orange-400 hover:bg-orange-50/40 transition-colors"
              >
                {savingDraft ? "Saving…" : draftSaved ? "Saved ✓" : "Save as Draft"}
              </button>
            )}
            <button
              onClick={() => {
                if (!activePrep || !allocation) return;
                onContinue({
                  prepPoc: activePrep,
                  supportPoc: activeSupport,
                  outreachPoc: outreachPoc,
                  allocation,
                });
              }}
              disabled={!activePrep}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md text-[13.5px] font-semibold px-5 py-2.5 transition-colors shadow-sm",
                activePrep
                  ? "bg-orange-500 hover:bg-orange-600 text-white"
                  : "bg-n200 text-n400 cursor-not-allowed"
              )}
            >
              <Check className="h-3.5 w-3.5" />
              Confirm & Continue
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── Layout helpers ──────────────────────────────────────────────────────

function AllocationRow({
  dot, label, badges, actions, children,
}: {
  dot: string;
  label: string;
  badges: { text: string; cls: string }[];
  actions: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-5 py-4">
      <div className="flex items-center justify-between mb-2.5 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
          <span className="text-[12px] font-semibold text-n800">{label}</span>
          <div className="flex items-center gap-1 ml-1">
            {badges.map((b, i) => (
              <span
                key={i}
                className={cn(
                  "inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.4px]",
                  b.cls,
                )}
              >
                {b.text}
              </span>
            ))}
          </div>
        </div>
        <div className="shrink-0">{actions}</div>
      </div>
      {children}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-n200 bg-n50/40 px-3.5 py-3 text-[12.5px] text-n500">
      {text}
    </div>
  );
}

function ConfirmChip({
  dot, label, poc, required, placeholder,
}: {
  dot: string;
  label: string;
  poc: AssignedPoc | null;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-n200 bg-n50/40 px-3 py-2 min-w-0">
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", dot)} />
      {poc ? (
        <>
          <div className={cn("h-7 w-7 rounded-full flex items-center justify-center text-[10.5px] font-semibold shrink-0", poc.color)}>
            {poc.initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[9.5px] uppercase tracking-[0.5px] text-n500 font-semibold">{label}</div>
            <div className="text-[12.5px] font-semibold text-n900 truncate">{poc.name}</div>
          </div>
        </>
      ) : (
        <div className="min-w-0 flex-1">
          <div className="text-[9.5px] uppercase tracking-[0.5px] text-n500 font-semibold">{label}</div>
          <div className="text-[12.5px] text-n400 italic truncate">{placeholder ?? (required ? "Required" : "—")}</div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function toAssignedFromPool(p: PocCapability): AssignedPoc {
  return {
    name: p.name,
    initials: p.initials,
    color: p.color,
    matchType: "Manual Override",
    currentLoad: p.currentLoad,
    maxThreshold: p.maxThreshold,
    scoreBreakdown: null,
    confidence: 0,
    domainTier: "cross",
  };
}

function PocCard({ poc, showBreakdown }: { poc: AssignedPoc; showBreakdown: boolean }) {
  const [open, setOpen] = useState(false);
  const loadPct = Math.min(100, Math.round((poc.currentLoad / poc.maxThreshold) * 100));
  const loadCls = loadPct >= 85 ? "bg-coral-400" : loadPct >= 60 ? "bg-yellow-400" : "bg-sage-400";
  const canExpand = showBreakdown && !!poc.scoreBreakdown;
  const tierLabel = poc.domainTier === "primary" ? "Primary domain" : poc.domainTier === "secondary" ? "Secondary domain" : "Cross-domain";
  const tierCls =
    poc.domainTier === "primary"  ? "text-sage-700" :
    poc.domainTier === "secondary" ? "text-amber-700" :
                                     "text-coral-700";

  return (
    <div className="rounded-xl border border-n200 bg-card px-3.5 py-2.5">
      <div className="flex items-center gap-3">
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0", poc.color)}>
          {poc.initials}
        </div>

        {/* Name + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-[13.5px] font-semibold text-n900 truncate">{poc.name}</span>
            <span className={cn(
              "shrink-0 inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-medium",
              TAG_STYLES[poc.matchType as AllocationTag] ?? "bg-n100 text-n600 border-n200",
            )}>
              {poc.matchType}
            </span>
            {poc.historicalTag && (
              <span
                className={cn(
                  "shrink-0 inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold",
                  TAG_STYLES[poc.historicalTag],
                )}
                title={`Worked on this company + role before`}
              >
                {poc.historicalTag === "Converted Expert" ? "🏆 " : "📌 "}{poc.historicalTag}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-n500">
            {poc.domainTier && <span className={cn("font-medium", tierCls)}>{tierLabel}</span>}
            {poc.scoreBreakdown && typeof poc.confidence === "number" && (
              <>
                <span className="text-n300">·</span>
                <span>{poc.confidence}% confidence</span>
              </>
            )}
          </div>
        </div>

        {/* Inline Load bar */}
        <div className="hidden sm:flex items-center gap-2 shrink-0 w-[140px]">
          <span className="text-[10px] text-n500 shrink-0">Load</span>
          <div className="h-1.5 flex-1 rounded-full bg-n100 overflow-hidden">
            <div className={cn("h-full transition-all", loadCls)} style={{ width: `${loadPct}%` }} />
          </div>
          <span className="text-[10.5px] tabular-nums font-medium text-n700 shrink-0">{poc.currentLoad}/{poc.maxThreshold}</span>
        </div>

        {/* Score */}
        {poc.scoreBreakdown && (
          <div className="text-right shrink-0 pl-1" title={scoreTooltip(poc)}>
            <div className="text-[16px] font-bold text-orange-500 tabular-nums leading-none">{poc.scoreBreakdown.final}</div>
            <div className="text-[8.5px] text-n500 uppercase tracking-[0.5px] mt-0.5">Score / 100</div>
          </div>
        )}

        {/* Details toggle */}
        {canExpand && (
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="shrink-0 inline-flex items-center gap-0.5 rounded-md border border-n200 bg-card hover:bg-n50 text-n600 hover:text-n900 px-1.5 py-1 text-[10.5px] font-medium transition-colors"
            aria-expanded={open}
          >
            <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
            Details
          </button>
        )}
      </div>

      {/* Mobile load bar */}
      <div className="sm:hidden mt-2 flex items-center gap-2">
        <span className="text-[10px] text-n500 shrink-0">Load</span>
        <div className="h-1.5 flex-1 rounded-full bg-n100 overflow-hidden">
          <div className={cn("h-full", loadCls)} style={{ width: `${loadPct}%` }} />
        </div>
        <span className="text-[10.5px] tabular-nums font-medium text-n700 shrink-0">{poc.currentLoad}/{poc.maxThreshold}</span>
      </div>

      {canExpand && open && poc.scoreBreakdown && (
        <div className="mt-3 border-t border-n100 pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {poc.scoreBreakdown.domain !== undefined && (
              <MetricBar label="Domain" value={poc.scoreBreakdown.domain} />
            )}
            {poc.scoreBreakdown.expertise !== undefined && (
              <MetricBar label="Expertise" value={poc.scoreBreakdown.expertise} />
            )}
            <MetricBar label="Load" value={poc.scoreBreakdown.load} />
            <MetricBar label="Fairness" value={poc.scoreBreakdown.fairness} />
          </div>
        </div>
      )}

    </div>
  );
}

function MetricBar({ label, value, source }: { label: string; value: number; source?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="flex items-center justify-between text-[10.5px] mb-1">
        <span className="text-n500">
          {label}
          {source && (
            <span className="ml-1 text-[9px] text-n400 uppercase tracking-[0.3px]">live · {source}</span>
          )}
        </span>
        <span className="tabular-nums font-semibold text-n800">{value}</span>
      </div>
      <div className="h-1 rounded-full bg-n100 overflow-hidden">
        <div className="h-full bg-orange-400" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function scoreTooltip(poc: AssignedPoc): string {
  const b = poc.scoreBreakdown;
  if (!b) return "";
  const isInDomain = poc.domainTier !== "cross";
  const lines: string[] = ["Weighted 0–100 score (not a sum). All inputs are live.", ""];
  if (isInDomain && b.domain !== undefined && b.expertise !== undefined) {
    lines.push("Formula (in-domain):");
    lines.push("  Domain×40% + Expertise×25% + Load×30% + Fairness×5%");
    lines.push(`  = ${b.domain}×0.40 + ${b.expertise}×0.25 + ${b.load}×0.30 + ${b.fairness}×0.05`);
  } else if (b.expertise !== undefined) {
    lines.push("Formula (cross-domain):");
    lines.push("  Expertise×45% + Load×45% + Fairness×10%");
    lines.push(`  = ${b.expertise}×0.45 + ${b.load}×0.45 + ${b.fairness}×0.10`);
  } else {
    lines.push("Formula: Load×70% + Fairness×30%");
    lines.push(`  = ${b.load}×0.70 + ${b.fairness}×0.30`);
  }
  if (b.underutilizedBoost) lines.push(`+ underutilized boost: ${b.underutilizedBoost}`);
  lines.push("", `Final = ${b.final} / 100`);
  if (poc.historicalTag) {
    lines.push(`Bonus applied: ${poc.historicalTag} (+${poc.historicalTag === "Converted Expert" ? 30 : 15})`);
  }
  lines.push("", "Sources: poc_profiles (domain/skills/last_assigned_at), lmp_processes (live load).");
  return lines.join("\n");
}

function ScoreFormula({
  breakdown,
  domainTier,
  historicalTag,
}: {
  breakdown: NonNullable<AssignedPoc["scoreBreakdown"]>;
  domainTier?: AssignedPoc["domainTier"];
  historicalTag?: AssignedPoc["historicalTag"];
}) {
  const inDomain = domainTier !== "cross";
  const hasDomain = breakdown.domain !== undefined && breakdown.expertise !== undefined && inDomain;
  const hasCross = breakdown.expertise !== undefined && !inDomain;
  return (
    <div className="rounded-md bg-n50 border border-n100 px-2.5 py-2 text-[10.5px] text-n600 leading-relaxed tabular-nums">
      {hasDomain ? (
        <>
          <div>Score = Domain×40% + Expertise×25% + Load×30% + Fairness×5%</div>
          <div className="text-n500">
            = {breakdown.domain}×0.40 + {breakdown.expertise}×0.25 + {breakdown.load}×0.30 + {breakdown.fairness}×0.05
            {breakdown.underutilizedBoost ? ` + ${breakdown.underutilizedBoost} boost` : ""} → {" "}
            <span className="font-semibold text-orange-600">{breakdown.final} / 100</span>
          </div>
        </>
      ) : hasCross ? (
        <>
          <div>Score (cross-domain) = Expertise×45% + Load×45% + Fairness×10%</div>
          <div className="text-n500">
            = {breakdown.expertise}×0.45 + {breakdown.load}×0.45 + {breakdown.fairness}×0.10
            {breakdown.underutilizedBoost ? ` + ${breakdown.underutilizedBoost} boost` : ""} → {" "}
            <span className="font-semibold text-orange-600">{breakdown.final} / 100</span>
          </div>
        </>
      ) : (
        <>
          <div>Score = Load×70% + Fairness×30%</div>
          <div className="text-n500">
            = {breakdown.load}×0.70 + {breakdown.fairness}×0.30
            {breakdown.underutilizedBoost ? ` + ${breakdown.underutilizedBoost} boost` : ""} → {" "}
            <span className="font-semibold text-orange-600">{breakdown.final} / 100</span>
          </div>
        </>
      )}
      {historicalTag && (
        <div className="mt-1 text-sage-700">
          + {historicalTag} bonus (+{historicalTag === "Converted Expert" ? 30 : 15})
        </div>
      )}
      <div className="mt-1 text-n400 text-[9.5px]">
        Weighted blend (0–100, not a sum). Live from poc_profiles + lmp_processes.
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-n500">{label}</span>
      <span className="tabular-nums font-semibold text-n800">{value}</span>
    </div>
  );
}

function PocSwitcher({
  pocs, currentName, excludeName, domain, onSelect, onClose, label,
}: {
  pocs: PocCapability[];
  currentName?: string;
  excludeName?: string;
  domain: string;
  onSelect: (p: PocCapability) => void;
  onClose: () => void;
  label: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = pocs.filter(p => {
    if (p.name === excludeName) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return p.availability === "available";
  }).sort((a, b) => {
    const aIn = a.domains.some(d => d.toLowerCase() === domain.toLowerCase()) ? 0 : 1;
    const bIn = b.domains.some(d => d.toLowerCase() === domain.toLowerCase()) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return a.currentLoad - b.currentLoad;
  });

  return (
    <div className="mt-3 rounded-xl border border-sky-300 bg-sky-50/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11.5px] font-semibold text-sky-700">{label}</span>
        <button onClick={onClose} className="text-n500 hover:text-n800"><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-n400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search POCs..."
          className="w-full h-8 rounded-md border border-n300 bg-card pl-8 pr-3 text-[12px] text-n800 placeholder:text-n400 focus:outline-none focus:border-sky-400"
        />
      </div>
      <div className="max-h-48 overflow-y-auto space-y-1">
        {filtered.map(p => {
          const inDomain = p.domains.some(d => d.toLowerCase() === domain.toLowerCase());
          const isCurrent = p.name === currentName;
          return (
            <button
              key={p.name}
              onClick={() => onSelect(p)}
              className={cn(
                "w-full flex items-center gap-2.5 rounded-lg p-2 text-left transition-colors",
                isCurrent ? "bg-sky-100 border border-sky-300" : "hover:bg-card border border-transparent"
              )}
            >
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0", p.color)}>
                {p.initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[12px] font-semibold text-n800 truncate">{p.name}</div>
                <div className="text-[10px] text-n500">{p.label} · Load {p.currentLoad}/{p.maxThreshold}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {inDomain && <span className="text-[9px] font-medium text-sage-700 bg-sage-50 border border-sage-200 px-1.5 py-0.5 rounded-full">In-Domain</span>}
                {isCurrent && <Check className="h-3.5 w-3.5 text-sky-600" />}
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="text-[11px] text-n500 text-center py-3">No matching POCs found.</p>
        )}
      </div>
    </div>
  );
}

function AlternativeCard({
  alt,
  onSetPrep,
  onSetSupport,
}: {
  alt: { poc: AssignedPoc; isInDomain: boolean };
  onSetPrep: () => void;
  onSetSupport: () => void;
}) {
  const poc = alt.poc;
  const loadPct = Math.min(100, Math.round((poc.currentLoad / poc.maxThreshold) * 100));
  const fitCls = alt.isInDomain ? "bg-sage-50 text-sage-700 border-sage-200" : "bg-coral-50 text-coral-700 border-coral-200";
  const loadCls = loadPct >= 85 ? "bg-coral-400" : loadPct >= 60 ? "bg-yellow-400" : "bg-sage-400";
  return (
    <div className="rounded-xl border border-n200 bg-card p-3.5 hover:border-n300 transition-colors">
      <div className="flex items-center gap-2.5">
        <div className={cn("h-9 w-9 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0", poc.color)}>{poc.initials}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-n900 truncate">{poc.name}</div>
        </div>
        {poc.scoreBreakdown && (
          <div className="text-right">
            <div className="text-[15px] font-bold text-n800 tabular-nums leading-none">{poc.scoreBreakdown.final}</div>
            <div className="text-[9px] text-n500 uppercase tracking-[0.4px]">score</div>
          </div>
        )}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium", fitCls)}>
          {alt.isInDomain ? "In-domain" : "Cross-domain"}
        </span>
        <div className="flex items-center gap-1.5 min-w-0 flex-1 max-w-[100px]">
          <span className="text-[10px] text-n500 shrink-0">Load</span>
          <div className="h-1 flex-1 rounded-full bg-n100 overflow-hidden">
            <div className={cn("h-full", loadCls)} style={{ width: `${loadPct}%` }} />
          </div>
          <span className="text-[10px] tabular-nums text-n600 shrink-0">{poc.currentLoad}/{poc.maxThreshold}</span>
        </div>
      </div>
      {poc.historicalTag && (
        <div className="mt-2">
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-1.5 py-[1px] text-[9.5px] font-semibold",
              TAG_STYLES[poc.historicalTag],
            )}
          >
            {poc.historicalTag === "Converted Expert" ? "🏆 " : "📌 "}{poc.historicalTag}
          </span>
        </div>
      )}
      <div className="mt-2.5 flex gap-2">
        <button onClick={onSetPrep} className="text-[10.5px] font-medium text-orange-600 hover:text-orange-800 underline underline-offset-2">
          Set as Prep POC
        </button>
        <button onClick={onSetSupport} className="text-[10.5px] font-medium text-sky-600 hover:text-sky-800 underline underline-offset-2">
          Set as Support
        </button>
      </div>
    </div>
  );
}

export { PocCard as EnginePocCard };
