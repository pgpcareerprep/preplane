import { useCallback, useMemo } from "react";
import { useDomainOptions, type DomainOption } from "./useDomainOptions";
import { resolveDomainName, resolveDomainSlug } from "@/lib/domainAlias";

/**
 * Single hook for any UI surface that needs to filter, display, or compare
 * domain values against the canonical `domains` table (with aliases).
 *
 * - `options` — canonical names (excludes the synthetic "Unmapped" slug),
 *               suitable for dropdowns.
 * - `resolve(raw)` — canonical name or `null`.
 * - `display(raw)` — canonical name, "Unmapped" if no alias match, "—" if blank.
 * - `slug(raw)` — canonical slug or `null`.
 * - `matches(raw, selected)` — true if `raw` resolves to `selected`
 *                              (selected is a canonical name from `options`).
 */
export function useResolveDomain() {
  const { options, names, isLoading } = useDomainOptions();

  const resolve = useCallback(
    (raw: string | null | undefined) => resolveDomainName(raw, options),
    [options],
  );

  const slug = useCallback(
    (raw: string | null | undefined) => resolveDomainSlug(raw, options),
    [options],
  );

  const display = useCallback(
    (raw: string | null | undefined) => {
      const v = (raw ?? "").trim();
      if (!v) return "—";
      return resolve(v) ?? "Unmapped";
    },
    [resolve],
  );

  const matches = useCallback(
    (raw: string | null | undefined, selected: string) => {
      if (!selected) return true;
      return (resolve(raw) ?? "Unmapped") === selected;
    },
    [resolve],
  );

  return useMemo(
    () => ({ options, names, isLoading, resolve, slug, display, matches }),
    [options, names, isLoading, resolve, slug, display, matches],
  );
}

export type { DomainOption };
