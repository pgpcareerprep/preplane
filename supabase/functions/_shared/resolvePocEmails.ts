import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type PocProfileRow = {
  id: string;
  name: string;
  email?: string | null;
  aliases?: string[] | null;
};

function dedupeEmails(emails: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of emails) {
    const e = String(raw ?? "").trim();
    if (!e) continue;
    const k = e.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

function matchByNameOrAlias(profiles: PocProfileRow[], name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  const byName = profiles.find((p) => (p.name || "").trim().toLowerCase() === n);
  if (byName?.email?.trim()) return byName.email.trim();
  const byAlias = profiles.find((p) =>
    (p.aliases || []).some((a) => (a || "").trim().toLowerCase() === n),
  );
  return byAlias?.email?.trim() || null;
}

export async function resolveOperationalPocEmails(
  supabase: SupabaseClient,
  lmp: {
    prep_poc_id?: string | null;
    support_poc_id?: string | null;
    prep_poc?: string | null;
    support_poc?: string | null;
  },
  fallbackEmail?: string | null,
): Promise<string[]> {
  const { data: profiles } = await supabase
    .from("poc_profiles")
    .select("id, name, email, aliases")
    .eq("status", "active");

  const rows = (profiles ?? []) as PocProfileRow[];
  const byId = new Map(rows.map((p) => [p.id, p]));

  const resolved: Array<string | null | undefined> = [];

  if (lmp.prep_poc_id) {
    resolved.push(byId.get(lmp.prep_poc_id)?.email ?? null);
  }
  if (lmp.support_poc_id) {
    resolved.push(byId.get(lmp.support_poc_id)?.email ?? null);
  }

  if (lmp.prep_poc) {
    resolved.push(matchByNameOrAlias(rows, lmp.prep_poc));
  }
  if (lmp.support_poc) {
    resolved.push(matchByNameOrAlias(rows, lmp.support_poc));
  }

  const emails = dedupeEmails(resolved);
  if (emails.length === 0 && fallbackEmail) {
    return dedupeEmails([fallbackEmail]);
  }
  return emails;
}
