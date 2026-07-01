import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { sendGmail, GMAIL_FROM } from "../_shared/gmail-send.ts";
import { diagnoseEmailAuth, emailAuthReadyToSend } from "../_shared/emailDiagnose.ts";
import { DEFAULT_APP_ORIGIN, getBrandName } from "../_shared/appConfig.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const requestedTo = String(body?.to || "").trim();
    const to = auth.user.role === "admin" && requestedTo
      ? requestedTo
      : auth.user.email;
    if (!to) {
      return new Response(JSON.stringify({ ok: false, error: "No recipient" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const diagnostic = await diagnoseEmailAuth();
    if (!emailAuthReadyToSend(diagnostic)) {
      return new Response(JSON.stringify({
        ok: false,
        error: diagnostic.hasOAuthClient && !diagnostic.hasOAuthRefreshToken
          ? "Gmail OAuth is not connected. Click Connect Gmail sender on the Notifications settings page."
          : "Email delivery is not configured.",
        diagnostic,
        fixHint: diagnostic.fixSteps[0] || null,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const brand = getBrandName();
      const sentAt = new Date().toISOString();
      const info = await sendGmail({
        to,
        subject: `${brand} — test email`,
        html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#1f2937;">
          <h3 style="margin:0 0 8px;">✅ Email sending works</h3>
          <p>This is a test email from <b>${brand}</b>, sent from <b>${GMAIL_FROM}</b>.</p>
          <p style="color:#6b7280;font-size:12px;">Sent at ${sentAt}</p>
        </div>`,
      });
      return new Response(JSON.stringify({
        ok: true,
        messageId: info.id,
        to,
        from: GMAIL_FROM,
        method: info.method || "gmail-api",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (sendErr) {
      const diagnostic = await diagnoseEmailAuth();
      const errMsg = String((sendErr as Error)?.message || sendErr);
      console.error("Test email send failed:", errMsg, JSON.stringify(diagnostic));
      return new Response(JSON.stringify({
        ok: false,
        error: errMsg,
        diagnostic,
        fixHint: diagnostic.fixSteps[0] || null,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
