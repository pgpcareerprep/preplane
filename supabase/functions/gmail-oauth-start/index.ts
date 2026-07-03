import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";
import {
  buildGmailOAuthAuthorizeUrl,
  getGmailOAuthRedirectUri,
  getOAuthClientMisconfigurationError,
  hasOAuthClientConfigured,
  saveOAuthPendingState,
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

  try {
    const misconfig = getOAuthClientMisconfigurationError();
    if (misconfig) {
      return jsonResponse({ ok: false, error: misconfig }, 200, corsHeaders);
    }

    if (!hasOAuthClientConfigured()) {
      return jsonResponse({
        ok: false,
        error:
          "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Supabase secrets (Web OAuth client with Gmail send scope).",
      }, 200, corsHeaders);
    }

    const state = crypto.randomUUID();
    const redirectUri = getGmailOAuthRedirectUri();
    await saveOAuthPendingState(state, redirectUri, auth.user.id);
    const url = buildGmailOAuthAuthorizeUrl(state, redirectUri);

    return jsonResponse({ ok: true, url, redirectUri }, 200, corsHeaders);
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String((err as Error)?.message || err),
    }, 200, corsHeaders);
  }
});
