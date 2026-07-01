import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
import {
  buildGmailOAuthAuthorizeUrl,
  getGmailOAuthRedirectUri,
  hasOAuthClientConfigured,
  saveOAuthPendingState,
} from "../_shared/gmailOAuth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireRole(req, corsHeaders, ["admin"]);
  if ("error" in auth) return auth.error;

  if (!hasOAuthClientConfigured()) {
    return new Response(
      JSON.stringify({
        ok: false,
        error:
          "Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in Supabase secrets (Web OAuth client with Gmail send scope).",
      }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const state = crypto.randomUUID();
  const redirectUri = getGmailOAuthRedirectUri();
  await saveOAuthPendingState(state, redirectUri, auth.user.id);
  const url = buildGmailOAuthAuthorizeUrl(state, redirectUri);

  return new Response(JSON.stringify({ ok: true, url, redirectUri }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
