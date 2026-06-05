// Validates the incoming Authorization: Bearer <jwt> header against Supabase Auth.
// Returns { user } on success, or a Response (401/403) on failure that callers
// must short-circuit return immediately.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY =
  Deno.env.get("SUPABASE_ANON_KEY") ||
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type AuthedUser = {
  id: string;
  email: string | null;
  role: "admin" | "allocator" | "poc";
};

function jsonError(status: number, message: string, headers: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export async function requireAuth(
  req: Request,
  cors: Record<string, string>,
  opts: { requireRoles?: Array<"admin" | "allocator" | "poc"> } = {},
): Promise<{ user: AuthedUser } | { error: Response }> {
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { error: jsonError(401, "Missing Authorization header", cors) };
  }
  const token = authHeader.slice(7).trim();

  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data?.user) {
    return { error: jsonError(401, "Invalid or expired session", cors) };
  }

  // Resolve role server-side from profiles using service role (bypass RLS).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: profile } = await admin
    .from("profiles")
    .select("role, access_status, is_active")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!profile || profile.access_status !== "approved" || profile.is_active === false) {
    return { error: jsonError(403, "Account not approved", cors) };
  }

  const role = (profile.role as AuthedUser["role"]) || "poc";
  if (opts.requireRoles && !opts.requireRoles.includes(role)) {
    return { error: jsonError(403, "Insufficient permissions", cors) };
  }

  return {
    user: { id: data.user.id, email: data.user.email ?? null, role },
  };
}
