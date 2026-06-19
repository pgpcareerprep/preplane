import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
  useRealtimeInvalidate("domains", [["dashboard_filter_options"]], {
    cachePrefixes: ['["dashboard_filter_options"'],
  });
  useRealtimeInvalidate("lmp_processes", [["dashboard_filter_options"]], {
    cachePrefixes: ['["dashboard_filter_options"'],
  });
  useRealtimeInvalidate("poc_profiles", [["dashboard_filter_options"], ["eligible_prep_pocs"]], {
    cachePrefixes: ['["dashboard_filter_options"', '["eligible_prep_pocs"'],
  });
  useRealtimeInvalidate("lmp_poc_links", [["dashboard_filter_options"], ["eligible_prep_pocs"]], {
    cachePrefixes: ['["dashboard_filter_options"', '["eligible_prep_pocs"'],
  });

  const { selectOptions: eligiblePrepOptions, isLoading: prepLoading } = useEligiblePrepPocs();

  const { data, isLoading: metaLoading } = useQuery({
    queryKey: ["dashboard_filter_options"],
    queryFn: async () => {
      const [domainsRes, processesRes] = await Promise.all([
        supabase.from("domains").select("name").order("name"),
        supabase.from("lmp_processes").select("status, type, domain_raw"),
      ]);

      if (domainsRes.error) throw new Error(domainsRes.error.message);
      if (processesRes.error) throw new Error(processesRes.error.message);

      const domainNames = new Set<string>();
      for (const row of domainsRes.data ?? []) {
        const name = (row.name ?? "").trim();
        if (name) domainNames.add(name);
      }

      const statusSlugs = new Set<string>();
      const typeRaws = new Set<string>();
      for (const row of processesRes.data ?? []) {
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
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const domainOptions = useMemo(
    () => [ALL_OPTION, ...(data?.domainNames ?? []).map((name) => ({ value: name, label: name }))],
    [data?.domainNames],
  );

  const statusOptions = useMemo(
    () => [ALL_OPTION, ...(data?.statusSlugs ?? []).map((slug) => ({
      value: slug,
      label: labelForStatusSlug(slug),
    }))],
    [data?.statusSlugs],
  );

  const typeOptions = useMemo(
    () => [ALL_OPTION, ...(data?.typeRaws ?? []).map((raw) => ({
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
    isLoading: metaLoading || prepLoading,
  };
}
