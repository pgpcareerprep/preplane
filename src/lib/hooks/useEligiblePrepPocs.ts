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
  assignedLmpIds: string[];
  assignedLmpCount: number;
};

/**
 * Canonical eligible Prep POC directory.
 *
 * Eligibility rules (ALL must be satisfied):
 * 1. poc_profiles.status = "active"
 * 2. Has at least one valid domain (primary_domain OR a non-empty domain_tags entry)
 * 3. Has at least one active lmp_poc_links record with role "prep" or "support"
 *    (outreach-only users are excluded)
 * 4. All access levels are permitted (admin, allocator, poc all qualify)
 *
 * Returns:
 * - `pocs`         — sorted eligible POC list
 * - `pocLmpIdsMap` — Map<poc_profiles.id → Set<lmp_processes.id>> for UUID-based filtering
 * - `selectOptions` — [{ value: "All", label: "All Prep POCs" }, ...pocs as options]
 */
export function useEligiblePrepPocs(): {
  pocs: EligiblePrepPoc[];
  pocLmpIdsMap: Map<string, Set<string>>;
  selectOptions: { value: string; label: string }[];
  isLoading: boolean;
} {
  useRealtimeInvalidate("poc_profiles" as never, [["eligible_prep_pocs"]]);
  useRealtimeInvalidate("lmp_poc_links" as never, [["eligible_prep_pocs"]]);

  const { data, isLoading } = useQuery({
    queryKey: ["eligible_prep_pocs"],
    queryFn: async () => {
      const [pocsRes, linksRes] = await Promise.all([
        supabase
          .from("poc_profiles")
          .select("id, name, email, access_level, primary_domain, domain_tags, status")
          .eq("status", "active"),
        supabase
          .from("lmp_poc_links")
          .select("poc_id, lmp_id, role, is_active")
          .in("role", ["prep", "support"])
          .eq("is_active", true),
      ]);

      if (pocsRes.error) throw new Error(pocsRes.error.message);
      if (linksRes.error) throw new Error(linksRes.error.message);

      // Build pocId → Set<lmpId> from active prep/support links
      const linksByPoc = new Map<string, Set<string>>();
      for (const l of linksRes.data ?? []) {
        if (!l.poc_id || !l.lmp_id) continue;
        const set = linksByPoc.get(l.poc_id) ?? new Set<string>();
        set.add(l.lmp_id);
        linksByPoc.set(l.poc_id, set);
      }

      const eligible: EligiblePrepPoc[] = [];

      for (const p of pocsRes.data ?? []) {
        // Rule 2: must have at least one valid domain
        const primaryDomain = (p.primary_domain ?? "").trim() || null;
        const domainTags: string[] = Array.isArray(p.domain_tags)
          ? (p.domain_tags as string[]).filter((t) => t && t.trim())
          : [];
        const hasDomain = !!primaryDomain || domainTags.length > 0;
        if (!hasDomain) continue;

        // Rule 3: must have at least one active prep/support link
        const assignedSet = linksByPoc.get(p.id as string);
        if (!assignedSet || assignedSet.size === 0) continue;

        const domains: string[] = [
          ...(primaryDomain ? [primaryDomain] : []),
          ...domainTags,
        ];

        eligible.push({
          pocId: p.id as string,
          name: ((p.name as string | null) ?? "").trim(),
          email: (p.email as string | null) ?? null,
          accessLevel: (p.access_level as string | null) ?? "poc",
          primaryDomain,
          domains,
          assignedLmpIds: Array.from(assignedSet),
          assignedLmpCount: assignedSet.size,
        });
      }

      eligible.sort((a, b) => a.name.localeCompare(b.name));

      return { eligible, linksByPoc };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const pocs = useMemo(() => data?.eligible ?? [], [data]);
  const pocLmpIdsMap = useMemo(() => data?.linksByPoc ?? new Map<string, Set<string>>(), [data]);

  const selectOptions = useMemo(
    () => [
      { value: "All", label: "All Prep POCs" },
      ...pocs.map((p) => ({ value: p.pocId, label: p.name })),
    ],
    [pocs],
  );

  return { pocs, pocLmpIdsMap, selectOptions, isLoading };
}
