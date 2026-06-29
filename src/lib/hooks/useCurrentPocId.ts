import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";

/**
 * Resolves the signed-in user → poc_profiles.id by matching email.
 * Mirrors the SQL `current_poc_id()` SECURITY DEFINER helper used by RLS,
 * so the same uuid drives both client-side ownership checks and server policies.
 */
export function useCurrentPocId(): string | null {
  const { user } = useRole();
  const pocProfileId = user.pocProfileId;
  const email = (user?.email || "").toLowerCase().trim();
  const { data } = useQuery({
    queryKey: ["current-poc-id", email],
    queryFn: async () => {
      if (!email) return null;
      const { data: row } = await supabase
        .from("poc_profiles")
        .select("id")
        .ilike("email", email)
        .maybeSingle();
      return (row?.id as string) ?? null;
    },
    enabled: !pocProfileId && !!email,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
  return pocProfileId ?? data ?? null;
}
