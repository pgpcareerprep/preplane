import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DOMAINS, STATUS_LIST, type Domain, type Process, type ProcessStatus, type ProcessType,
  daysSince, matchesPocName, scopeForRole, scopeProcessesToOperationalPoc,
} from "@/lib/lmpProcessQueries";
import { startOfDay, endOfDay } from "date-fns";

export type DateRange = "7d" | "30d" | "90d" | "All" | "Custom";

const RANGE_DAYS: Record<Exclude<DateRange, "Custom">, number> = {
  "7d": 7, "30d": 30, "90d": 90, All: 100000,
};

export type Role = "admin" | "allocator" | "poc";

export type LmpFilters = {
  range: DateRange;
  domain: string;
  status: string;
  type: string;
  /** poc_profiles.id UUID or "All". Legacy: may also be a name for backward compat. */
  prepPoc: string;
  outreachPoc: string;
  /** Inclusive start date for Custom range. */
  customFrom: Date | null;
  /** Inclusive end date for Custom range. */
  customTo: Date | null;
};

type UseLmpFiltersOptions = {
  role: Role;
  userName: string;
  data?: Process[];
  /**
   * Optional UUID-keyed map of pocId → Set<lmp_process_id>.
   * When provided and prepPoc is a UUID, filter is exact-ID-based (no name matching).
   */
  pocLmpIdsMap?: Map<string, Set<string>>;
  /** Active prep/support links only — used for POC dashboard scoping by poc_profiles.id. */
  activePocLmpIdsMap?: Map<string, Set<string>>;
  /** When set, scope rows to this poc_profiles.id via activePocLmpIdsMap (prep/support only). */
  pocIdScope?: string | null;
};

export function useLmpFilters({
  role,
  userName,
  data,
  pocLmpIdsMap,
  activePocLmpIdsMap,
  pocIdScope,
}: UseLmpFiltersOptions) {
  const [filters, setFilters] = useState<LmpFilters>({
    range: "30d",
    domain: "All",
    status: "All",
    type: "All",
    prepPoc: "All",
    outreachPoc: "All",
    customFrom: null,
    customTo: null,
  });

  const all = useMemo(() => {
    let rows = data ?? [];
    if (pocIdScope) {
      rows = scopeProcessesToOperationalPoc(rows, pocIdScope, userName, activePocLmpIdsMap);
    } else {
      rows = scopeForRole(rows, role, userName);
    }
    return rows;
  }, [data, role, userName, pocIdScope, activePocLmpIdsMap]);

  const filtered = useMemo(() => {
    return all.filter((r) => {
      // ── Date range ──
      if (filters.range === "Custom") {
        if (filters.customFrom && filters.customTo) {
          const created = new Date(r.dateCreated);
          const from = startOfDay(filters.customFrom);
          const to = endOfDay(filters.customTo);
          if (created < from || created > to) return false;
        }
        // If Custom selected but dates not both set, show nothing meaningful
      } else {
        const cutoff = RANGE_DAYS[filters.range as Exclude<DateRange, "Custom">];
        if (daysSince(r.dateCreated) > cutoff) return false;
      }

      if (filters.domain !== "All") {
        const rowDomain = r.filterDomain || r.domain;
        if (rowDomain !== filters.domain) return false;
      }
      if (filters.status !== "All") {
        const rowStatus = r.filterStatus || r.status;
        if (rowStatus !== filters.status && r.status !== filters.status) return false;
      }
      if (filters.type !== "All") {
        const rowType = r.filterType || r.type;
        if (rowType !== filters.type && r.type !== filters.type) return false;
      }

      // ── Prep POC filter (UUID-first, name fallback) ──
      if (filters.prepPoc !== "All") {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.prepPoc);
        if (isUuid && pocLmpIdsMap) {
          const allowedIds = pocLmpIdsMap.get(filters.prepPoc);
          if (!allowedIds || !allowedIds.has(r.processId)) return false;
        } else {
          // Legacy name-based fallback
          if (!matchesPocName(r.prepPoc, filters.prepPoc)) return false;
        }
      }

      if (filters.outreachPoc !== "All" && !matchesPocName(r.outreachPoc, filters.outreachPoc)) return false;
      return true;
    });
  }, [all, filters, pocLmpIdsMap]);

  const set = <K extends keyof LmpFilters>(k: K, v: LmpFilters[K]) =>
    setFilters((prev) => ({ ...prev, [k]: v }));

  return { filters, setFilters, set, filtered, all };
}

/** Helpers to generate options for selects */
export function uniquePocs(rows: Process[]): string[] {
  const s = new Set<string>();
  rows.forEach((r) => { s.add(r.prepPoc); s.add(r.outreachPoc); });
  return Array.from(s).sort();
}

/**
 * Legacy Prep POC options from `poc_profiles` filtered by role_type = "prep_poc".
 * Kept for AllocatorLmpDashboard backward compatibility.
 * New code should use `useEligiblePrepPocs` from `@/lib/hooks/useEligiblePrepPocs`.
 */
export function usePrepPocOptions(): string[] {
  const { data = [] } = useQuery({
    queryKey: ["prep_poc_options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_profiles")
        .select("name")
        .eq("role_type", "prep_poc")
        .eq("status", "active")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? [])
        .map((p: { name: string | null }) => (p.name ?? "").trim())
        .filter(Boolean) as string[];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
  return useMemo(
    () => ["All", ...Array.from(new Set(data)).sort()],
    [data],
  );
}

/** @deprecated Use useDashboardFilterOptions() for admin dashboard filters. */
export const DOMAIN_OPTIONS: ("All" | Domain)[] = ["All", ...DOMAINS];
/** @deprecated Use useDashboardFilterOptions() for admin dashboard filters. */
export const STATUS_OPTIONS: ("All" | ProcessStatus)[] = ["All", ...STATUS_LIST];
/** @deprecated Use useDashboardFilterOptions() for admin dashboard filters. */
export const TYPE_OPTIONS: ("All" | ProcessType)[] = ["All", "Internship", "Full-Time"];
export const RANGE_OPTIONS: DateRange[] = ["7d", "30d", "90d", "All", "Custom"];
