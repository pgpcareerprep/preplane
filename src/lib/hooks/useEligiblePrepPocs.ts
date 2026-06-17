import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";

export type EligiblePrepPoc = {
  pocId: string;
  name: string;
  email: string | null;
  accessLevel: string;
  primaryDomain: string | null;
  domains: string[];
  /** All linked LMP IDs (current + historical prep/support). Empty for zero-LMP POCs. */
  assignedLmpIds: string[];
  /** May be 0 for domain-assigned POCs with no current/historical LMPs. */
  assignedLmpCount: number;
};

/**
 * Canonical eligible Prep POC directory.
 *
 * Eligibility — a POC appears when ALL of the following hold:
 *   1. poc_profiles.status = "active"
 *   2. NOT outreach-only (role_type ≠ "outreach_poc")
 *   3. AT LEAST ONE of:
 *      a. Has at least one valid domain (primary_domain OR non-empty domain_tags entry)
 *      b. Has any current or historical lmp_poc_links record with role "prep" or "support"
 *
 * Critically, assignedLmpCount may be 0 — a domain-assigned POC with no LMP history
 * is still shown in the dropdown. Selecting them produces an empty filtered result.
 *
 * Returns:
 * - `pocs`               — sorted eligible POC list
 * - `pocLmpIdsMap`       — Map<poc_profiles.id → Set<lmp_processes.id>> (all links, eligibility)
 * - `activePocLmpIdsMap` — Map<poc_profiles.id → Set<lmp_processes.id>> (active links only, for filtering)
 * - `selectOptions`      — [{ value: "All", label: "All Prep POCs" }, ...pocs]
 */
export function useEligiblePrepPocs(): {
  pocs: EligiblePrepPoc[];
  /** All prep/support links (current + historical). Used for eligibility. */
  pocLmpIdsMap: Map<string, Set<string>>;
  /** Active prep/support links only (is_active = true). Used for board filtering. */
  activePocLmpIdsMap: Map<string, Set<string>>;
  selectOptions: { value: string; label: string }[];
  isLoading: boolean;
} {
  useRealtimeInvalidate("poc_profiles" as never, [["eligible_prep_pocs"]]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["eligible_prep_pocs"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["eligible_prep_pocs"],
    queryFn: async () => {
      const [pocsRes, allLinksRes, activeLinksRes] = await Promise.all([
        supabase
          .from("poc_profiles")
          .select("id, name, email, access_level, role_type, primary_domain, domain_tags, status")
          .eq("status", "active"),
        // ALL prep/support links — current AND historical (for eligibility / dropdown).
        supabase
          .from("lmp_poc_links")
          .select("poc_id, lmp_id, role")
          .in("role", ["prep", "support"]),
        // ACTIVE prep/support links only — for board filtering.
        supabase
          .from("lmp_poc_links")
          .select("poc_id, lmp_id, role")
          .in("role", ["prep", "support"])
          .eq("is_active", true),
      ]);

      if (pocsRes.error) throw new Error(pocsRes.error.message);
      if (allLinksRes.error) throw new Error(allLinksRes.error.message);
      if (activeLinksRes.error) throw new Error(activeLinksRes.error.message);

      // Build pocId → Set<lmpId> from ALL prep/support links (current + historical).
      const linksByPoc = new Map<string, Set<string>>();
      for (const l of allLinksRes.data ?? []) {
        if (!l.poc_id || !l.lmp_id) continue;
        const s = linksByPoc.get(l.poc_id) ?? new Set<string>();
        s.add(l.lmp_id);
        linksByPoc.set(l.poc_id, s);
      }

      // Build pocId → Set<lmpId> from ACTIVE prep/support links only.
      const activeLinksByPoc = new Map<string, Set<string>>();
      for (const l of activeLinksRes.data ?? []) {
        if (!l.poc_id || !l.lmp_id) continue;
        const s = activeLinksByPoc.get(l.poc_id) ?? new Set<string>();
        s.add(l.lmp_id);
        activeLinksByPoc.set(l.poc_id, s);
      }

      const eligible: EligiblePrepPoc[] = [];

      for (const p of pocsRes.data ?? []) {
        // Exclude outreach-only POCs (role_type = "outreach_poc").
        const roleType = (p.role_type as string | null) ?? "prep_poc";
        if (roleType === "outreach_poc") continue;

        const primaryDomain = (p.primary_domain ?? "").trim() || null;
        const domainTags: string[] = Array.isArray(p.domain_tags)
          ? (p.domain_tags as string[]).filter((t) => t && t.trim())
          : [];
        const hasDomain = !!primaryDomain || domainTags.length > 0;

        // Any current or historical prep/support link qualifies as history.
        const hasPrepOrSupportHistory = linksByPoc.has(p.id as string);

        // Gate: must have a domain OR any prep/support history.
        if (!hasDomain && !hasPrepOrSupportHistory) continue;

        const domains: string[] = [
          ...(primaryDomain ? [primaryDomain] : []),
          ...domainTags,
        ];

        const assignedSet = linksByPoc.get(p.id as string);
        const assignedLmpIds = assignedSet ? Array.from(assignedSet) : [];

        eligible.push({
          pocId: p.id as string,
          name: ((p.name as string | null) ?? "").trim(),
          email: (p.email as string | null) ?? null,
          accessLevel: (p.access_level as string | null) ?? "poc",
          primaryDomain,
          domains,
          assignedLmpIds,
          assignedLmpCount: assignedLmpIds.length,
        });
      }

      // Deduplicate by pocId (poc_profiles.id is the canonical key).
      const seen = new Set<string>();
      const deduped = eligible.filter((p) => {
        if (seen.has(p.pocId)) return false;
        seen.add(p.pocId);
        return true;
      });

      deduped.sort((a, b) => a.name.localeCompare(b.name));

      return { eligible: deduped, linksByPoc, activeLinksByPoc };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const pocs = useMemo(() => data?.eligible ?? [], [data]);
  const pocLmpIdsMap = useMemo(() => data?.linksByPoc ?? new Map<string, Set<string>>(), [data]);
  const activePocLmpIdsMap = useMemo(() => data?.activeLinksByPoc ?? new Map<string, Set<string>>(), [data]);

  const selectOptions = useMemo(
    () => [
      { value: "All", label: "All Prep POCs" },
      ...pocs.map((p) => ({ value: p.pocId, label: p.name })),
    ],
    [pocs],
  );

  return { pocs, pocLmpIdsMap, activePocLmpIdsMap, selectOptions, isLoading };
}
