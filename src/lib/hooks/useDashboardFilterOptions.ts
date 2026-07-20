import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLmpProcesses } from "@/lib/hooks/useDbData";
import { useRealtimeInvalidate } from "@/lib/hooks/useRealtimeInvalidate";
import { useEligiblePrepPocs } from "@/lib/hooks/useEligiblePrepPocs";
import { labelForStatusSlug, labelForTypeRaw, sortStatusSlugs } from "@/lib/dashboardFilterLabels";

export type FilterOption = {
  value: string;
  label: string;
};

export type DashboardFilterOptions = {
  domainOptions: FilterOption[];
  statusOptions: FilterOption[];
  typeOptions: FilterOption[];
  prepPocOptions: FilterOption[];
  isLoading: boolean;
};

const ALL_OPTION: FilterOption = { value: "All", label: "All" };

export function useDashboardFilterOptions(): DashboardFilterOptions {
  useRealtimeInvalidate("domains", [["dashboard_filter_domains"]], {
    cachePrefixes: ['["dashboard_filter_domains"'],
  });
  useRealtimeInvalidate("lmp_processes", [["db-lmp-processes"]], {
    cachePrefixes: ['["db-lmp-processes'],
  });
  useRealtimeInvalidate("poc_profiles", [["eligible_prep_pocs"]], {
    cachePrefixes: ['["eligible_prep_pocs"'],
  });
  useRealtimeInvalidate("lmp_poc_links", [["eligible_prep_pocs"]], {
    cachePrefixes: ['["eligible_prep_pocs"'],
  });

  const { selectOptions: eligiblePrepOptions, isLoading: prepLoading } = useEligiblePrepPocs();
  // Reuse the same lmp_processes query as useLmpRows — avoids a duplicate full-table fetch.
  const { data: lmpRows = [], isLoading: lmpLoading } = useLmpProcesses({ includeArchived: true });

  const { data: domainRows = [], isLoading: domainsLoading } = useQuery({
    queryKey: ["dashboard_filter_domains"],
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("name").order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const data = useMemo(() => {
    const domainNames = new Set<string>();
    for (const row of domainRows) {
      const name = (row.name ?? "").trim();
      if (name) domainNames.add(name);
    }

    const statusSlugs = new Set<string>();
    const typeRaws = new Set<string>();
    for (const row of lmpRows) {
      const status = (row.status ?? "").trim().toLowerCase();
      if (status) statusSlugs.add(status);
      const typeRaw = (row.type ?? "").trim();
      if (typeRaw) typeRaws.add(typeRaw);
      const domain = (row.domain_raw ?? "").trim();
      if (domain) domainNames.add(domain);
    }

    return {
      domainNames: Array.from(domainNames).sort((a, b) => a.localeCompare(b)),
      statusSlugs: sortStatusSlugs(Array.from(statusSlugs)),
      typeRaws: Array.from(typeRaws).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })),
    };
  }, [domainRows, lmpRows]);

  const domainOptions = useMemo(
    () => [ALL_OPTION, ...(data?.domainNames ?? []).map((name) => ({ value: name, label: name }))],
    [data?.domainNames],
  );

  const statusOptions = useMemo(
    () => [ALL_OPTION, ...(data?.statusSlugs ?? []).filter(Boolean).map((slug) => ({
      value: slug,
      label: labelForStatusSlug(slug),
    }))],
    [data?.statusSlugs],
  );

  const typeOptions = useMemo(
    () => [ALL_OPTION, ...(data?.typeRaws ?? []).filter(Boolean).map((raw) => ({
      value: raw,
      label: labelForTypeRaw(raw),
    }))],
    [data?.typeRaws],
  );

  const prepPocOptions = useMemo(
    () => eligiblePrepOptions.map((o) =>
      o.value === "All" ? ALL_OPTION : { value: o.value, label: o.label },
    ),
    [eligiblePrepOptions],
  );

  return {
    domainOptions,
    statusOptions,
    typeOptions,
    prepPocOptions,
    isLoading: lmpLoading || domainsLoading || prepLoading,
  };
}
