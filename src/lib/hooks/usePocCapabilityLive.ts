/**
 * Live POC capability adapter — bridges `PocCapability` / `PocConversionStats`
 * shapes to the `poc_profiles` table + `lmp_processes` table.
 */
import { useMemo } from "react";
import { usePocProfilesWithLoad, useLmpProcesses } from "@/lib/hooks/useDbData";
import {
  calculatePocConversion,
  type PocCapability,
  type PocConversionStats,
} from "@/lib/pocCapability";

const ZERO_STATS: PocConversionStats = {
  domainTotal: 0, domainConverted: 0, domainPct: 0,
  crossTotal: 0, crossConverted: 0, crossPct: null,
  overallTotal: 0, overallConverted: 0, overallPct: 0,
  rankingScore: 0,
};

function rowToCapability(r: any): PocCapability {
  const domains: string[] = Array.isArray(r.domain_tags) && r.domain_tags.length
    ? r.domain_tags
    : (r.primary_domain ? [r.primary_domain] : []);
  const initials =
    r.initials ||
    (r.name as string)
      .split(/\s+/)
      .map((w: string) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  const rt = (r.role_type as string) || "prep_poc";
  const pocType: PocCapability["pocType"] =
    r.behavioral_pool_member ? "behavioral"
    : rt === "outreach_poc" ? "outreach"
    : rt === "support_poc" ? "cross"
    : "domain";
  return {
    id: r.id ?? r.poc_id ?? undefined,
    name: r.name,
    initials,
    domains,
    primaryDomains: r.primary_domain ? [r.primary_domain] : [],
    secondaryDomains: domains.filter((d) => d !== r.primary_domain),
    label: r.label || r.primary_domain || "POC",
    color: r.color || "bg-orange-200 text-orange-600",
    pocType,
    currentLoad: Number(r.live_active_lmp_count ?? r.active_load ?? 0),
    maxThreshold: Number(r.max_threshold ?? 8),
    skillTags: Array.isArray(r.skill_tags) ? r.skill_tags : [],
    lastAssignedAt: r.last_assigned_at ?? r.last_activity_at ?? "",
    availability: r.status === "inactive" ? "deactivated" : "available",
    behavioralPoolMember: !!r.behavioral_pool_member,
    companyExperience: Array.isArray(r.company_experience) ? r.company_experience : [],
    recruiterOwnership: Array.isArray(r.recruiter_ownership) ? r.recruiter_ownership : [],
    accessLevel: (r.access_level as PocCapability["accessLevel"]) || "poc",
    email: r.email ?? undefined,
    lmpsCompletedThisCycle: Number(r.converted_count ?? 0),
  };
}

function normalize(s: string) {
  return (s || "").trim().toLowerCase();
}

const ACTIVE_STATUSES = new Set(["ongoing", "on hold", "offer received"]);

export function usePocCapabilityList() {
  const { data, isLoading, error } = usePocProfilesWithLoad();
  const { data: lmps } = useLmpProcesses();

  const liveLoadMap = useMemo<Record<string, number>>(() => {
    const rows = (lmps as any[]) || [];
    const counts: Record<string, number> = {};
    for (const r of rows) {
      if (!ACTIVE_STATUSES.has(String(r.status || "").toLowerCase())) continue;
      if (r.prep_poc) counts[r.prep_poc] = (counts[r.prep_poc] ?? 0) + 1;
    }
    return counts;
  }, [lmps]);

  const list = useMemo<PocCapability[]>(() => {
    if (!data) return [];
    return (data as any[]).map((r) =>
      rowToCapability({ ...r, live_active_lmp_count: liveLoadMap[r.name] ?? r.active_load ?? 0 }),
    );
  }, [data, liveLoadMap]);

  return { list, isLoading, error };
}

export function usePocCapability(name: string | undefined) {
  const { list } = usePocCapabilityList();
  return useMemo(() => {
    if (!name) return undefined;
    const n = normalize(name);
    return list.find(
      (p) =>
        normalize(p.name) === n ||
        (Array.isArray((p as any).aliases) && (p as any).aliases.some((a: string) => normalize(a) === n)),
    );
  }, [list, name]);
}

export function useBehavioralPocs() {
  const { list } = usePocCapabilityList();
  return useMemo(() => list.filter((p) => p.behavioralPoolMember).map((p) => p.name), [list]);
}

export function useOutreachPocs() {
  const { list } = usePocCapabilityList();
  return useMemo(() => list.filter((p) => p.pocType === "outreach").map((p) => p.name), [list]);
}

/**
 * Build a name → PocConversionStats map from live LMP processes.
 * Pulls every LMP (incl. archived) once and reuses the pure
 * `calculatePocConversion` helper for parity with the legacy stubs.
 */
export function usePocConversionMap() {
  const { list } = usePocCapabilityList();
  const { data: lmps, isLoading } = useLmpProcesses({ includeArchived: true });

  const map = useMemo<Record<string, PocConversionStats>>(() => {
    if (!list.length) return {};
    const rows = ((lmps as any[]) || []).map((r) => ({
      status: String(r.status || "").toLowerCase(),
      domain: r.domains?.name || r.domain_raw || "",
      prepPoc: r.prep_poc ? { name: r.prep_poc } : undefined,
      domainPrepPoc: r.prep_poc ? { name: r.prep_poc } : undefined,
      outreachPoc: r.outreach_poc ? { name: r.outreach_poc } : undefined,
    }));
    const out: Record<string, PocConversionStats> = {};
    for (const p of list) {
      out[p.name] = calculatePocConversion(p.name, p.domains, rows);
    }
    return out;
  }, [list, lmps]);

  return { map, isLoading };
}

export function statsFor(map: Record<string, PocConversionStats>, name: string): PocConversionStats {
  return map[name] ?? ZERO_STATS;
}

export { ZERO_STATS };
