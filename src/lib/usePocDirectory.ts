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
      const { data, error } = await supabase
        .from("poc_profiles")
        .select("id, name, email, role_type, access_level, active_load, status")
        .eq("status", "active")
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
    }));

  const countByEmail: Record<string, number> = {};
  for (const r of rows as any[]) {
    if (r.email) countByEmail[(r.email as string).toLowerCase()] = r.active_load ?? 0;
  }

  return { pocs, countByEmail, isLoading: q.isLoading };
}
