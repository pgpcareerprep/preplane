import { supabase } from "@/integrations/supabase/client";
import { resolveDomainName } from "@/lib/domainAlias";
import type { DomainOption } from "@/lib/hooks/useDomainOptions";

/**
 * Fetch the canonical domains list for use inside non-React code paths
 * (CSV uploads, sheet sync, server-side resolvers, etc.).
 *
 * Includes the synthetic `unmapped` row so we can attribute fall-throughs,
 * but consumers typically ignore it.
 */
export async function fetchCanonicalDomains(): Promise<DomainOption[]> {
  const { data, error } = await supabase
    .from("domains")
    .select("id, name, slug, aliases")
    .order("name");
  if (error || !data) return [];
  return data.map((r: any) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    aliases: Array.isArray(r.aliases) ? r.aliases : [],
  }));
}

/** Returns canonical name; falls back to trimmed original if no alias match. */
export function normalizeDomain(
  raw: string | null | undefined,
  domains: DomainOption[],
): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  return resolveDomainName(trimmed, domains) ?? trimmed;
}

/** Normalize each entry in a list (used for `other_domains` / `domain_tags`). */
export function normalizeDomainList(
  values: Array<string | null | undefined> | null | undefined,
  domains: DomainOption[],
): string[] {
  if (!values?.length) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of values) {
    const n = normalizeDomain(v, domains);
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}
