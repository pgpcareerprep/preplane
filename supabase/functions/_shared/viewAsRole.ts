import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const PRIVILEGE: Record<string, number> = { poc: 0, allocator: 1, admin: 2 };

/** Return the less-privileged of two app roles. */
export function moreRestrictiveRole(a: string, b: string): string {
  const pa = PRIVILEGE[a] ?? 0;
  const pb = PRIVILEGE[b] ?? 0;
  return pa <= pb ? a : b;
}

function serviceClient() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Resolve viewed user's role from poc_profiles + profiles (never trust client claim). */
export async function lookupRoleByDisplayName(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const norm = trimmed.toLowerCase();
  const sb = serviceClient();

  const { data: byName } = await sb
    .from("poc_profiles")
    .select("approved_user_id")
    .ilike("name", trimmed)
    .maybeSingle();
  let userId = byName?.approved_user_id as string | undefined;

  if (!userId) {
    const { data: byAlias } = await sb
      .from("poc_profiles")
      .select("approved_user_id")
      .contains("aliases", [norm])
      .maybeSingle();
    userId = byAlias?.approved_user_id as string | undefined;
  }

  if (!userId) {
    const first = norm.split(/\s+/)[0];
    if (first) {
      const { data: byFirst } = await sb
        .from("poc_profiles")
        .select("approved_user_id")
        .contains("aliases", [first])
        .maybeSingle();
      userId = byFirst?.approved_user_id as string | undefined;
    }
  }

  if (!userId) return null;

  const { data: prof } = await sb
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return (prof?.role as string) || null;
}

export type ResolveViewAsRoleResult = {
  effectiveRole: string;
  resolvedRole: string | null;
  downgraded: boolean;
};

export async function resolveViewAsEffectiveRole(
  viewAsName: string,
  claimedRole: string,
  realJwtRole: string,
): Promise<ResolveViewAsRoleResult> {
  const resolvedRole = await lookupRoleByDisplayName(viewAsName);
  if (resolvedRole) {
    const effectiveRole = moreRestrictiveRole(resolvedRole, realJwtRole);
    return {
      effectiveRole,
      resolvedRole,
      downgraded: claimedRole !== resolvedRole,
    };
  }
  const effectiveRole = moreRestrictiveRole(claimedRole, realJwtRole);
  return { effectiveRole, resolvedRole: null, downgraded: claimedRole !== effectiveRole };
}
