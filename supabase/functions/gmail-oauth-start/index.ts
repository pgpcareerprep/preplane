import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
import {
  buildGmailOAuthAuthorizeUrl,
  getGmailOAuthRedirectUri,
  getOAuthClientMisconfigurationError,
  hasOAuthClientConfigured,
  saveOAuthPendingState,
} from "../_shared/gmailOAuth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRole(req, corsHeaders, ["admin"]);
  if ("error" in auth) return auth.error;

  try {
    const misconfig = getOAuthClientMisconfigurationError();
    if (misconfig) {
      return jsonResponse({ ok: false, error: misconfig });
    }

    if (!hasOAuthClientConfigured()) {
      return jsonResponse({
        ok: false,
        error:
          "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Supabase secrets (Web OAuth client with Gmail send scope).",
      });
    }

    const state = crypto.randomUUID();
    const redirectUri = getGmailOAuthRedirectUri();
    await saveOAuthPendingState(state, redirectUri, auth.user.id);
    const url = buildGmailOAuthAuthorizeUrl(state, redirectUri);

    return jsonResponse({ ok: true, url, redirectUri });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String((err as Error)?.message || err),
    });
  }
});
