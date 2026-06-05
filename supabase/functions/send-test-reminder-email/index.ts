import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { sendGmail, GMAIL_FROM } from "../_shared/gmail-send.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://preplane.netlify.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;


  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userEmail = userData.user.email;

    const body = await req.json().catch(() => ({}));
    const to = (body?.to as string) || userEmail;
    if (!to) {
      return new Response(JSON.stringify({ ok: false, error: "No recipient" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const info = await sendGmail({
        to,
        subject: "LMP Magic — test email (Gmail OAuth working)",
        html: `<div style="font-family:-apple-system,Segoe UI,sans-serif;color:#1f2937;">
          <h3 style="margin:0 0 8px;">✅ Email sending works</h3>
          <p>This is a test email from <b>LMP Magic</b>, sent from <b>${GMAIL_FROM}</b> via Gmail OAuth (no password).</p>
          <p style="color:#6b7280;font-size:12px;">Sent at ${new Date().toISOString()}</p>
        </div>`,
      });
      return new Response(JSON.stringify({ ok: true, messageId: info.id, to, from: GMAIL_FROM }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (sendErr) {
      console.error("Test email send failed:", sendErr);
      return new Response(JSON.stringify({ ok: false, error: String((sendErr as Error)?.message || sendErr) }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
