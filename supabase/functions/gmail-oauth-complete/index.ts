import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";
import {
  consumeOAuthPendingState,
  exchangeAuthorizationCode,
  getGmailOAuthRedirectUri,
  saveOAuthSettings,
} from "../_shared/gmailOAuth.ts";


function jsonResponse(body: Record<string, unknown>, status = 200, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRole(req, corsHeaders, ["admin"]);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim();
  const state = String(body?.state || "").trim();
  if (!code || !state) {
    return jsonResponse({ ok: false, error: "code and state are required" }, 200, corsHeaders);
  }

  const pending = await consumeOAuthPendingState(state);
  if (!pending) {
    return jsonResponse({
      ok: false,
      error: "Invalid or expired OAuth state — start connect again.",
    }, 200, corsHeaders);
  }

  const redirectUri = pending.redirect_uri || getGmailOAuthRedirectUri();
  try {
    const { refreshToken, senderEmail } = await exchangeAuthorizationCode(code, redirectUri);

    await saveOAuthSettings(
      {
        refresh_token: refreshToken,
        sender_email: senderEmail,
        connected_at: new Date().toISOString(),
        connected_by: auth.user.id,
      },
      auth.user.id,
    );

    return jsonResponse({
      ok: true,
      senderEmail,
      message: `Gmail sender connected as ${senderEmail}`,
    }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String((err as Error)?.message || err),
    }, 200, corsHeaders);
  }
});
