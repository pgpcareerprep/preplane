/**
 * Resolve a POC's email from poc_profiles using (in priority order):
 *   1. exact UUID match (deterministic when prep_poc_id is set)
 *   2. case-insensitive trimmed name match
 *   3. case-insensitive trimmed alias match
 *
 * Returns null if no match has a non-empty email.
 */
export type PocProfileLike = {
  id: string;
  name: string;
  email?: string | null;
  aliases?: string[] | null;
};

export function resolvePocEmail(
  pocProfiles: PocProfileLike[],
  opts: { id?: string | null; name?: string | null },
): string | null {
  if (opts.id) {
    const byId = pocProfiles.find((p) => p.id === opts.id);
    const e = byId?.email?.trim();
    if (e) return e;
  }
  const n = opts.name?.trim().toLowerCase();
  if (!n) return null;
  const byName = pocProfiles.find(
    (p) => (p.name || "").trim().toLowerCase() === n,
  );
  const en = byName?.email?.trim();
  if (en) return en;
  const byAlias = pocProfiles.find((p) =>
    (p.aliases || []).some((a) => (a || "").trim().toLowerCase() === n),
  );
  return byAlias?.email?.trim() || null;
}
