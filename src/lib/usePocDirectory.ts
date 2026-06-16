import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Role, ApprovedUser } from "@/lib/rolesContext";

function mapRole(access_level: string | null | undefined): Role {
  const r = (access_level || "").toLowerCase();
  if (r === "admin") return "admin";
  if (r === "allocator") return "allocator";
  return "poc";
}

export function usePocDirectory() {
  const q = useQuery({
    queryKey: ["poc-directory"],
    queryFn: async () => {
      // Query the canonical assignment-count view (poc_lmp_assignment_counts) so that
      // countByEmail reflects total_assigned_lmp_count — the number of distinct LMPs
      // where this person has an active prep/support/outreach link — rather than
      // active_load (which only counts open-status LMPs and excludes hold/converted).
      const { data, error } = await (supabase as any)
        .from("poc_lmp_assignment_counts")
        .select("poc_id, name, email, role_type, access_level, poc_status, total_assigned_lmp_count")
        .eq("poc_status", "active")
        .neq("role_type", "outreach_poc")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const rows = q.data ?? [];
  const pocs: ApprovedUser[] = rows
    .filter((r: any) => r.name && r.email)
    .map((r: any) => ({
      name: r.name as string,
      email: (r.email as string).toLowerCase(),
      role: mapRole(r.access_level),
      pocId: (r.poc_id as string) ?? null,
    }));

  const countByEmail: Record<string, number> = {};
  for (const r of rows as any[]) {
    if (r.email) countByEmail[(r.email as string).toLowerCase()] = r.total_assigned_lmp_count ?? 0;
  }

  return { pocs, countByEmail, isLoading: q.isLoading };
}
