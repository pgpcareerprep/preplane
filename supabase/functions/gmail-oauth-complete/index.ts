import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
import {
  consumeOAuthPendingState,
  exchangeAuthorizationCode,
  getGmailOAuthRedirectUri,
  saveOAuthSettings,
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

  const body = await req.json().catch(() => ({}));
  const code = String(body?.code || "").trim();
  const state = String(body?.state || "").trim();
  if (!code || !state) {
    return new Response(JSON.stringify({ ok: false, error: "code and state are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const pending = await consumeOAuthPendingState(state);
  if (!pending) {
    return new Response(
      JSON.stringify({ ok: false, error: "Invalid or expired OAuth state — start connect again." }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const redirectUri = pending.redirect_uri || getGmailOAuthRedirectUri();
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

  return new Response(
    JSON.stringify({
      ok: true,
      senderEmail,
      message: `Gmail sender connected as ${senderEmail}`,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
