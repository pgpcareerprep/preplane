import type { DomainOption } from "@/lib/hooks/useDomainOptions";

function norm(s: string): string {
  return (s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Resolve a free-form domain string (sheet value, upload cell, primary_domain
 * column, etc.) to its canonical primary `name` from the domains table.
 *
 * Case-insensitive match against domain `name` first, then `aliases[]`.
 * Returns null if nothing matches.
 */
export function resolveDomainName(
  input: string | null | undefined,
  domains: DomainOption[],
): string | null {
  const key = norm(input ?? "");
  if (!key) return null;
  for (const d of domains) {
    if (norm(d.name) === key) return d.name;
  }
  for (const d of domains) {
    if (d.aliases.some((a) => norm(a) === key)) return d.name;
  }
  return null;
}

/** Slug-returning variant, used by the allocation engine. */
export function resolveDomainSlug(
  input: string | null | undefined,
  domains: DomainOption[],
): string | null {
  const key = norm(input ?? "");
  if (!key) return null;
  for (const d of domains) {
    if (norm(d.name) === key || d.aliases.some((a) => norm(a) === key)) {
      return d.slug;
    }
  }
  return null;
}
