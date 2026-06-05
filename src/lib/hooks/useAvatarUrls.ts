import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AvatarMaps = {
  byEmail: Map<string, string>;
  byName: Map<string, string>;
  byFirstName: Map<string, string>;
};

const QKEY = ["avatar-urls"] as const;

function norm(s?: string | null) {
  return (s ?? "").trim().toLowerCase();
}

async function fetchAvatarMaps(): Promise<AvatarMaps> {
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();
  const byFirstName = new Map<string, string>();

  const { data } = await supabase
    .from("profiles")
    .select("display_name, email, avatar_url")
    .not("avatar_url", "is", null);

  for (const r of (data ?? []) as Array<{ display_name: string | null; email: string | null; avatar_url: string | null }>) {
    if (!r.avatar_url) continue;
    const e = norm(r.email);
    if (e) byEmail.set(e, r.avatar_url);
    const n = norm(r.display_name);
    if (n) {
      byName.set(n, r.avatar_url);
      const first = n.split(/\s+/)[0];
      if (first && !byFirstName.has(first)) byFirstName.set(first, r.avatar_url);
    }
  }
  return { byEmail, byName, byFirstName };
}

export function useAvatarMaps() {
  return useQuery({
    queryKey: QKEY,
    queryFn: fetchAvatarMaps,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Resolve an avatar URL by email and/or display name. */
export function useAvatarUrl(name?: string | null, email?: string | null): string | undefined {
  const { data } = useAvatarMaps();
  if (!data) return undefined;
  const e = norm(email);
  if (e && data.byEmail.has(e)) return data.byEmail.get(e);
  const n = norm(name);
  if (n && data.byName.has(n)) return data.byName.get(n);
  if (n) {
    const first = n.split(/\s+/)[0];
    if (first && data.byFirstName.has(first)) return data.byFirstName.get(first);
  }
  return undefined;
}

export function useInvalidateAvatarUrls() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: QKEY });
}
