import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DOMAINS, STATUS_LIST, type Domain, type Process, type ProcessStatus, type ProcessType, daysSince, scopeForRole } from "@/lib/lmpProcessQueries";

export type DateRange = "7d" | "30d" | "90d" | "All";

const RANGE_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, "90d": 90, All: 100000 };

/**
 * Tolerant POC name match.
 *
 * The dropdown uses canonical full names from `poc_profiles.name`
 * (e.g. "Shubham Gupta"), but `lmp_processes.prep_poc` stores the value
 * as it appears in the source sheet, often first-name-only ("Shubham").
 * We normalize both sides and accept any token-level overlap.
 *
 * Caveat: two POCs sharing a first name (e.g. "Mansi Bhargwa" / "Mansi Jain")
 * will collide on the row's "Mansi". The proper fix is to filter via
 * `lmp_poc_links` (UUIDs) — tracked separately.
 */
function matchesPocSelection(rowName: string | undefined | null, selected: string): boolean {
  const row = (rowName ?? "").trim().toLowerCase();
  const sel = selected.trim().toLowerCase();
  if (!row || !sel) return false;
  if (row === sel) return true;
  const rowTokens = row.split(/\s+/).filter(Boolean);
  const selTokens = sel.split(/\s+/).filter(Boolean);
  // Match if any token of the row name appears in the selected name (or vice versa).
  return rowTokens.some((t) => selTokens.includes(t));
}

export type Role = "admin" | "allocator" | "poc";

export type LmpFilters = {
  range: DateRange;
  domain: Domain | "All";
  status: ProcessStatus | "All";
  type: ProcessType | "All";
  prepPoc: string;     // "All" or name
  outreachPoc: string; // "All" or name
};

export function useLmpFilters({ role, userName, data }: { role: Role; userName: string; data?: Process[] }) {
  const [filters, setFilters] = useState<LmpFilters>({
    range: "30d",
    domain: "All",
    status: "All",
    type: "All",
    prepPoc: "All",
    outreachPoc: "All",
  });

  const all = useMemo(() => scopeForRole(data ?? [], role, userName), [role, userName, data]);

  const filtered = useMemo(() => {
    const cutoff = RANGE_DAYS[filters.range];
    return all.filter((r) => {
      if (daysSince(r.dateCreated) > cutoff) return false;
      if (filters.domain !== "All" && r.domain !== filters.domain) return false;
      if (filters.status !== "All" && r.status !== filters.status) return false;
      if (filters.type !== "All" && r.type !== filters.type) return false;
      if (filters.prepPoc !== "All" && !matchesPocSelection(r.prepPoc, filters.prepPoc)) return false;
      // Outreach POC filter is hidden in admin UI but still wired; keep tolerant match for parity.
      if (filters.outreachPoc !== "All" && !matchesPocSelection(r.outreachPoc, filters.outreachPoc)) return false;
      return true;
    });
  }, [all, filters]);

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
 * Live Prep POC options sourced from the canonical `poc_profiles` DB.
 * Strictly returns active POCs whose role_type is `prep_poc` — no sheet-derived
 * names, no admins, no garbage values like "NA" / "Outsourced".
 */
export function usePrepPocOptions(): string[] {
  const { data = [] } = useQuery({
    queryKey: ["prep_poc_options"],
    queryFn: async () => {
      // Eligibility is domain-based only — access level (admin / allocator /
      // poc) does NOT exclude anyone. Anyone tagged as a Prep POC and active
      // is allocatable; the allocation engine itself filters out those with
      // no assigned domain.
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
    [data]
  );
}

export const DOMAIN_OPTIONS: ("All" | Domain)[] = ["All", ...DOMAINS];
export const STATUS_OPTIONS: ("All" | ProcessStatus)[] = ["All", ...STATUS_LIST];
export const TYPE_OPTIONS: ("All" | ProcessType)[] = ["All", "Internship", "Full-Time"];
export const RANGE_OPTIONS: DateRange[] = ["7d", "30d", "90d", "All"];
