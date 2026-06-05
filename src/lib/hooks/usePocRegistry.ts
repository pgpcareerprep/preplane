/**
 * Hook to fetch live POC data from poc_profiles (canonical).
 * Returns the legacy PocRegistryEntry shape so existing consumers keep working.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type PocRegistryEntry = {
  id: string;
  name: string;
  initials: string;
  label: string;
  color: string;
  poc_type: "prep" | "outreach" | "behavioral";
  domains: string[];
  primary_domain: string | null;
  skill_tags: string[];
  max_threshold: number;
  availability: "available" | "on_leave" | "deactivated";
  behavioral_pool_member: boolean;
  company_experience: string[];
  recruiter_ownership: string[];
  last_assigned_at: string;
  access_level?: "admin" | "allocator" | "poc";
};

const POLL_INTERVAL = 120_000;

function deriveInitials(name: string): string {
  return name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function statusToAvailability(status?: string | null): PocRegistryEntry["availability"] {
  const s = (status || "").toLowerCase();
  if (s === "inactive" || s === "deactivated") return "deactivated";
  if (s === "on_leave" || s === "leave") return "on_leave";
  return "available";
}

function roleTypeToPocType(role_type?: string | null): PocRegistryEntry["poc_type"] {
  const r = (role_type || "").toLowerCase();
  if (r === "outreach_poc" || r === "outreach") return "outreach";
  return "prep";
}

export function usePocRegistry() {
  return useQuery({
    queryKey: ["poc_registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("poc_profiles")
        .select("id,name,initials,label,color,role_type,domain_tags,primary_domain,skill_tags,max_threshold,status,behavioral_pool_member,company_experience,recruiter_ownership,last_activity_at,last_assigned_at,access_level")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []).map((p: any): PocRegistryEntry => ({
        id: p.id,
        name: p.name,
        initials: p.initials || deriveInitials(p.name),
        label: p.label || p.name,
        color: p.color || "bg-orange-200 text-orange-600",
        poc_type: roleTypeToPocType(p.role_type),
        domains: p.domain_tags ?? [],
        primary_domain: p.primary_domain ?? null,
        skill_tags: p.skill_tags ?? [],
        max_threshold: p.max_threshold ?? 8,
        availability: statusToAvailability(p.status),
        behavioral_pool_member: !!p.behavioral_pool_member,
        company_experience: p.company_experience ?? [],
        recruiter_ownership: p.recruiter_ownership ?? [],
        last_assigned_at: p.last_assigned_at || p.last_activity_at || new Date().toISOString(),
        access_level: (p.access_level as PocRegistryEntry["access_level"]) ?? "poc",
      }));
    },
    refetchInterval: POLL_INTERVAL,
    staleTime: 60_000,
  });
}

export function usePrepPocs() {
  const { data = [], ...rest } = usePocRegistry();
  return { data: data.filter(p => p.poc_type === "prep"), ...rest };
}

export function useOutreachPocs() {
  const { data = [], ...rest } = usePocRegistry();
  return { data: data.filter(p => p.poc_type === "outreach"), ...rest };
}

export function useBehavioralPocs() {
  const { data = [], ...rest } = usePocRegistry();
  return { data: data.filter(p => p.poc_type === "prep" && p.behavioral_pool_member), ...rest };
}

/**
 * Calculate live workload for each POC from the LMP Tracker data.
 */
export function usePocWorkloads(lmpRows: Array<{ status: string; prepPoc?: { name: string }; domainPrepPoc?: { name: string }; supportPoc?: { name: string }; behavioralPrepPoc?: { name: string }; outreachPoc?: { name: string } }>) {
  const prepLoad: Record<string, number> = {};
  const outreachLoad: Record<string, number> = {};

  for (const r of lmpRows) {
    const isActive = r.status === "ongoing" || r.status === "not-started";
    if (!isActive) continue;

    const prep = r.prepPoc?.name || r.domainPrepPoc?.name;
    const support = r.supportPoc?.name || r.behavioralPrepPoc?.name;
    const outreach = r.outreachPoc?.name;
    if (prep) prepLoad[prep] = (prepLoad[prep] || 0) + 1;
    if (support && support !== prep) prepLoad[support] = (prepLoad[support] || 0) + 1;
    if (outreach) outreachLoad[outreach] = (outreachLoad[outreach] || 0) + 1;
  }

  return { prepLoad, outreachLoad };
}
