import { resolveDomainName } from "@/lib/domainAlias";
import {
  getCandidateIdentityKey,
  getStudentIdentityKey,
  type DomainPreferenceRow,
  type PocMovementRow,
} from "@/lib/studentAnalytics";
import type { LmpRecord } from "@/lib/lmpTypes";

export type StudentRosterEntry = {
  id: string | null;
  email: string | null;
  name: string;
  cohort: string;
  primaryDomain: string;
  secondaryDomain: string;
  rollNo: string;
  studentCode: string;
  phone: string;
  lmpCount: number;
  activeLmpCount: number;
  placementStatus: string | null;
};

export type CandidateEntry = {
  id: string;
  lmpId: string;
  studentId: string | null;
  email: string | null;
  studentName: string;
  rollNo: string | null;
  pipelineStage: string | null;
  offerStatus: string | null;
  status: string | null;
  r1Status: string | null;
  r2Status: string | null;
  r3Status: string | null;
};

export type DomainPreferenceRowWithDrill = DomainPreferenceRow & {
  drillPrimaryInterested: StudentRosterEntry[];
  drillPrimaryConverted: StudentRosterEntry[];
  drillSecondaryInterested: StudentRosterEntry[];
  drillSecondaryConverted: StudentRosterEntry[];
  drillInProcess: StudentRosterEntry[];
  drillTotalConverted: StudentRosterEntry[];
};

const TERM = new Set(["converted", "not-converted", "other-reasons", "closed", "dormant", "converted-na"]);
const CONV_STAGES = new Set(["converted", "offer", "final", "accepted", "placed"]);

function normName(n: string) {
  return n.replace(/\s+/g, " ").trim().toLowerCase();
}

function parseTxt(raw: string | null | undefined) {
  return (raw ?? "").split(/[,/;\n]+/).map(normName).filter((n) => n && n !== "-" && n !== "na" && n !== "nil" && n !== "none");
}

export function computeDomainPreferencePlacementData(
  filteredRecords: LmpRecord[],
  studentRoster: StudentRosterEntry[],
  candidatesByLmp: Map<string, CandidateEntry[]>,
  domainRows: unknown[],
): DomainPreferenceRowWithDrill[] {
  const localCanonical = (domainRows as any[]).map((d: any) => ({
    id: d?.id ?? d?.slug ?? "",
    name: d?.name ?? "",
    slug: d?.slug ?? "",
    aliases: Array.isArray(d?.aliases) ? d.aliases : [],
  })).filter((d: any) => d.name);

  const orderedDomains = localCanonical
    .map((d: any) => d.name as string)
    .filter((n: string) => n.toLowerCase() !== "unmapped");

  const rosterByKey = new Map<string, StudentRosterEntry>();
  studentRoster.forEach((s) => rosterByKey.set(getStudentIdentityKey(s), s));

  const primaryByDomain = new Map<string, Set<string>>();
  const secondaryByDomain = new Map<string, Set<string>>();
  studentRoster.forEach((s) => {
    const key = getStudentIdentityKey(s);
    const pd = resolveDomainName(s.primaryDomain, localCanonical);
    const sd = resolveDomainName(s.secondaryDomain, localCanonical);
    if (pd && pd.toLowerCase() !== "unmapped") {
      if (!primaryByDomain.has(pd)) primaryByDomain.set(pd, new Set());
      primaryByDomain.get(pd)!.add(key);
    }
    if (sd && sd.toLowerCase() !== "unmapped" && sd !== pd) {
      if (!secondaryByDomain.has(sd)) secondaryByDomain.set(sd, new Set());
      secondaryByDomain.get(sd)!.add(key);
    }
  });

  const activeCandsByDomain = new Map<string, Set<string>>();
  const convertedCandsByDomain = new Map<string, Set<string>>();

  filteredRecords.forEach((r) => {
    const domain = resolveDomainName(r.domain, localCanonical);
    if (!domain || domain.toLowerCase() === "unmapped") return;
    const cands = candidatesByLmp.get(r.id) ?? [];
    if (!activeCandsByDomain.has(domain)) activeCandsByDomain.set(domain, new Set());
    if (!convertedCandsByDomain.has(domain)) convertedCandsByDomain.set(domain, new Set());
    const actSet = activeCandsByDomain.get(domain)!;
    const convSet = convertedCandsByDomain.get(domain)!;

    if (cands.length > 0) {
      cands.forEach((c) => {
        const key = getCandidateIdentityKey(c);
        const stage = (c.pipelineStage ?? "").toLowerCase();
        const offer = (c.offerStatus ?? "").toLowerCase();
        const isConv = CONV_STAGES.has(stage) || offer === "accepted";
        if (!TERM.has(r.status)) actSet.add(key);
        if (isConv) convSet.add(key);
      });
    } else {
      if (!TERM.has(r.status)) {
        [(r as any).r1Shortlisted, (r as any).r2Shortlisted, (r as any).r3Shortlisted]
          .forEach((f) => parseTxt(f).forEach((n) => actSet.add(`name:${n}`)));
      }
      [(r as any).convertNames, (r as any).finalConvert, (r as any).finalConvertedNames]
        .forEach((f) => parseTxt(f).forEach((n) => convSet.add(`name:${n}`)));
    }
  });

  const rows: DomainPreferenceRowWithDrill[] = orderedDomains.map((domain: string) => {
    const primary = primaryByDomain.get(domain) ?? new Set<string>();
    const secondary = secondaryByDomain.get(domain) ?? new Set<string>();
    const allInterested = new Set([...primary, ...secondary]);
    const activeCands = activeCandsByDomain.get(domain) ?? new Set<string>();
    const convCands = convertedCandsByDomain.get(domain) ?? new Set<string>();

    const inProcessKeys = new Set<string>();
    allInterested.forEach((k) => { if (activeCands.has(k)) inProcessKeys.add(k); });

    const primaryConvKeys = new Set<string>();
    primary.forEach((k) => { if (convCands.has(k)) primaryConvKeys.add(k); });

    const secondaryConvKeys = new Set<string>();
    secondary.forEach((k) => { if (convCands.has(k)) secondaryConvKeys.add(k); });

    const totalConvKeys = new Set([...primaryConvKeys, ...secondaryConvKeys]);

    const toRows = (keys: Set<string>) =>
      Array.from(keys).map((k) => rosterByKey.get(k)).filter((s): s is StudentRosterEntry => !!s);

    return {
      domain,
      primaryInterested: primary.size,
      primaryConverted: primaryConvKeys.size,
      primaryFulfilledPct: primary.size > 0 ? (primaryConvKeys.size / primary.size) * 100 : null,
      secondaryInterested: secondary.size,
      secondaryConverted: secondaryConvKeys.size,
      secondaryFulfilledPct: secondary.size > 0 ? (secondaryConvKeys.size / secondary.size) * 100 : null,
      totalUniqueInterested: allInterested.size,
      currentlyInDomainProcess: inProcessKeys.size,
      totalConverted: totalConvKeys.size,
      interestToPlacementPct: allInterested.size > 0 ? (totalConvKeys.size / allInterested.size) * 100 : null,
      drillPrimaryInterested: toRows(primary),
      drillPrimaryConverted: toRows(primaryConvKeys),
      drillSecondaryInterested: toRows(secondary),
      drillSecondaryConverted: toRows(secondaryConvKeys),
      drillInProcess: toRows(inProcessKeys),
      drillTotalConverted: toRows(totalConvKeys),
    };
  });

  return rows.filter(
    (r) => r.primaryInterested > 0 || r.secondaryInterested > 0 || r.currentlyInDomainProcess > 0 || r.totalConverted > 0,
  );
}

export function computePocLensData(
  filteredRecords: LmpRecord[],
  candidatesByLmp: Map<string, CandidateEntry[]>,
): PocMovementRow[] {
  type Entry = {
    pocName: string;
    role: string;
    activeLmps: number;
    uniqueStudents: Set<string>;
    r1: Set<string>;
    r2: Set<string>;
    r3: Set<string>;
    offers: Set<string>;
    converted: Set<string>;
  };
  const byPocRole = new Map<string, Entry>();

  const getEntry = (name: string, role: string): Entry => {
    const key = `${role}::${name}`;
    if (!byPocRole.has(key)) {
      byPocRole.set(key, {
        pocName: name, role, activeLmps: 0, uniqueStudents: new Set(), r1: new Set(), r2: new Set(), r3: new Set(), offers: new Set(), converted: new Set(),
      });
    }
    return byPocRole.get(key)!;
  };

  filteredRecords.forEach((r) => {
    const isActive = !TERM.has(r.status);
    const cands = candidatesByLmp.get(r.id) ?? [];
    const prepName = r.prepPoc?.name ?? "";
    const supportName = r.supportPoc?.name ?? "";
    const pocRoles: Array<{ name: string; role: string }> = [];
    if (prepName) pocRoles.push({ name: prepName, role: "Prep" });
    if (supportName) pocRoles.push({ name: supportName, role: "Support" });

    pocRoles.forEach(({ name, role }) => {
      const e = getEntry(name, role);
      if (isActive) e.activeLmps += 1;

      if (cands.length > 0) {
        cands.forEach((c) => {
          const key = getCandidateIdentityKey(c);
          const stage = (c.pipelineStage ?? "").toLowerCase();
          const offer = (c.offerStatus ?? "").toLowerCase();
          e.uniqueStudents.add(key);
          if (c.r1Status) e.r1.add(key);
          if (c.r2Status) e.r2.add(key);
          if (c.r3Status) e.r3.add(key);
          if (stage === "offer" || stage === "final" || offer === "accepted" || offer === "pending") e.offers.add(key);
          if (CONV_STAGES.has(stage) || offer === "accepted") e.converted.add(key);
        });
      } else {
        parseTxt((r as any).r1Shortlisted).forEach((n) => { const k = `name:${n}`; e.uniqueStudents.add(k); e.r1.add(k); });
        parseTxt((r as any).r2Shortlisted).forEach((n) => { const k = `name:${n}`; e.uniqueStudents.add(k); e.r2.add(k); });
        parseTxt((r as any).r3Shortlisted).forEach((n) => { const k = `name:${n}`; e.uniqueStudents.add(k); e.r3.add(k); });
        parseTxt((r as any).finalConvert).forEach((n) => { const k = `name:${n}`; e.uniqueStudents.add(k); e.offers.add(k); });
        [(r as any).convertNames, (r as any).finalConvert, (r as any).finalConvertedNames]
          .forEach((f) => parseTxt(f).forEach((n) => { const k = `name:${n}`; e.uniqueStudents.add(k); e.converted.add(k); }));
      }
    });
  });

  return Array.from(byPocRole.values())
    .filter((e) => e.activeLmps > 0 || e.converted.size > 0)
    .map((e) => ({
      pocKey: `${e.role}::${e.pocName}`,
      pocName: e.pocName,
      role: e.role,
      activeLmps: e.activeLmps,
      uniqueStudents: e.uniqueStudents.size,
      r1: e.r1.size,
      r2: e.r2.size,
      r3: e.r3.size,
      offers: e.offers.size,
      converted: e.converted.size,
      convPct: e.uniqueStudents.size > 0 ? (e.converted.size / e.uniqueStudents.size) * 100 : null,
    }))
    .sort((a, b) => {
      const roleOrder: Record<string, number> = { Prep: 0, Outreach: 1, Support: 2 };
      const rOrd = (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3);
      if (rOrd !== 0) return rOrd;
      return b.activeLmps - a.activeLmps || b.converted - a.converted;
    });
}
