import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownUp, Sparkles, RefreshCw, Star, Users2, Search, SlidersHorizontal, Loader2, CheckCircle2, AlertTriangle, Check, UserPlus } from "lucide-react";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { cn } from "@/lib/utils";
import { type Mentor, type MentorSource, SOURCE_META } from "@/lib/mentor";
import { getJd, extractSkillsFromText, extractSeniority } from "@/lib/jdStore";
import { type ALUMentor, rowToALUMentor } from "@/lib/alumniStore";
import { useAllMentors, useAlumniMentors, useAllAlumni } from "@/lib/hooks/useDbData";
import { DEFAULT_ROUNDS, type Candidate, type Round } from "@/lib/lmpProcessMutations";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { MentorsEmptyState } from "./mentors/EmptyState";
import { MatchingOverlay, STEP_LABELS, type MatchStep, type MatchStepId } from "./mentors/MatchingOverlay";
import { MentorFilters, EMPTY_MENTOR_FILTERS } from "./mentors/MentorFilters";
import { MentorCard } from "./mentors/MentorCard";
import { MentorProfileDrawer } from "./mentors/MentorProfileDrawer";
import { ShortlistedTable } from "./mentors/ShortlistedTable";
import { ReviewModeBanner } from "./mentors/ReviewModeBanner";
import { SortableMentorCard } from "./mentors/SortableMentorCard";
import { AssignedTable, type Assignment } from "./mentors/AssignedTable";
import { AssignMentorModal, type AssignmentDraft } from "./mentors/AssignMentorModal";
import { MatchContextModal, type MatchContext, type MatchMode } from "./mentors/MatchContextModal";
import { AlignMentorModal } from "./mentors/AlignMentorModal";
import { SessionsLiveTab } from "./SessionsLiveTab";
import { useMentorsTabState } from "@/lib/mentorsTabStore";
import { useLmpMentorsLive } from "@/lib/hooks/useLmpMentorsLive";
import { lmpMentorRowToMentor } from "./mentors/mapDbMentor";
import { resolveMentorDbId } from "@/lib/mentorResolver";
import { getExternalDiscoveryConfig, fetchExternalDiscoveryConfig } from "@/lib/externalDiscoveryConfig";
import {
  fetchExternalMentors,
  generateExternalQueries, setExternalSearchContext,
  type ExternalMentor, type ExternalPlatform,
} from "@/lib/externalMentors";
import type { MatchingError } from "@/lib/mentorMatching";
import { getScoringWeights } from "@/lib/scoringWeights";
import {
  normaliseDbMentor, normaliseALU, normaliseExternal,
  runPipeline,
  type ScoringCandidate, type JdInfo,
} from "@/lib/mentorPipeline";
import { fetchMentorCompanyTiers } from "@/lib/mentorCompanyTiers";
import { extEmptyResultMessage, extFetchedZeroMessage } from "@/lib/extErrorMessage";
import { LMP_MENTOR_SUGGESTION_LIMIT } from "@/lib/config/thresholds";

const SUB_TABS: { id: "suggested" | "shortlisted" | "assigned"; label: string; icon: typeof Sparkles }[] = [
  { id: "suggested",  label: "Suggested",   icon: Sparkles },
  { id: "shortlisted", label: "Shortlisted", icon: Star },
  { id: "assigned",   label: "Assigned",    icon: Users2 },
];

function nowStamp() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// Scoring + pipeline helpers live in `@/lib/mentorPipeline` so the same
// logic can be reused by the standalone Run Mentor modal on /mentors.


// ─── External status (Phase 2 banner) ───

type ExternalStatus = {
  phase: "idle" | "loading" | "done" | "failed";
  platforms: ExternalPlatform[];
  counts: Partial<Record<ExternalPlatform, number>>;
};

const EMPTY_EXTERNAL_STATUS: ExternalStatus = { phase: "idle", platforms: [], counts: {} };

// ─── Component ───

type MentorsTabProps = {
  reqId: string;
  role?: string;
  company?: string;
  domain?: string;
  industry?: string;
  candidates?: Candidate[];
  rounds?: Round[];
  /** @deprecated Use operationalReadOnly */
  readOnly?: boolean;
  /** When true, POC-only mutations are disabled but viewing remains enabled. */
  operationalReadOnly?: boolean;
};

export function MentorsTab(props: MentorsTabProps) {
  return (
    <ErrorBoundary fallbackTitle="Mentors unavailable">
      <MentorsTabImpl {...props} />
    </ErrorBoundary>
  );
}

function MentorsTabImpl({
  reqId,
  role = "Product Manager",
  company = "",
  domain = "",
  industry,
  candidates = [],
  rounds = DEFAULT_ROUNDS,
  readOnly = false,
  operationalReadOnly = false,
}: MentorsTabProps) {
  const pocReadOnly = operationalReadOnly || readOnly;
  const [state, setState] = useMentorsTabState(reqId);
  const { phase, subTab, suggested, shortlisted, assignments, filters, sort, activeSources, reviewMode } = state;
  const queryClient = useQueryClient();

  const { data: allMentors = [], refetch: refetchMentors } = useAllMentors();
  const { refetch: refetchAlumni } = useAllAlumni();
  const { mentors: alumniMentors } = useAlumniMentors();
  useEffect(() => {
    fetchExternalDiscoveryConfig().catch(() => { /* keep defaults */ });
  }, []);
  useEffect(() => {
    fetchMentorCompanyTiers().catch(() => { /* use versioned defaults */ });
  }, []);

  // Hydrate shortlisted from DB so the empty state ("Run AI Matching") never
  // shows when this LMP already has assigned/aligned mentors in lmp_mentors —
  // even on a fresh browser or after localStorage was cleared.
  const { data: dbLmpMentors = [] } = useLmpMentorsLive(reqId);


  // Local-only ephemeral UI state (modals/drawers)
  const [profile, setProfile] = useState<Mentor | null>(null);
  const [assignTarget, setAssignTarget] = useState<Mentor | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [matchContextOpen, setMatchContextOpen] = useState(false);
  const [alignOpen, setAlignOpen] = useState(false);
  const [externalStatus, setExternalStatus] = useState<ExternalStatus>(EMPTY_EXTERNAL_STATUS);
  const [matchingErrors, setMatchingErrors] = useState<MatchingError[]>([]);
  const [matchSteps, setMatchSteps] = useState<MatchStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const { toast: shadcnToast } = useToast();
  const lastMatchingErrorSig = useRef<string>("");
  const matchingAnchorRef = useRef<HTMLDivElement>(null);
  const matchingToastIdRef = useRef<string | number | null>(null);
  const cancelMatchingRef = useRef(false);

  const cancelMatching = () => {
    cancelMatchingRef.current = true;
    setExternalStatus(EMPTY_EXTERNAL_STATUS);
    setState({ phase: suggested.length > 0 ? "results" : "empty" });
    toast.info("Mentor matching cancelled");
  };

  // One-shot hydration from lmp_mentors. Only seeds local state when the user
  // has no shortlisted entries locally and we're not in the middle of a match
  // run. We also flip phase → "results" so the empty-state CTA stays gone.
  const hydratedFromDbRef = useRef(false);
  useEffect(() => {
    if (hydratedFromDbRef.current) return;
    if (phase === "matching") return;
    if (!dbLmpMentors.length) return;
    const entries = dbLmpMentors
      .map((r) => {
        const mentor = lmpMentorRowToMentor(r);
        if (!mentor) return null;
        return { mentor, shortlistedAt: r.assigned_at ?? new Date().toISOString() };
      })
      .filter((x): x is { mentor: Mentor; shortlistedAt: string } => !!x);
    if (!entries.length) return;
    hydratedFromDbRef.current = true;
    // Merge DB-backed shortlisted with any local entries (don't lose unsynced picks).
    const existingIds = new Set(shortlisted.map((s) => s.mentor.id));
    const merged = [
      ...shortlisted,
      ...entries.filter((e) => !existingIds.has(e.mentor.id)),
    ];
    setState({
      shortlisted: merged,
      phase: "results",
      // If there are no suggested results yet, land on Shortlisted so the user
      // actually sees their saved mentors instead of an empty Suggested tab.
      subTab: suggested.length === 0 ? "shortlisted" : subTab,
    });
  }, [dbLmpMentors, shortlisted, suggested.length, phase, subTab, setState]);

  // Hydrate suggested results from DB (saved after a previous Find Mentors run)
  // so matches persist across devices, browsers, and cache clears. Never
  // overwrites existing local suggestions or an in-flight match run.
  const hydratedSuggestionsRef = useRef(false);
  useEffect(() => {
    if (hydratedSuggestionsRef.current) return;
    if (!reqId) return;
    if (phase === "matching") return;
    if (suggested.length > 0) {
      hydratedSuggestionsRef.current = true;
      return;
    }
    hydratedSuggestionsRef.current = true;
    (async () => {
      const { data, error } = await supabase
        .from("lmp_processes")
        .select("mentor_suggestions, mentor_suggestions_context" as any)
        .eq("id", reqId)
        .maybeSingle();
      if (error || !data) return;
      const saved = (data as any).mentor_suggestions as Mentor[] | null;
      const savedCtx = (data as any).mentor_suggestions_context as MatchContext | null;
      if (!Array.isArray(saved) || saved.length === 0) return;
      setState({
        suggested: saved,
        phase: "results",
        // Always prefer Suggested when we just hydrated a saved run — that's
        // the "first end result" the user expects to land on.
        subTab: "suggested",
        reviewMode: false,
        _matchContext: savedCtx ?? null,
        activeSources: savedCtx?.sources ?? ["MU", "ALU", "EXT"],
      });
    })();
  }, [reqId, phase, suggested.length, subTab, setState]);


  const notifyMatchingErrors = (errs: MatchingError[]) => {
    const fatal = errs.filter((e) => !e.recoverable);
    if (fatal.length === 0) return;
    const sources = Array.from(new Set(fatal.map((e) => e.source)));
    const sig = sources.sort().join(",");
    if (sig === lastMatchingErrorSig.current) return;
    lastMatchingErrorSig.current = sig;
    const extErr = fatal.find((e) => e.source === "EXT");
    const description =
      sources.length === 1 && sources[0] === "EXT"
        ? `External search unavailable${extErr?.message ? `: ${extErr.message}` : ""}. Showing MU + ALU results.`
        : `${sources.join(", ")} source unavailable. Showing remaining results.`;
    shadcnToast({
      variant: "destructive",
      title: "Matching incomplete",
      description,
    });
  };

  const shortlistedIds = useMemo(
    () => new Set(shortlisted.map((s) => s.mentor.id)),
    [shortlisted],
  );

  // Assignments are stored one-per-candidate, but the Assigned table groups them
  // by (mentor + round + role) into a single row. Count groups (not candidates)
  // so the badge and header match the rows the user actually sees.
  const assignedGroupCount = useMemo(() => {
    const keys = new Set<string>();
    for (const a of assignments) {
      keys.add(`${a.mentor.id}|${a.round.id ?? a.round.name}|${a.role}`);
    }
    return keys.size;
  }, [assignments]);

  // Dedupe shortlisted by mentor id so duplicate lmp_mentors rows for the same
  // mentor count as one in the tab badge / header summary.
  const shortlistedUniqueCount = useMemo(
    () => new Set(shortlisted.map((s) => s.mentor.id)).size,
    [shortlisted],
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.sources.length !== 3) n++;
    if (filters.scoreRange[0] !== 0 || filters.scoreRange[1] !== 100) n++;
    if (filters.decisionTags.length > 0) n++;
    if (filters.seniorities.length > 0) n++;
    return n;
  }, [filters]);

  const filtered = useMemo(() => {
    return suggested
      .filter((m) => filters.sources.includes(m.source))
      .filter((m) => m.score >= filters.scoreRange[0] && m.score <= filters.scoreRange[1])
      .filter((m) => filters.decisionTags.length === 0 ||
        m.decisionTags.some((t) => filters.decisionTags.includes(t.label)))
      .filter((m) => filters.seniorities.length === 0 || filters.seniorities.includes(m.seniority))
      .sort((a, b) =>
        sort === "score" ? b.score - a.score :
        sort === "rating" ? b.rating - a.rating :
        b.outcome - a.outcome,
      );
  }, [suggested, filters, sort]);

  const openMatchContext = () => {
    if (!pocReadOnly) setMatchContextOpen(true);
  };

  const yieldFrame = (ms = 80) => new Promise<void>((r) => setTimeout(r, ms));

  const onMatchingDone = () => {
    // Overlay finished its dismiss animation; phase already advanced to "results" by the RANK step.
  };

  const runMatching = (context: MatchContext) => {
    if (pocReadOnly) return;
    setMatchContextOpen(false);
    setMatchingErrors([]);
    cancelMatchingRef.current = false;
    lastMatchingErrorSig.current = "";

    const cfg = getExternalDiscoveryConfig();
    const extEnabled = cfg.anyEnabled && context.sources.includes("EXT");
    const stepIds: MatchStepId[] = [];
    if (context.sources.includes("MU")) stepIds.push("MU");
    if (context.sources.includes("ALU")) stepIds.push("ALU");
    if (extEnabled) stepIds.push("EXT");
    stepIds.push("RANK");
    const steps: MatchStep[] = stepIds.map((id) => ({ id, label: STEP_LABELS[id] }));

    setMatchSteps(steps);
    setCurrentStep(0);
    setState({
      activeSources: context.sources,
      filters: { ...EMPTY_MENTOR_FILTERS, sources: context.sources },
      phase: "matching",
      _matchContext: context,
    });

    // Scroll the matching overlay into view so the user always sees progress.
    requestAnimationFrame(() => {
      matchingAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });

    // Loading state is handled by the in-page MatchingOverlay animation;
    // no extra toast needed.

    void runMatchingPipeline(context, steps, cfg);
  };

  const runMatchingPipeline = async (
    context: MatchContext,
    steps: MatchStep[],
    cfg: ReturnType<typeof getExternalDiscoveryConfig>,
  ) => {
    let jdSkills: string[] = [];
    let jdRole = role;
    let jdSeniority = "Mid";
    let jdCompany = company;

    if (context?.jdMode === "jd" && context.jdData) {
      jdSkills = context.jdData.skills;
      jdRole = context.jdData.role || role;
      jdSeniority = context.jdData.seniority || "Mid";
      jdCompany = context.jdData.company || company;
    } else if (context?.jdMode === "fallback") {
      const combinedText = `${role} ${domain} ${context.fallbackKeywords}`;
      jdSkills = extractSkillsFromText(combinedText);
      jdSeniority = extractSeniority(combinedText);
    } else {
      const jd = getJd(reqId);
      if (jd) {
        jdSkills = jd.skills;
        jdRole = jd.role || role;
        jdSeniority = jd.seniority || "Mid";
      } else {
        jdSkills = extractSkillsFromText(`${role} ${domain}`);
        jdSeniority = extractSeniority(role);
      }
    }

    // Merge user-selected skills from MatchContext if any
    if (context?.selectedSkills?.length) {
      jdSkills = Array.from(new Set([...jdSkills, ...context.selectedSkills]));
    }

    const gapSkills = context?.useResumes ? (context.resumeGapSkills || []) : [];
    const jdIndustry = Array.from(new Set(
      [industry, domain, ...(context?.selectedIndustries ?? [])]
        .map((value) => value?.trim())
        .filter((value): value is string => !!value),
    )).join(" ");
    const jdInfo = { jdSkills, jdRole, jdSeniority, jdCompany, jdIndustry, gapSkills };

    // Ensure MU/ALU data is loaded before matching — avoids 0 results when hooks are still fetching.
    let muRowsForMatch = allMentors;
    let aluRowsForMatch = alumniMentors;
    try {
      if (context.sources.includes("MU")) {
        const r = await refetchMentors();
        if (r.data) muRowsForMatch = r.data;
      }
      if (context.sources.includes("ALU")) {
        const r = await refetchAlumni();
        if (r.data) aluRowsForMatch = r.data.map((row) => rowToALUMentor(row as Parameters<typeof rowToALUMentor>[0]));
      }
    } catch {
      toast.warning("Couldn't load mentor database — check connection and retry.");
    }

    const rawCandidates: ScoringCandidate[] = [];
    let externalCandidates: ScoringCandidate[] = [];
    let extFetchMeta: { reason?: "gemini_error" | "no_results"; detail?: string | null } = {};

    for (let i = 0; i < steps.length; i++) {
      if (cancelMatchingRef.current) return;
      setCurrentStep(i);
      await yieldFrame(80);
      if (cancelMatchingRef.current) return;
      const step = steps[i];

      if (step.id === "MU") {
        const muRows = muRowsForMatch.filter((m: any) => (m.source || "MU") === "MU");
        rawCandidates.push(...muRows.map(normaliseDbMentor));
      } else if (step.id === "ALU") {
        rawCandidates.push(...aluRowsForMatch.map(normaliseALU));
      } else if (step.id === "EXT") {
        const enabledLabels: ExternalPlatform[] = [];
        if (cfg.topmate) enabledLabels.push("Topmate");
        if (cfg.adplist) enabledLabels.push("ADPList");
        if (cfg.linkedin) enabledLabels.push("LinkedIn");
        if (cfg.superpeer) enabledLabels.push("Superpeer");
        setExternalStatus({ phase: "loading", platforms: enabledLabels, counts: {} });

        const queries = generateExternalQueries({
          role: jdRole,
          company: jdCompany,
          industry: jdIndustry,
          required_skills: jdSkills,
          seniority_level: jdSeniority,
        });

        // Pass JD context to AI-backed external discovery
        const jdText =
          (context?.jdMode === "jd" && context.jdData?.rawText)
          || getJd(reqId)?.rawText
          || "";
        setExternalSearchContext({
          role: jdRole,
          company: jdCompany,
          industry: jdIndustry,
          skills: jdSkills,
          seniority: jdSeniority,
          jdText,
        });

        const emptyResult = { mentors: [] as ExternalMentor[], errors: [] as MatchingError[] };
        try {
          // Single live AI-backed discovery covers all enabled platforms
          // (LinkedIn, Topmate, ADPList, Superpeer) — same entry point as the
          // standalone Run Mentor modal.
          const res = cfg.linkedin || cfg.topmate || cfg.adplist || cfg.superpeer
            ? await fetchExternalMentors(queries, cfg)
            : emptyResult;
          extFetchMeta = { reason: res.reason, detail: res.detail ?? null };
          const counts: Partial<Record<ExternalPlatform, number>> = {};
          for (const p of enabledLabels) counts[p] = res.mentors.filter(m => m.platform === p).length;
          if (res.errors.length > 0 && res.mentors.length === 0) {
            setMatchingErrors(res.errors);
            toast.warning(`External discovery: ${res.errors.map((e) => e.message).join(" · ")}`);
          } else if (res.errors.length > 0) {
            setMatchingErrors(res.errors);
          }
          externalCandidates = res.mentors.map(normaliseExternal);
          setExternalStatus({ phase: "done", platforms: enabledLabels, counts });
          window.setTimeout(() => setExternalStatus({ phase: "idle", platforms: [], counts: {} }), 4000);
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          const fatal: MatchingError[] = [{ source: "EXT", message: m, recoverable: false }];
          setMatchingErrors(fatal);
          notifyMatchingErrors(fatal);
          setExternalStatus({ phase: "failed", platforms: enabledLabels, counts: {} });
          window.setTimeout(() => setExternalStatus({ phase: "idle", platforms: [], counts: {} }), 4000);
        }
      } else if (step.id === "RANK") {
        if (rawCandidates.length === 0 && externalCandidates.length === 0) {
          setState({ suggested: [], phase: "results", subTab: "suggested", reviewMode: false });
          const onlyExt = context.sources.length === 1 && context.sources[0] === "EXT";
          const extSelected = context.sources.includes("EXT");
          toast.warning(
            onlyExt
              ? extEmptyResultMessage({
                onlyExt: true,
                reason: extFetchMeta.reason,
                detail: extFetchMeta.detail,
              })
              : extSelected && rawCandidates.length === 0
                ? "No mentors in MU/ALU sources — upload CSVs in Data Sources, or wait for data to finish loading and rerun."
                : "No mentor data found in selected sources. Upload CSVs in Data Sources first.",
          );
        } else {
          const merged = [...rawCandidates, ...externalCandidates];
          const extKnownKeys = new Set(
            rawCandidates.map((c) =>
              c.linkedin?.toLowerCase().trim()
              || `${c.name.toLowerCase().trim()}|${(c.company || "").toLowerCase().trim()}`,
            ),
          );
          const extNovelCount = externalCandidates.filter((c) => {
            const key = c.linkedin?.toLowerCase().trim()
              || `${c.name.toLowerCase().trim()}|${(c.company || "").toLowerCase().trim()}`;
            return !extKnownKeys.has(key);
          }).length;
          const fullScored = runPipeline(
            merged,
            jdInfo,
            getScoringWeights(),
            context.matchMode,
            LMP_MENTOR_SUGGESTION_LIMIT,
          );
          setState({ suggested: fullScored, phase: "results", subTab: "suggested", reviewMode: true });
          if (fullScored.length === 0 && merged.length > 0) {
            toast.warning("Mentors were loaded but none matched this role — broaden skills or try a different match mode.");
          } else {
            emitMatchToast(fullScored, {
              extSelected: context.sources.includes("EXT"),
              extFetched: externalCandidates.length,
              extNovel: extNovelCount,
              extReason: extFetchMeta.reason,
              extDetail: extFetchMeta.detail,
            });
          }
          // Persist results to DB so they survive device/browser changes.
          const { error: persistErr } = await supabase
            .from("lmp_processes")
            .update({
              mentor_suggestions: fullScored as any,
              mentor_suggestions_at: new Date().toISOString(),
              mentor_suggestions_context: (context as any) ?? null,
            } as any)
            .eq("id", reqId);
          if (persistErr) {
            console.error("[MentorsTab] failed to save mentor_suggestions:", persistErr);
            toast.error(`Couldn't save results: ${persistErr.message}`);
          } else {
            queryClient.invalidateQueries({ queryKey: ["db-lmp-process", reqId] });
          }
        }
      }
    }

    setCurrentStep(steps.length);
  };

  function emitMatchToast(
    scored: Mentor[],
    extMeta?: {
      extSelected: boolean;
      extFetched: number;
      extNovel: number;
      extReason?: "gemini_error" | "no_results";
      extDetail?: string | null;
    },
  ) {
    const muResults = scored.filter(m => m.source === "MU").length;
    const aluResults = scored.filter(m => m.source === "ALU").length;
    const extResults = scored.filter(m => m.source === "EXT").length;
    const parts = [
      `${muResults} Mentor Union`,
      `${aluResults} Alumni`,
      `${extResults} External`,
    ].join(" · ");
    if (scored.length > 0) {
      const top = scored.slice().sort((a, b) => b.score - a.score)[0];
      toast.success(
        `Found ${scored.length} mentors · ${parts} · Top score: ${top.score}/45 (${top.tier_label})`,
      );
      if (extMeta?.extSelected && extResults === 0) {
        if (extMeta.extFetched === 0) {
          toast.warning(extFetchedZeroMessage({
            reason: extMeta.extReason,
            detail: extMeta.extDetail,
          }));
        } else if (extMeta.extNovel === 0) {
          toast.warning("External search found profiles, but all matched people already in your MU/ALU pool.");
        } else {
          toast.warning("External mentors were found but none ranked into the top suggestions — try broadening skills or role.");
        }
      }
    } else {
      toast("No matches found in any source — broaden the role or upload more data.");
    }
  }

  const toggleShortlist = async (m: Mentor) => {
    if (pocReadOnly) return;
    if (shortlistedIds.has(m.id)) {
      setState((prev) => ({
        shortlisted: prev.shortlisted.filter((s) => s.mentor.id !== m.id),
        suggested: prev.suggested.map((x) => x.id === m.id ? { ...x, shortlisted: false } : x),
      }));
      toast(`${m.name} removed from shortlist`);
      // Persist removal: delete shortlist link (do not touch already-assigned).
      const dbId = await resolveMentorDbId(m);
      if (dbId) {
        await supabase
          .from("lmp_mentors")
          .delete()
          .eq("lmp_id", reqId)
          .eq("mentor_id", dbId)
          .eq("status", "shortlisted");
        queryClient.invalidateQueries({ queryKey: ["lmp-mentors-live", reqId] });
      }
    } else {
      setState((prev) => ({
        shortlisted: [...prev.shortlisted, { mentor: m, shortlistedAt: nowStamp() }],
        suggested: prev.suggested.map((x) => x.id === m.id ? { ...x, shortlisted: true } : x),
      }));
      toast.success(`${m.name} shortlisted`);
      // Persist to lmp_mentors so shortlists survive refresh / device switch.
      const dbId = await resolveMentorDbId(m);
      if (dbId) {
        await supabase
          .from("lmp_mentors")
          .upsert(
            { lmp_id: reqId, mentor_id: dbId, mentor_name: m.name, mentor_source: m.source, match_score: m.score ?? null, status: "shortlisted", sync_source: "app" } as any,
            { onConflict: "lmp_id,mentor_id", ignoreDuplicates: false },
          );
        queryClient.invalidateQueries({ queryKey: ["lmp-mentors-live", reqId] });
      }
    }
  };

  const removeShortlist = (id: string) => {
    if (pocReadOnly) return;
    setState((prev) => ({
      shortlisted: prev.shortlisted.filter((s) => s.mentor.id !== id),
      suggested: prev.suggested.map((x) => x.id === id ? { ...x, shortlisted: false } : x),
    }));
    toast("Removed from shortlist");
  };

  // ─── Review mode handlers ───
  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const removeFromReview = (id: string) => {
    if (pocReadOnly) return;
    setState((prev) => ({ suggested: prev.suggested.filter((m) => m.id !== id) }));
  };

  const handleReviewDragEnd = (e: DragEndEvent) => {
    if (pocReadOnly) return;
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setState((prev) => {
      const from = prev.suggested.findIndex((m) => m.id === active.id);
      const to = prev.suggested.findIndex((m) => m.id === over.id);
      if (from < 0 || to < 0) return {};
      return { suggested: arrayMove(prev.suggested, from, to) };
    });
  };

  const confirmTop5 = async () => {
    if (pocReadOnly) return;
    const prev = state;
    const top = prev.suggested.slice(0, 5);
    const stamp = nowStamp();
    const existingIds = new Set(prev.shortlisted.map((s) => s.mentor.id));
    const additions = top
      .filter((m) => !existingIds.has(m.id))
      .map((mentor) => ({ mentor, shortlistedAt: stamp }));
    const topIds = new Set(top.map((m) => m.id));
    toast.success(
      additions.length > 0
        ? `${additions.length} mentor${additions.length === 1 ? "" : "s"} shortlisted`
        : "All top mentors are already shortlisted",
    );
    setState({
      shortlisted: [...prev.shortlisted, ...additions],
      suggested: prev.suggested.map((m) => topIds.has(m.id) ? { ...m, shortlisted: true } : m),
      reviewMode: false,
      subTab: "shortlisted",
    });
    // Persist each addition to lmp_mentors (status='shortlisted').
    for (const add of additions) {
      const dbId = await resolveMentorDbId(add.mentor);
      if (!dbId) continue;
      await supabase
        .from("lmp_mentors")
        .upsert(
          { lmp_id: reqId, mentor_id: dbId, mentor_name: add.mentor.name, mentor_source: add.mentor.source, match_score: (add.mentor as any).score ?? null, status: "shortlisted", sync_source: "app" } as any,
          { onConflict: "lmp_id,mentor_id", ignoreDuplicates: false },
        );
    }
    if (additions.length > 0) {
      queryClient.invalidateQueries({ queryKey: ["lmp-mentors-live", reqId] });
    }
  };

  const confirmAssignment = async (draft: AssignmentDraft) => {
    if (pocReadOnly) return;
    const mentor = assignTarget;
    const round = rounds.find((r) => r.id === draft.roundId);
    if (!mentor || !round) return;
    const picked = draft.candidateIds
      .map((id) => candidates.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => !!c);
    if (picked.length === 0) return;
    const stamp = nowStamp();
    const sessionDateObj = new Date(`${draft.sessionDate}T${draft.sessionTime}`);
    const isGroup = draft.mode === "group" && picked.length > 1;
    const groupId = isGroup ? `G-${Date.now()}` : undefined;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const candidateStudentIds = picked
      .map((c) => (UUID_RE.test(c.studentId ?? "") ? c.studentId! : null))
      .filter((x): x is string => !!x);
    const candidateLmpIds = picked.map((c) => c.id).filter((id): id is string => !!id);
    const notes = isGroup
      ? `${round.name} · ${role} · group ${groupId} · ${picked.map((c) => c.name).join(", ")}`
      : `${round.name} · ${role} · ${picked[0]?.name ?? ""}`;
    const { error: assignmentError } = await (supabase as any).rpc("assign_mentor_session", {
      p_lmp_id: reqId,
      p_mentor: mentor,
      p_candidate_ids: candidateLmpIds,
      p_student_ids: candidateStudentIds,
      p_scheduled_at: sessionDateObj.toISOString(),
      p_notes: notes,
      p_match_score: mentor.score ?? null,
    });
    if (assignmentError) {
      toast.error(`Failed to assign mentor: ${assignmentError.message}`);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["create-session-mentors", reqId] });
    queryClient.invalidateQueries({ queryKey: ["lmp-sessions", reqId] });
    queryClient.invalidateQueries({ queryKey: ["lmp-mentors", reqId] });
    queryClient.invalidateQueries({ queryKey: ["lmp-mentors-live", reqId] });
    queryClient.invalidateQueries({ queryKey: ["db-lmp-candidates", reqId] });
    queryClient.invalidateQueries({ queryKey: ["lmp_candidates_live", reqId] });
    queryClient.invalidateQueries({ queryKey: ["sessions-live", reqId] });
    queryClient.invalidateQueries({ queryKey: ["sessions-live", "all"] });
    queryClient.invalidateQueries({ queryKey: ["mentors-with-lmp-assignment"] });
    queryClient.invalidateQueries({ queryKey: ["db-all-mentors"] });
    queryClient.invalidateQueries({ queryKey: ["mentor-session-formats"] });

    const next: Assignment[] = picked.map((candidate, i) => ({
      id: `as-${Date.now()}-${i}`,
      mentor, candidate, round, role,
      status: "Pending",
      assignedAt: stamp,
    }));
    setState((prev) => ({ assignments: [...next, ...prev.assignments], subTab: "assigned" }));

    const dateLabel =
      sessionDateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
      " · " +
      sessionDateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

    setAssignTarget(null);
    if (draft.mode === "group" && picked.length > 1) {
      toast.success(`${mentor.name} assigned to ${picked.length} candidates · ${dateLabel}`);
    } else {
      toast.success(`${mentor.name} assigned to ${picked[0].name} · ${dateLabel}`);
    }
  };

  const unassign = async (id: string) => {
    if (pocReadOnly) return;
    const target = state.assignments.find((a) => a.id === id);
    setState((prev) => ({ assignments: prev.assignments.filter((a) => a.id !== id) }));
    // Persist deletion: clear mentor_id from the specific candidate row only,
    // so other candidates assigned to the same mentor remain intact.
    if (target?.mentor?.id && target.candidate?.id) {
      const { error: candErr } = await supabase
        .from("lmp_candidates")
        .update({ mentor_id: null } as any)
        .eq("id", target.candidate.id);
      if (candErr) {
        toast.error(`Couldn't update candidate: ${candErr.message}`);
        return;
      }
      // Only remove the lmp_mentors link if no other candidate on this LMP
      // is still pointing at this mentor.
      const { data: stillUsed } = await supabase
        .from("lmp_candidates")
        .select("id")
        .eq("lmp_id", reqId)
        .eq("mentor_id", target.mentor.id)
        .limit(1);
      if (!stillUsed || stillUsed.length === 0) {
        await supabase
          .from("lmp_mentors")
          .delete()
          .eq("lmp_id", reqId)
          .eq("mentor_id", target.mentor.id);
        // lmp_processes.mentor_selected is recomputed automatically by the
        // lmp_mentors_recompute trigger when the row above is deleted.
      }
      queryClient.invalidateQueries({ queryKey: ["lmp-mentors", reqId] });
      queryClient.invalidateQueries({ queryKey: ["create-session-mentors", reqId] });
    }
    toast("Assignment removed");
  };

  const existingAssignedCount = useMemo(
    () => dbLmpMentors.filter((r) => r.status === "assigned").length,
    [dbLmpMentors],
  );

  // Direct align (manual mentor pick) — upserts to lmp_mentors and pushes into shortlisted
  // so the empty state cannot re-appear after refresh.
  const alignMentorDirect = async (mentor: Mentor, replace = false) => {
    if (pocReadOnly) return;
    const { data, error: upErr } = await (supabase as any).rpc("align_mentor_to_lmp", {
      p_lmp_id: reqId,
      p_mentor: mentor,
      p_match_score: mentor.score ?? null,
      p_replace: replace,
    });
    if (upErr) {
      toast.error(`Couldn't align mentor: ${upErr.message}`);
      return;
    }
    const mentorIdForDb = (data as { mentor_id?: string } | null)?.mentor_id;
    if (!mentorIdForDb) return;
    // Push into local state synchronously so the empty state can't re-appear.
    setState((prev) => ({
      shortlisted: prev.shortlisted.some((s) => s.mentor.id === mentor.id)
        ? prev.shortlisted
        : [...prev.shortlisted, { mentor: { ...mentor, id: mentorIdForDb! }, shortlistedAt: nowStamp() }],
      phase: "results",
      subTab: "shortlisted",
    }));

    queryClient.invalidateQueries({ queryKey: ["lmp-mentors", reqId] });
    queryClient.invalidateQueries({ queryKey: ["create-session-mentors", reqId] });
    toast.success(`${mentor.name} aligned to this LMP`);
  };

  // Top-level empty state — first run, nothing in any list AND nothing in DB
  // (no lmp_mentors rows). The DB check prevents the "Run AI Matching" CTA
  // from reappearing on LMPs that already have aligned mentors but whose
  // local store was cleared / never populated on this device.
  if (
    phase === "empty" &&
    suggested.length === 0 &&
    shortlisted.length === 0 &&
    assignments.length === 0 &&
    dbLmpMentors.length === 0
  ) {
    return (
      <>
        <MentorsEmptyState
          onRun={openMatchContext}
          onAlign={() => setAlignOpen(true)}
          readOnly={pocReadOnly}
        />
        <MatchContextModal
          open={matchContextOpen && !pocReadOnly}
          onOpenChange={setMatchContextOpen}
          lmpId={reqId}
          role={role}
          company={company}
          domain={domain || industry || ""}
          activeSources={activeSources}
          onConfirm={runMatching}
          dbMentorCount={allMentors.length}
        />
        <AlignMentorModal
          open={alignOpen && !pocReadOnly}
          onOpenChange={setAlignOpen}
          onAlign={alignMentorDirect}
          role={role}
          company={company}
          existingAssignedCount={existingAssignedCount}
        />
      </>
    );
  }

  return (
    <div className="relative space-y-5" ref={matchingAnchorRef}>
      <AnimatePresence>
        {phase === "matching" && (
          <MatchingOverlay
            steps={matchSteps}
            currentStep={currentStep}
            errors={matchingErrors}
            onDone={onMatchingDone}
            onCancel={cancelMatching}
            externalStatus={externalStatus}
          />
        )}
      </AnimatePresence>

      {/* Top control bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-card border border-n200 shadow-sm p-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-orange-500" />
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-n900">AI Mentor Matching</div>
            <div className="text-[12px] text-n500 truncate">
              {suggested.length > 0
                ? `${suggested.length} suggested · ${shortlistedUniqueCount} shortlisted · ${assignedGroupCount} assigned`
                : "Run matching to populate suggestions"}
              {suggested.length > 0 && state._matchContext?.matchMode && state._matchContext.matchMode !== "balanced" && (
                <span className="ml-1 text-[11px] text-n500">
                  · {state._matchContext.matchMode === "role" ? "🎯 Role-First"
                    : state._matchContext.matchMode === "industry" ? "🏭 Industry-First"
                    : "🏢 Company-First"} mode
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {suggested.length > 0 && (
            <button
              onClick={() => setFiltersOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-n300 bg-card hover:bg-n100 text-n700 text-[13px] font-medium px-3 py-2 transition-colors relative"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
              {activeFilterCount > 0 && (
                <span className="ml-1 rounded-full bg-orange-500 text-white text-[10px] font-semibold px-1.5 py-0.5 tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {suggested.length === 0 ? (
            <button
              onClick={openMatchContext}
              disabled={pocReadOnly}
              title={pocReadOnly ? "Read-only — you are not a POC on this LMP" : undefined}
              className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-500"
            >
              <Sparkles className="h-3.5 w-3.5" /> Find Mentors
            </button>
          ) : (
            <button
              onClick={openMatchContext}
              disabled={pocReadOnly}
              title={pocReadOnly ? "Read-only — you are not a POC on this LMP" : undefined}
              className="inline-flex items-center gap-1.5 rounded-md border border-orange-300 bg-orange-50 hover:bg-orange-100 text-orange-700 text-[13px] font-medium px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Rerun
            </button>
          )}
          <button
            onClick={() => setAlignOpen(true)}
            disabled={pocReadOnly}
            title={pocReadOnly ? "Read-only — you are not a POC on this LMP" : undefined}
            className="inline-flex items-center gap-1.5 rounded-md border border-plum-200 bg-card hover:bg-plum-50 text-plum-700 text-[13px] font-medium px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
          >
            <UserPlus className="h-3.5 w-3.5" /> Align Mentor
          </button>

        </div>
      </div>

      {/* Sub-tabs */}
      <div className="rounded-xl bg-n100 border border-n200 inline-flex p-1">
        {SUB_TABS.map((t) => {
          const active = subTab === t.id;
          const count =
            t.id === "suggested" ? suggested.length :
            t.id === "shortlisted" ? shortlistedUniqueCount :
            assignedGroupCount;
          return (
              <button
              key={t.id}
              onClick={() => setState({ subTab: t.id })}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                active ? "bg-card text-n900 shadow-sm" : "text-n500 hover:text-n800",
              )}
            >
              <t.icon className="h-3.5 w-3.5" aria-hidden /> {t.label}
              <span className={cn(
                "ml-1 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums font-semibold",
                active ? "bg-orange-50 text-orange-600" : "bg-n200 text-n600",
              )}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {subTab === "suggested" && (
        suggested.length === 0 ? (
          <div className="rounded-2xl bg-card border border-n200 shadow-sm">
            <EmptyState
              icon={Search}
              title="No mentors found yet"
              description="No mentors matched this role from the current data. Try uploading more mentor profiles in Data Sources, or broaden the role criteria."
              action={
                <div className="flex flex-wrap items-center gap-2 justify-center">
                  <button
                    onClick={openMatchContext}
                    disabled={pocReadOnly}
                    title={pocReadOnly ? "Read-only — you are not a POC on this LMP" : undefined}
                    className="inline-flex items-center gap-1.5 rounded-md bg-orange-500 hover:bg-orange-600 text-white text-[13px] font-medium px-4 py-2 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-orange-500"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Find Mentors
                  </button>
                  <button
                    onClick={() => setAlignOpen(true)}
                    disabled={pocReadOnly}
                    title={pocReadOnly ? "Read-only — you are not a POC on this LMP" : undefined}
                    className="inline-flex items-center gap-1.5 rounded-md border border-plum-200 bg-card hover:bg-plum-50 text-plum-700 text-[13px] font-medium px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"
                  >
                    <UserPlus className="h-3.5 w-3.5" /> Align Mentor
                  </button>

                </div>
              }
            />
          </div>
        ) : (
          <div className="space-y-4">
            {reviewMode && <ReviewModeBanner />}
            <ExternalStatusBanner status={externalStatus} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-n500">
                <span className="font-medium text-n800 tabular-nums">
                  {reviewMode ? suggested.length : filtered.length}
                </span>{" "}
                mentors {reviewMode ? "in review" : "found"}
                {!reviewMode && filtered.length < suggested.filter((m) => activeSources.includes(m.source)).length && (
                  <> · filtered from {suggested.filter((m) => activeSources.includes(m.source)).length}</>
                )}
              </p>
              {!reviewMode && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFiltersOpen(true)}
                    className={cn(
                      "inline-flex items-center gap-1.5 h-8 rounded-md border bg-card px-2.5 text-[12px] font-medium transition-colors",
                      activeFilterCount > 0
                        ? "border-orange-300 text-orange-700 hover:bg-orange-50"
                        : "border-n300 text-n700 hover:bg-n100",
                    )}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" /> Filter
                    {activeFilterCount > 0 && (
                      <span className="ml-0.5 rounded-full bg-orange-500 text-white text-[10px] font-bold px-1.5 tabular-nums">
                        {activeFilterCount}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-1.5">
                    <ArrowDownUp className="h-3.5 w-3.5 text-n400" />
                    <select
                      value={sort}
                      onChange={(e) => setState({ sort: e.target.value as typeof sort })}
                      className="h-8 rounded-md border border-n300 bg-card px-2 text-[12px] text-n700 focus:outline-none focus:border-orange-400"
                    >
                      <option value="score">Sort: Match Score</option>
                      <option value="rating">Sort: Rating</option>
                      <option value="outcome">Sort: Goal Met %</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {reviewMode ? (
              <>
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleReviewDragEnd}>
                  <SortableContext items={suggested.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                      {suggested.map((m, i) => (
                        <SortableMentorCard
                          key={m.id}
                          mentor={m}
                          index={i}
                          onShortlist={() => toggleShortlist(m)}
                          onView={() => setProfile(m)}
                          onSelect={() => setAssignTarget(m)}
                          onRemove={removeFromReview}
                          readOnly={pocReadOnly}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>


              </>
            ) : filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-n300 bg-card p-12 text-center text-[13px] text-n500">
                No mentors match the current filters.
              </div>
            ) : (
              <div className="space-y-6">
                {(["MU", "ALU", "EXT"] as const).map((src) => {
                  if (!activeSources.includes(src)) return null;
                  const meta = SOURCE_META[src];
                  const sectionAll = suggested.filter(m => m.source === src);
                  const sectionFiltered = filtered.filter(m => m.source === src);
                  return (
                    <div key={src} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-semibold", meta.chip)}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                          {meta.label}
                        </span>
                        <span className="text-[12px] text-n500 tabular-nums">
                          {sectionFiltered.length} of {sectionAll.length}
                          {sectionAll.length > 0 && sectionAll.length < 5 && (
                            <span className="ml-1 text-n400">· only {sectionAll.length} match{sectionAll.length === 1 ? "" : "es"} found</span>
                          )}
                        </span>
                      </div>
                      {sectionFiltered.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-n300 bg-card p-6 text-center text-[12px] text-n500">
                          {sectionAll.length === 0
                            ? `No ${meta.label} matches found`
                            : "No mentors match the current filters in this source"}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {sectionFiltered.map((m, i) => (
                            <MentorCard
                              key={m.id} mentor={m} index={i}
                              onShortlist={() => toggleShortlist(m)}
                              onView={() => setProfile(m)}
                              onSelect={() => setAssignTarget(m)}
                              readOnly={pocReadOnly}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )
      )}

      {subTab === "shortlisted" && (
        <ShortlistedTable
          entries={(() => {
            // Dedupe by identity (name+company+platform). When the same mentor
            // exists locally and from DB hydration with different ids, keep the
            // one with the higher score and most recent shortlistedAt.
            const byKey = new Map<string, typeof shortlisted[number]>();
            for (const e of shortlisted) {
              const m = e.mentor;
              const key = [
                (m.name || "").trim().toLowerCase(),
                (m.company || "").trim().toLowerCase(),
                ((m as any).platform || (m as any).source || "").toString().toLowerCase(),
              ].join("|");
              const prev = byKey.get(key);
              if (!prev) { byKey.set(key, e); continue; }
              const prevScore = Number(prev.mentor.score ?? 0);
              const curScore = Number(m.score ?? 0);
              const prevTs = Date.parse(prev.shortlistedAt) || 0;
              const curTs = Date.parse(e.shortlistedAt) || 0;
              if (curScore > prevScore || (curScore === prevScore && curTs > prevTs)) {
                byKey.set(key, e);
              }
            }
            return Array.from(byKey.values());
          })()}
          onAssign={(m) => setAssignTarget(m)}
          onRemove={removeShortlist}
          readOnly={pocReadOnly}
        />
      )}

      {subTab === "assigned" && (
        <div className="space-y-6">
          <AssignedTable assignments={assignments} onUnassign={unassign} readOnly={pocReadOnly} />
          <div className="rounded-2xl border border-n200 bg-card p-4 shadow-sm">
            <SessionsLiveTab lmpId={reqId} readOnly={pocReadOnly} />
          </div>
        </div>
      )}

      <MentorProfileDrawer
        mentor={profile}
        open={!!profile}
        onOpenChange={(o) => !o && setProfile(null)}
      />

      <AssignMentorModal
        open={!!assignTarget && !pocReadOnly}
        onOpenChange={(o) => !o && setAssignTarget(null)}
        mentor={assignTarget}
        candidates={candidates}
        rounds={rounds}
        role={role}
        onConfirm={confirmAssignment}
      />

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="sm:max-w-[520px] p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b border-n200">
            <DialogTitle className="text-[16px] font-semibold text-n900 flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-orange-500" />
              Filter mentors
            </DialogTitle>
          </DialogHeader>
          <div className="px-2 py-2 max-h-[70vh] overflow-y-auto">
            <MentorFilters value={filters} onChange={(v) => setState({ filters: v })} mentors={suggested} />
          </div>
          <DialogFooter className="px-6 py-3 border-t border-n200 bg-n50/50">
            <button
              onClick={() => setState({ filters: { ...EMPTY_MENTOR_FILTERS, sources: activeSources } })}
              className="h-9 rounded-md border border-n300 bg-card px-4 text-[13px] font-medium text-n700 hover:bg-n100 transition-colors"
            >
              Reset
            </button>
            <button
              onClick={() => setFiltersOpen(false)}
              className="h-9 rounded-md bg-orange-500 hover:bg-orange-600 text-white px-4 text-[13px] font-medium shadow-sm transition-colors"
            >
              Apply
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MatchContextModal
        open={matchContextOpen && !pocReadOnly}
        onOpenChange={setMatchContextOpen}
        lmpId={reqId}
        role={role}
        company={company}
        domain={domain || industry || ""}
        activeSources={activeSources}
        onConfirm={runMatching}
        dbMentorCount={allMentors.length}
      />

      <AlignMentorModal
        open={alignOpen && !pocReadOnly}
        onOpenChange={setAlignOpen}
        onAlign={alignMentorDirect}
        role={role}
        company={company}
        existingAssignedCount={existingAssignedCount}
        assignedIds={new Set([
          ...shortlisted.map((s) => s.mentor.id),
          ...assignments.map((a) => a.mentor.id),
        ])}
      />
    </div>
  );
}

function ExternalStatusBanner({ status }: { status: ExternalStatus }) {
  if (status.phase === "idle") return null;
  if (status.phase === "loading") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2 rounded-md border border-n200 bg-n50 px-3 py-2 text-[12px] text-n700"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin text-orange-500" />
        Fetching external mentors from {status.platforms.join(" · ")}…
      </motion.div>
    );
  }
  if (status.phase === "failed") {
    return (
      <motion.div
        initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-yellow-200 bg-yellow-50 px-3 py-2 text-[12px] text-yellow-800"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          External sources unavailable — showing internal results only
        </div>
      </motion.div>
    );
  }
  // done
  const total = Object.values(status.counts).reduce((s, n) => s + (n || 0), 0);
  const parts = (Object.entries(status.counts) as Array<[ExternalPlatform, number]>)
    .filter(([, n]) => n > 0)
    .map(([p, n]) => `${p} (${n})`);
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2 rounded-md border border-sage-200 bg-sage-50 px-3 py-2 text-[12px] text-sage-800"
    >
      <CheckCircle2 className="h-3.5 w-3.5" />
      {total > 0
        ? <>+{total} external mentors added · {parts.join(" · ")}</>
        : <>No external mentors returned</>}
    </motion.div>
  );
}
