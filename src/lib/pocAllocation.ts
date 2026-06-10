/**
 * POC Allocation Engine v7 — Updated Flow
 * ----------------------------------------
 * Step 1  Domain identification        → input.processDomain
 * Step 2  POC pool (primary+secondary) → primaryDomains / secondaryDomains opt-in
 * Step 3  Threshold filter             → currentLoad < maxThreshold
 * Step 4  Fairness boost               → underutilized POCs (load% < 40%) get +15
 * Step 5  Expertise (mand/pref/ind)    → categorized JD skill scoring
 * Step 6  Assign Primary POC           → best fit on weighted score
 * Step 7  Suggest Support POC          → top-N from same scoring, optional
 * Step 8  Cross-domain fallback        → only when no in-domain POC eligible
 * Step 9  Confidence score             → 0-100 per suggestion (+ in/cross + JD penalties)
 * Step 10 Manual overrides             → handled by UI layer
 *
 * Path A: Basic Info (Load × 0.70 + Fairness × 0.30) — no JD
 * Path B: JD-Based (In-Domain: Domain×0.40 + Expertise×0.25 + Load×0.30 + Fairness×0.05;
 *                   Cross-Domain: Expertise×0.45 + Load×0.45 + Fairness×0.10)
 * Path C: Legacy / Admin Mapping (hard filter to mapped POCs for domain)
 *
 * 3 roles: Assigned Prep POC (mandatory), Suggested Support POC (optional), Outreach POC (manual)
 */

import type { PocCapability } from "./pocCapability";

// ─── Public types ──────────────────────────────────────────────────────────

export type AllocationPath = "A" | "B" | "C" | "E";

/** @deprecated Use AllocationPath instead */
export type JdMode = "FULL_SCORING" | "LOAD_ONLY";

export type AllocationTag =
  | "In-Domain"
  | "Cross-Domain"
  | "High Load Override"
  | "Manual Override"
  | "Support POC Suggested"
  | "Support POC Skipped"
  | "Admin Mapped"
  | "Underutilized Boost"
  | "Secondary Domain"
  | "Converted Expert"
  | "Previously Assigned"
  | "Existing Process"
  | "Existing Process · Same Role"
  | "Existing Process · Same Company";

export type HistoricalProcess = {
  company: string;
  role: string;
  prepPoc: string;
  /** Stable poc_profiles UUID — preferred match key. Falls back to name match when absent. */
  prepPocId?: string | null;
  status: string; // "Converted" | "Ongoing" | "Closed" | etc.
};

export type DomainTier = "primary" | "secondary" | "cross";
export type DomainAliasResolver = (raw: string) => string;

export type ScoreBreakdown = {
  domain?: number;
  expertise?: number;
  load: number;
  fairness: number;
  /** Underutilization bonus folded into final (0..15). */
  underutilizedBoost?: number;
  final: number;
};

/** Categorized JD skills. Pass either this OR the legacy flat parsedSkills[]. */
export type ParsedJdSkills = {
  mandatory?: string[];
  preferred?: string[];
  industry?: string[];
};

export type AllocationInput = {
  companyName: string;
  roleTitle: string;
  processDomain: string;
  jdText?: string | null;
  /** Legacy flat skill list — treated as `preferred` if `parsedJdSkills` not provided. */
  parsedSkills?: string[];
  /** Categorized skills (preferred over `parsedSkills` when present). */
  parsedJdSkills?: ParsedJdSkills;
  processId?: string;
  createdAt?: string;
  recruiterName?: string;
  historicalProcesses?: HistoricalProcess[];
  /** Existing LMP processes for this company. Step 0 short-circuits scoring:
   *  first tries company+role match, then falls back to company-only match
   *  (most recent record wins); the original Prep POC is re-used only when
   *  available and below its configured load threshold. */
  existingProcesses?: Array<{
    company: string;
    role: string;
    prepPoc: string;
    prepPocId?: string;
    status: string;
  }>;
};

export type AssignedPoc = {
  /** Stable POC identifier from poc_profiles — preferred over name for DB writes. */
  pocId?: string;
  name: string;
  initials: string;
  color: string;
  matchType: AllocationTag;
  currentLoad: number;
  maxThreshold: number;
  scoreBreakdown: ScoreBreakdown | null;
  /** 0-100 confidence in this suggestion. */
  confidence: number;
  /** Whether the POC opted into this domain as primary, secondary, or neither. */
  domainTier: DomainTier;
  /** History tag if this POC has worked on this company+role before. */
  historicalTag?: "Converted Expert" | "Previously Assigned" | null;
};

export type AllocationMapping = {
  domain_slug: string;
  poc_id: string;
  poc_name: string;
  priority: number;
  is_active: boolean;
};

export type AllocationResult = {
  path: AllocationPath;
  prep: AssignedPoc;
  supportSuggestions: AssignedPoc[];
  tags: AllocationTag[];
  allocationReason: string;
  allocatedAt: string;
  alternatives: Array<{
    poc: AssignedPoc;
    isInDomain: boolean;
  }>;
};

// ─── Path detection ────────────────────────────────────────────────────────

export function detectPath(
  jdText?: string | null,
  domainMappings?: AllocationMapping[],
): AllocationPath {
  if (domainMappings?.some((mapping) => mapping.is_active)) return "C";
  if (typeof jdText === "string" && jdText.trim().length > 0) return "B";
  return "A";
}

// ─── Scoring primitives ────────────────────────────────────────────────────

function loadScore(p: PocCapability): number {
  const max = Math.max(1, p.maxThreshold);
  return ((max - p.currentLoad) / max) * 100;
}

/** Returns true when the POC is sitting well below their cap (less than 40% utilized). */
function isUnderutilized(p: PocCapability): boolean {
  const max = Math.max(1, p.maxThreshold);
  return p.currentLoad / max < 0.4;
}

function fairnessScore(p: PocCapability, pool: PocCapability[]): number {
  const today = Date.now();
  const days = (poc: PocCapability) =>
    Math.max(0, Math.round((today - new Date(poc.lastAssignedAt).getTime()) / 86_400_000));
  const maxDays = Math.max(1, ...pool.map(days));
  const allEqual = pool.every((q) => q.lastAssignedAt === pool[0].lastAssignedAt);
  const base = allEqual ? 50 : Math.round((days(p) / maxDays) * 100);
  // Underutilized POCs get a boost (capped at 100) to favor fairness in close ties.
  const boost = isUnderutilized(p) ? 15 : 0;
  return Math.min(100, base + boost);
}

/** Compose the categorized skill set from input, with back-compat fallback. */
function resolveJdSkills(input: AllocationInput): ParsedJdSkills {
  if (input.parsedJdSkills) return input.parsedJdSkills;
  return { mandatory: [], preferred: input.parsedSkills ?? [], industry: [] };
}

function bucketHitRate(needles: string[] | undefined, tags: string[]): number {
  if (!needles || needles.length === 0) return -1; // sentinel: bucket absent
  const lower = needles.map(s => s.toLowerCase());
  const hits = lower.filter(s => tags.some(t => t.includes(s) || s.includes(t))).length;
  return hits / lower.length;
}

/**
 * Categorized expertise score: mandatory 0.6, preferred 0.25, industry 0.15.
 * Falls back to a flat ratio if only one bucket is provided.
 */
function expertiseScore(p: PocCapability, skills: ParsedJdSkills): number {
  const tags = (p.skillTags ?? []).map(t => t.toLowerCase());
  const m = bucketHitRate(skills.mandatory, tags);
  const pr = bucketHitRate(skills.preferred, tags);
  const ind = bucketHitRate(skills.industry, tags);

  const buckets: Array<{ rate: number; weight: number }> = [];
  if (m >= 0) buckets.push({ rate: m, weight: 0.6 });
  if (pr >= 0) buckets.push({ rate: pr, weight: 0.25 });
  if (ind >= 0) buckets.push({ rate: ind, weight: 0.15 });

  if (buckets.length === 0) return 50; // no JD signal at all
  const totalWeight = buckets.reduce((sum, b) => sum + b.weight, 0);
  const weighted = buckets.reduce((sum, b) => sum + b.rate * b.weight, 0);
  return Math.round((weighted / totalWeight) * 100);
}

function canon(s: string, resolver?: DomainAliasResolver): string {
  return resolver
    ? resolver(s || "")
    : (s || "").trim().toLowerCase();
}

/** Tier detection: primary > secondary > cross. Exported so UI can reuse alias-aware matching. */
export function getDomainTier(
  p: PocCapability,
  processDomain: string,
  resolver?: DomainAliasResolver,
): DomainTier {
  const target = canon(processDomain, resolver);
  const primary = p.primaryDomains ?? p.domains;
  const secondary = p.secondaryDomains ?? [];
  if (primary.some(d => canon(d, resolver) === target)) return "primary";
  if (secondary.some(d => canon(d, resolver) === target)) return "secondary";
  return "cross";
}

/** Domain score: primary 100, secondary 70, cross 0. */
function domainScore(p: PocCapability, processDomain: string, resolver?: DomainAliasResolver): number {
  const tier = getDomainTier(p, processDomain, resolver);
  if (tier === "primary") return 100;
  if (tier === "secondary") return 70;
  return 0;
}

function compareTie(a: PocCapability, b: PocCapability) {
  const t = new Date(a.lastAssignedAt).getTime() - new Date(b.lastAssignedAt).getTime();
  if (t !== 0) return t;
  return a.name.localeCompare(b.name);
}

/**
 * Match a POC name against a historical `prep_poc` value tolerantly.
 *
 * Sheet rows often store first-name-only (e.g. "Mansi") while `poc_profiles.name`
 * is the full canonical name (e.g. "Mansi Bhargwa"). Accept equality OR any
 * token-level overlap between the two normalized name strings.
 *
 * Caveat: two POCs sharing a first name will both match the same shorthand row.
 * Prefer the UUID join via `lmp_poc_links` when `prepPocId` is available.
 */
function normalizeNameStr(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function pocNameMatches(pocName: string, historyName: string): boolean {
  const a = normalizeNameStr(pocName);
  const b = normalizeNameStr(historyName);
  if (!a || !b) return false;
  if (a === b) return true;
  const aTok = a.split(" ").filter(Boolean);
  const bTok = b.split(" ").filter(Boolean);
  return aTok.some((t) => bTok.includes(t)) || bTok.some((t) => aTok.includes(t));
}

function resolveHistoryBonus(
  poc: PocCapability,
  input: AllocationInput,
): { bonus: number; tag: "Converted Expert" | "Previously Assigned" | null } {
  const history = input.historicalProcesses ?? [];
  const company = normalizeNameStr(input.companyName);
  const role = normalizeNameStr(input.roleTitle);

  const matches = history.filter((h) => {
    // Prefer stable UUID match when both sides have the id; fall back to
    // name-based fuzzy match for legacy rows that never linked through
    // `lmp_poc_links`.
    const sameCompanyRole =
      normalizeNameStr(h.company ?? "") === company &&
      normalizeNameStr(h.role ?? "") === role;
    if (!sameCompanyRole) return false;
    if (h.prepPocId && poc.id) return h.prepPocId === poc.id;
    return pocNameMatches(poc.name, h.prepPoc ?? "");
  });

  if (matches.length === 0) return { bonus: 0, tag: null };

  const hasConversion = matches.some(
    (h) => (h.status ?? "").toLowerCase() === "converted",
  );

  if (hasConversion) return { bonus: 30, tag: "Converted Expert" };
  return { bonus: 15, tag: "Previously Assigned" };
}

// ─── Pool helpers ──────────────────────────────────────────────────────────

function activePocs(pool: PocCapability[]) {
  return pool.filter(p => p.availability === "available");
}

function eligible(pool: PocCapability[]) {
  return pool.filter(
    (p) => p.availability === "available" && p.currentLoad < p.maxThreshold,
  );
}

function getPrepPocs(allPocs: PocCapability[]) {
  // Eligibility is domain-based only. Access role (admin / allocator /
  // observer / poc) does NOT affect whether a POC participates in
  // allocation — anyone with at least one assigned domain (primary or
  // supported) is in the pool. Outreach-only and behavioral-pool-only
  // POCs are excluded; they have their own pools elsewhere.
  return allPocs.filter(
    (p) =>
      p.pocType !== "outreach" &&
      p.pocType !== "behavioral" &&
      Array.isArray(p.domains) && p.domains.length > 0,
  );
}

// ─── Score a single POC ────────────────────────────────────────────────────

function scorePoc(
  p: PocCapability,
  processDomain: string,
  skills: ParsedJdSkills,
  pool: PocCapability[],
  path: AllocationPath,
  input: AllocationInput,
  resolver?: DomainAliasResolver,
): { breakdown: ScoreBreakdown } {
  const tier = getDomainTier(p, processDomain, resolver);
  const isInDomain = tier !== "cross";
  const ls = loadScore(p);
  const fs = fairnessScore(p, pool);
  const boost = isUnderutilized(p) ? 15 : 0;
  const { bonus } = resolveHistoryBonus(p, input);

  if (path === "B") {
    const ds = domainScore(p, processDomain, resolver);
    const es = expertiseScore(p, skills);
    const base = isInDomain
      ? Math.round(ds * 0.4 + es * 0.25 + ls * 0.3 + fs * 0.05)
      : Math.round(es * 0.45 + ls * 0.45 + fs * 0.1);
    const final = Math.min(130, base + bonus);
    return { breakdown: { domain: ds, expertise: es, load: ls, fairness: fs, underutilizedBoost: boost, final } };
  }

  // Path A or C: Load × 0.70 + Fairness × 0.30
  const base = Math.round(ls * 0.70 + fs * 0.30);
  const final = Math.min(130, base + bonus);
  return { breakdown: { load: ls, fairness: fs, underutilizedBoost: boost, final } };
}

/** 0-100 confidence: blends final score with cross-domain and missing-JD penalties. */
function computeConfidence(
  breakdown: ScoreBreakdown,
  tier: DomainTier,
  hadJd: boolean,
  historicalTag?: "Converted Expert" | "Previously Assigned" | null,
): number {
  let c = breakdown.final;
  if (tier === "cross") c -= 15;
  else if (tier === "secondary") c -= 5;
  if (!hadJd) c -= 10;
  if (historicalTag === "Converted Expert") c += 10;
  else if (historicalTag === "Previously Assigned") c += 5;
  return Math.max(0, Math.min(100, Math.round(c)));
}

// ─── Path C: Admin-mapped selection ────────────────────────────────────────

function selectFromMappings(
  mappings: AllocationMapping[],
  allPocs: PocCapability[],
  processDomain: string,
  input: AllocationInput,
  resolver?: DomainAliasResolver,
): {
  poc: PocCapability;
  matchType: AllocationTag;
  breakdown: ScoreBreakdown;
  allScored: Array<{ poc: PocCapability; breakdown: ScoreBreakdown; isInDomain: boolean }>;
} | null {
  // Filter to active mappings, sorted by priority
  const activeMappings = mappings
    .filter(m => m.is_active)
    .sort((a, b) => a.priority - b.priority);

  const prepPocs = activePocs(getPrepPocs(allPocs));
  const noSkills: ParsedJdSkills = {};

  for (const mapping of activeMappings) {
    // Prefer poc_id match (stable across renames/aliases); fall back to name only
    // when an older mapping row predates poc_id population.
    const poc =
      (mapping.poc_id && prepPocs.find(p => p.id === mapping.poc_id)) ||
      prepPocs.find(p => p.name === mapping.poc_name);
    if (poc && poc.currentLoad < poc.maxThreshold) {
      const { breakdown } = scorePoc(poc, processDomain, noSkills, prepPocs, "C", input, resolver);
      const allScored = prepPocs.map(p => ({
        poc: p,
        breakdown: scorePoc(p, processDomain, noSkills, prepPocs, "C", input, resolver).breakdown,
        isInDomain: getDomainTier(p, processDomain, resolver) !== "cross",
      }));
      return { poc, matchType: "Admin Mapped", breakdown, allScored };
    }
  }
  return null; // No mapped POC available, fallback to Path A
}

// ─── Prep POC selection ────────────────────────────────────────────────────

function selectPrepPoc(
  input: AllocationInput,
  path: AllocationPath,
  allPocs: PocCapability[],
  domainMappings?: AllocationMapping[],
  resolver?: DomainAliasResolver,
): {
  poc: PocCapability;
  matchType: AllocationTag;
  breakdown: ScoreBreakdown;
  allScored: Array<{ poc: PocCapability; breakdown: ScoreBreakdown; isInDomain: boolean }>;
  effectivePath: AllocationPath;
} {
  const { processDomain } = input;
  const skills = resolveJdSkills(input);

  // Path C attempt
  if (path === "C" && domainMappings && domainMappings.length > 0) {
    const mapped = selectFromMappings(domainMappings, allPocs, processDomain, input, resolver);
    if (mapped) {
      return { ...mapped, effectivePath: "C" };
    }
    // Fallback to Path A if no mapped POC available
  }

  const prepPocs = activePocs(getPrepPocs(allPocs));
  const eligiblePocs = eligible(prepPocs);

  // Prefer eligible in-domain POCs. If none are eligible, widen to other
  // eligible POCs as the documented cross-domain fallback. Never bypass load
  // thresholds during automatic allocation.
  const inDomainEligible = eligiblePocs.filter(p => getDomainTier(p, processDomain, resolver) !== "cross");
  const pool = inDomainEligible.length > 0 ? inDomainEligible : eligiblePocs;

  if (pool.length === 0) throw new Error("NO_AVAILABLE_POCS");

  const effectivePath = path === "C" ? "A" : path; // C fallback → A

  const allScored = pool.map(p => {
    const isInDomain = getDomainTier(p, processDomain, resolver) !== "cross";
    const { breakdown } = scorePoc(p, processDomain, skills, pool, effectivePath, input, resolver);
    return { poc: p, breakdown, isInDomain };
  });

  // Sort: primary > secondary, then by score
  allScored.sort((a, b) => {
    const ta = getDomainTier(a.poc, processDomain, resolver);
    const tb = getDomainTier(b.poc, processDomain, resolver);
    const tierRank = (t: DomainTier) => (t === "primary" ? 0 : t === "secondary" ? 1 : 2);
    const tr = tierRank(ta) - tierRank(tb);
    if (tr !== 0) return tr;
    return b.breakdown.final - a.breakdown.final || compareTie(a.poc, b.poc);
  });

  const top = allScored[0];
  const topTier = getDomainTier(top.poc, processDomain, resolver);
  const matchType: AllocationTag =
    topTier === "primary" ? "In-Domain"
    : topTier === "secondary" ? "Secondary Domain"
    : "Cross-Domain";

  return { poc: top.poc, matchType, breakdown: top.breakdown, allScored, effectivePath };
}

// ─── Support POC suggestion ────────────────────────────────────────────────

function suggestSupportPocs(
  input: AllocationInput,
  path: AllocationPath,
  prepPoc: PocCapability,
  allPocs: PocCapability[],
  resolver?: DomainAliasResolver,
): Array<{ poc: PocCapability; breakdown: ScoreBreakdown }> {
  const prepPocs = activePocs(getPrepPocs(allPocs)).filter(p => p.name !== prepPoc.name);
  const inDomain = prepPocs.filter(p => getDomainTier(p, input.processDomain, resolver) !== "cross");
  const eligiblePocs = eligible(inDomain);
  const pool = eligiblePocs.length > 0 ? eligiblePocs : inDomain;

  if (pool.length === 0) return [];

  const skills = resolveJdSkills(input);
  const scored = pool.map(p => {
    const { breakdown } = scorePoc(p, input.processDomain, skills, pool, path === "C" ? "A" : path, input, resolver);
    return { poc: p, breakdown };
  });

  scored.sort((a, b) => b.breakdown.final - a.breakdown.final || compareTie(a.poc, b.poc));
  return scored.slice(0, 3);
}

// ─── Public allocator ──────────────────────────────────────────────────────

export function allocatePoc(
  input: AllocationInput,
  pocPool?: PocCapability[],
  domainMappings?: AllocationMapping[],
  resolver?: DomainAliasResolver,
): AllocationResult {
  if (!input.processDomain) throw new Error("MISSING_DOMAIN");

  const allPocs = pocPool ?? [];
  if (allPocs.length === 0) throw new Error("NO_POCS_LOADED");

  // Step 0 — Existing Process Check (before scoring / path detection).
  // Tier 1: same company + role → reuse that process's Prep POC.
  // Tier 2: same company (any role) → reuse the most recent process's Prep POC.
  // In both cases, the original Prep POC is re-assigned regardless of load.
  const existing = input.existingProcesses ?? [];
  if (existing.length > 0) {
    const cmp = normalizeNameStr(input.companyName);
    const rl = normalizeNameStr(input.roleTitle);

    const resolvePoc = (e: { prepPocId?: string; prepPoc?: string }) => {
      if (e.prepPocId) return allPocs.find((p) => p.id === e.prepPocId) ?? null;
      const matches = allPocs.filter((p) => pocNameMatches(p.name, e.prepPoc ?? ""));
      return matches.length === 1 ? matches[0] : null;
    };

    const canReuse = (poc: PocCapability) =>
      poc.availability === "available" &&
      poc.currentLoad < poc.maxThreshold;

    const buildResult = (
      matchedPoc: PocCapability,
      subTag: "Existing Process · Same Role" | "Existing Process · Same Company",
      reason: string,
    ): AllocationResult => {
      const tier = getDomainTier(matchedPoc, input.processDomain, resolver);
      const prep: AssignedPoc = {
        pocId: matchedPoc.id,
        name: matchedPoc.name,
        initials: matchedPoc.initials,
        color: matchedPoc.color,
        matchType: "Existing Process",
        currentLoad: matchedPoc.currentLoad,
        maxThreshold: matchedPoc.maxThreshold,
        scoreBreakdown: null,
        confidence: 100,
        domainTier: tier,
        historicalTag: null,
      };
      return {
        path: "E",
        prep,
        supportSuggestions: [],
        tags: ["Existing Process", subTag],
        allocationReason: reason,
        allocatedAt: new Date().toISOString(),
        alternatives: [],
      };
    };

    // Tier 1 — company + role
    const sameRoleMatches = existing.filter(
      (e) =>
        normalizeNameStr(e.company ?? "") === cmp &&
        normalizeNameStr(e.role ?? "") === rl,
    );
    for (const m of sameRoleMatches) {
      const poc = resolvePoc(m);
      if (poc && canReuse(poc)) {
        return buildResult(
          poc,
          "Existing Process · Same Role",
          `Same company & role previously handled — ${poc.name} previously handled ${input.companyName} / ${input.roleTitle} and remains within capacity.`,
        );
      }
    }

    // Tier 2 — company only (most recent wins; query orders by created_at desc).
    // Skip terminal-status rows and skip when the prior POC is out-of-domain for
    // the new request — those should fall through to normal scoring instead of
    // dragging an unrelated POC into a different domain.
    const TERMINAL = new Set(["closed", "not converted", "dormant", "converted na", "on hold"]);
    const sameCompanyMatches = existing.filter(
      (e) =>
        normalizeNameStr(e.company ?? "") === cmp &&
        !TERMINAL.has((e.status ?? "").trim().toLowerCase()),
    );
    for (const m of sameCompanyMatches) {
      const poc = resolvePoc(m);
      if (!poc || !canReuse(poc)) continue;
      if (getDomainTier(poc, input.processDomain, resolver) === "cross") continue;
      const prevRole = m.role?.trim() || "—";
      return buildResult(
        poc,
        "Existing Process · Same Company",
        `Same company previously handled — ${poc.name} previously handled ${input.companyName} (prior role: ${prevRole}) and remains within capacity.`,
      );
    }
  }

  const path = detectPath(input.jdText, domainMappings);
  const prepResult = selectPrepPoc(input, path, allPocs, domainMappings, resolver);
  const supportResults = suggestSupportPocs(input, prepResult.effectivePath, prepResult.poc, allPocs, resolver);

  const tags: AllocationTag[] = [];
  tags.push(prepResult.matchType);
  if (supportResults.length > 0) tags.push("Support POC Suggested");
  const { tag: historyTag } = resolveHistoryBonus(prepResult.poc, input);
  if (historyTag) tags.push(historyTag);

  const hadJd = typeof input.jdText === "string" && input.jdText.trim().length > 0;

  const prepTier = getDomainTier(prepResult.poc, input.processDomain, resolver);
  const prepHistTag = resolveHistoryBonus(prepResult.poc, input).tag;
  const prepPoc = toAssigned(prepResult.poc, prepResult.matchType, prepResult.breakdown, prepTier, hadJd, prepHistTag);
  const supportSuggestionsList = supportResults.map(s => {
    const tier = getDomainTier(s.poc, input.processDomain, resolver);
    const histTag = resolveHistoryBonus(s.poc, input).tag;
    return toAssigned(s.poc, "Support POC Suggested", s.breakdown, tier, hadJd, histTag);
  });

  // Note: surface "Underutilized Boost" only when it likely flipped the winner
  // (i.e. the chosen POC is underutilized AND there's a non-underutilized
  // candidate in the same tier whose final score is within 10 points).
  const winnerTier = prepTier;
  const winnerUnder = isUnderutilized(prepResult.poc);
  const closeRival = prepResult.allScored.some(s =>
    s.poc.name !== prepResult.poc.name &&
    getDomainTier(s.poc, input.processDomain, resolver) === winnerTier &&
    !isUnderutilized(s.poc) &&
    Math.abs(s.breakdown.final - prepResult.breakdown.final) <= 10,
  );
  if (winnerUnder && closeRival) tags.push("Underutilized Boost");

  // Build alternatives
  const chosenNames = new Set([prepResult.poc.name, ...supportResults.map(s => s.poc.name)]);
  const alternatives = prepResult.allScored
    .filter(s => !chosenNames.has(s.poc.name))
    .slice(0, 5)
    .map(s => {
      const tier = getDomainTier(s.poc, input.processDomain, resolver);
      const altTag: AllocationTag =
        tier === "primary" ? "In-Domain"
        : tier === "secondary" ? "Secondary Domain"
        : "Cross-Domain";
      const histTag = resolveHistoryBonus(s.poc, input).tag;
      return {
        poc: toAssigned(s.poc, altTag, s.breakdown, tier, hadJd, histTag),
        isInDomain: s.isInDomain,
      };
    });

  const pathLabels: Record<AllocationPath, string> = {
    A: "basic info scoring (Load × 0.70 + Fairness × 0.30)",
    B: "JD-aware scoring (Domain + Expertise + Load + Fairness)",
    C: "admin-mapped allocation",
    E: "existing process re-assignment",
  };

  let reason = `${input.processDomain} domain — Path ${prepResult.effectivePath}: ${pathLabels[prepResult.effectivePath]}. ${prepResult.poc.name} is the Assigned Prep POC.`;
  if (supportResults.length > 0) {
    reason += ` ${supportResults[0].poc.name} is the Suggested Support POC.`;
  }

  return {
    path: prepResult.effectivePath,
    prep: prepPoc,
    supportSuggestions: supportSuggestionsList,
    tags,
    allocationReason: reason,
    allocatedAt: new Date().toISOString(),
    alternatives,
  };
}

function toAssigned(
  p: PocCapability,
  matchType: AllocationTag,
  breakdown: ScoreBreakdown | null,
  tier: DomainTier = "cross",
  hadJd = false,
  historicalTag: "Converted Expert" | "Previously Assigned" | null = null,
): AssignedPoc {
  return {
    pocId: p.id,
    name: p.name,
    initials: p.initials,
    color: p.color,
    matchType,
    currentLoad: p.currentLoad,
    maxThreshold: p.maxThreshold,
    scoreBreakdown: breakdown,
    confidence: breakdown ? computeConfidence(breakdown, tier, hadJd, historicalTag) : 0,
    domainTier: tier,
    historicalTag,
  };
}

/** Public helper for callers building manual-override AssignedPoc shells. */
export function buildManualAssignment(
  p: PocCapability,
  processDomain: string,
  resolver?: DomainAliasResolver,
): AssignedPoc {
  const tier = getDomainTier(p, processDomain, resolver);
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

// ─── Tag UI helpers ────────────────────────────────────────────────────────

export const TAG_STYLES: Record<AllocationTag, string> = {
  "In-Domain":              "bg-sage-50 text-sage-700 border-sage-200",
  "Cross-Domain":           "bg-coral-50 text-coral-700 border-coral-200",
  "High Load Override":     "bg-yellow-50 text-yellow-700 border-yellow-300",
  "Manual Override":        "bg-sky-400/10 text-sky-500 border-sky-400/30",
  "Support POC Suggested":  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "Support POC Skipped":    "bg-n100 text-n600 border-n200",
  "Admin Mapped":           "bg-purple-50 text-purple-700 border-purple-200",
  "Underutilized Boost":    "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Secondary Domain":       "bg-amber-50 text-amber-700 border-amber-200",
  "Converted Expert":       "bg-yellow-50 text-yellow-700 border-yellow-300",
  "Previously Assigned":    "bg-sky-50 text-sky-700 border-sky-200",
  "Existing Process":               "bg-violet-50 text-violet-700 border-violet-200",
  "Existing Process · Same Role":   "bg-violet-50 text-violet-700 border-violet-200",
  "Existing Process · Same Company":"bg-violet-50 text-violet-700 border-violet-200",
};

// ─── Path label helpers ────────────────────────────────────────────────────

export const PATH_LABELS: Record<AllocationPath, string> = {
  A: "Path A · Basic Info",
  B: "Path B · JD Scoring",
  C: "Path C · Admin Mapped",
  E: "Path E · Existing Process",
};

export const PATH_DESCRIPTIONS: Record<AllocationPath, string> = {
  A: "Load × 0.70 + Fairness × 0.30 (no JD signal)",
  B: "In-domain: Domain×0.40 + Expertise×0.25 + Load×0.30 + Fairness×0.05 · Cross: Expertise×0.45 + Load×0.45 + Fairness×0.10",
  C: "Hard filter to admin-mapped POCs, picked by priority then load",
  E: "Same company+role previously handled — re-use original Prep POC when available and within capacity",
};
