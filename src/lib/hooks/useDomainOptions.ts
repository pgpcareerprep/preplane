import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DomainOption = {
  id: string;
  name: string;
  slug: string;
  aliases: string[];
};

/**
 * Live primary domains from the `domains` table.
 * Excludes the synthetic `unmapped` slug from any user-facing dropdown.
 */
export function useDomainOptions() {
  const q = useQuery({
    queryKey: ["domain-options"],
    queryFn: async (): Promise<DomainOption[]> => {
      const { data, error } = await supabase
        .from("domains")
        .select("id, name, slug, aliases")
        .neq("slug", "unmapped")
        .order("name");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
      }));
    },
    staleTime: 5 * 60_000,
  });
  return {
    options: q.data ?? [],
    names: (q.data ?? []).map((d) => d.name),
    isLoading: q.isLoading,
    error: q.error,
  };
}
