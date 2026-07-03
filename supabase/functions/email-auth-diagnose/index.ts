import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { diagnoseEmailAuth, emailAuthReadyToSend } from "../_shared/emailDiagnose.ts";


Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
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
  const readyToSend = emailAuthReadyToSend(diagnostic);

  return new Response(JSON.stringify({ ok: true, readyToSend, diagnostic }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
