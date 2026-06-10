import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const MAX_REQUEST_BYTES = 32_000;

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function rejectOversizedRequest(req: Request): Response | null {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_REQUEST_BYTES) {
    return new Response(JSON.stringify({ ok: false, error: "request_too_large" }), {
      status: 413,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}

export async function resolveFeedbackSession(
  admin: SupabaseClient,
  token: string,
): Promise<{ id: string; usedLegacy: boolean } | null> {
  const { data, error } = await admin.rpc("resolve_feedback_session", { p_token: token });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row?.session_id ? { id: row.session_id, usedLegacy: Boolean(row.used_legacy) } : null;
}

export async function enforceFeedbackRateLimit(
  admin: SupabaseClient,
  req: Request,
  token: string,
  action: "validate" | "submit",
): Promise<boolean> {
  const tokenHash = await sha256(token);
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const ipHash = await sha256(forwarded);
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const limit = action === "submit" ? 10 : 60;
  const { count, error } = await admin
    .from("feedback_abuse_events")
    .select("id", { count: "exact", head: true })
    .eq("token_hash", tokenHash)
    .eq("ip_hash", ipHash)
    .eq("action", action)
    .gte("created_at", since);
  if (error) throw error;
  if ((count ?? 0) >= limit) return false;
  const { error: insertError } = await admin.from("feedback_abuse_events").insert({
    token_hash: tokenHash,
    ip_hash: ipHash,
    action,
  });
  if (insertError) throw insertError;
  return true;
}
