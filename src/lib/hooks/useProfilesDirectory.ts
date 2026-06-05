import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DirectoryProfile = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

/** Lightweight, cached directory of all profiles for mention resolution. */
export function useProfilesDirectory() {
  return useQuery({
    queryKey: ["profiles-directory"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<DirectoryProfile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, user_id, display_name, email, avatar_url");
      if (error) throw error;
      return (data ?? []) as DirectoryProfile[];
    },
  });
}

/** Normalize a name/email to a comparable handle:
 *  "First Last" -> "firstlast"
 *  "first.last@example.com" -> "firstlast" */
export function normalizeHandle(s: string | null | undefined): string {
  if (!s) return "";
  const base = s.includes("@") ? s.split("@")[0] : s;
  return base.toLowerCase().replace(/[^a-z0-9]/g, "");
}
