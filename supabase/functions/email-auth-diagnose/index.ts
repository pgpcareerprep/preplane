import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { diagnoseEmailAuth } from "../_shared/emailDiagnose.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;
  if (auth.user.role !== "admin") {
    return new Response(JSON.stringify({ ok: false, error: "Admin only" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const diagnostic = await diagnoseEmailAuth();
  const readyToSend = diagnostic.gmailDelegationAuthorized || diagnostic.hasSmtpPassword;

  return new Response(JSON.stringify({ ok: true, readyToSend, diagnostic }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
