/**
 * useDbLmpId — Resolve the canonical lmp_processes UUID for a given LMP record.
 *
 * Resolution order:
 *   1) `id` is already a valid UUID → use directly.
 *   2) Match by `lmp_code` (LMP ID) — stable identifier across renames/duplicates.
 *   3) Legacy fallback: unique company+role match.
 * Returns undefined when ambiguous so callers can refuse to write.
 */
import { useMemo } from "react";
import { useLmpProcesses } from "./useDbData";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function useDbLmpId(input: {
  id?: string;
  lmpCode?: string;
  company?: string;
  role?: string;
} | undefined | null): string | undefined {
  const { data: dbProcesses = [] } = useLmpProcesses();
  return useMemo(() => {
    if (!input) return undefined;
    const rawId = (input.id || "").trim();
    if (UUID_RE.test(rawId)) return rawId;

    // Match by lmp_code — accept explicit lmpCode or an id that isn't a UUID.
    const code = (input.lmpCode || (rawId && !UUID_RE.test(rawId) ? rawId : "")).trim();
    if (code) {
      const byCode = (dbProcesses as any[]).find(
        (p) => (p.lmp_code || "").trim().toLowerCase() === code.toLowerCase(),
      );
      if (byCode) return byCode.id as string;
    }

    const c = input.company?.trim().toLowerCase();
    const r = input.role?.trim().toLowerCase();
    if (!c || !r) return undefined;
    const matches = (dbProcesses as any[]).filter(
      (p) =>
        p.company?.trim().toLowerCase() === c &&
        p.role?.trim().toLowerCase() === r,
    );
    if (matches.length === 1) return matches[0].id as string;
    if (matches.length > 1) {
      console.warn(
        `[useDbLmpId] Ambiguous LMP for ${c} @ ${r} (${matches.length} matches). ` +
        `Pass lmpCode or UUID to disambiguate.`,
      );
      return undefined;
    }
    return undefined;
  }, [dbProcesses, input?.id, input?.lmpCode, input?.company, input?.role]);
}
