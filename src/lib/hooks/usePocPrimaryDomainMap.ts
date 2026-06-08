import { useMemo } from "react";
import { usePocCapabilityList } from "@/lib/hooks/usePocCapabilityLive";
import type { PocPrimaryDomainMap } from "@/lib/domainAllocation";

/** Live POC → primary-domain map sourced from `poc_profiles`. */
export function usePocPrimaryDomainMap(): {
  map: PocPrimaryDomainMap;
  isLoading: boolean;
} {
  const { list, isLoading } = usePocCapabilityList();
  const map = useMemo<PocPrimaryDomainMap>(() => {
    const out: PocPrimaryDomainMap = {};
    list.forEach((p) => {
      const primary = p.primaryDomains?.[0] ?? p.domains?.[0];
      if (primary) out[p.name] = primary;
    });
    return out;
  }, [list]);
  return { map, isLoading };
}
