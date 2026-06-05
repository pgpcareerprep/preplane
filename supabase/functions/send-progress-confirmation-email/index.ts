import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { sendGmail } from "../_shared/gmail-send.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://lmpmagic.lovable.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_URL = "https://lmpmagic.lovable.app/lmp";

async function resolveEmailForName(supabase: any, name?: string | null): Promise<string | null> {
  const n = (name || "").trim();
  if (!n) return null;
  const { data: pp } = await supabase.from("poc_profiles").select("email").eq("name", n).maybeSingle();
  if (pp?.email) return String(pp.email).trim();
  const { data: pf } = await supabase.from("profiles").select("email").eq("display_name", n).maybeSingle();
  return pf?.email ? String(pf.email).trim() : null;
}

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { lmp_id, next_date, reminder_type, to_email, to_emails } = body || {};
    if (!lmp_id || !next_date) {
      return new Response(JSON.stringify({ error: "lmp_id and next_date required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: lmp } = await supabase
      .from("lmp_processes")
      .select("company, role, domain_raw, prep_poc, support_poc")
      .eq("id", lmp_id)
      .single();

    // Build recipient list
    let recipients: string[] = [];
    if (Array.isArray(to_emails) && to_emails.length > 0) {
      recipients = to_emails.filter(Boolean).map((e: string) => String(e).trim());
    } else if (to_email) {
      recipients = [String(to_email).trim()];
    } else {
      const prepEmail = await resolveEmailForName(supabase, (lmp as any)?.prep_poc);
      const supportEmail = await resolveEmailForName(supabase, (lmp as any)?.support_poc);
      recipients = [prepEmail, supportEmail].filter(Boolean) as string[];
    }

    // Dedupe (case-insensitive)
    const seen = new Set<string>();
    recipients = recipients.filter((e) => {
      const k = e.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "No recipient email resolved" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const company = (lmp as any)?.company || "Unknown";
    const role = (lmp as any)?.role || "Unknown";
    const domain = (lmp as any)?.domain_raw || "—";
    const prepName = (lmp as any)?.prep_poc;
    const supportName = (lmp as any)?.support_poc;

    const subject = `Progress check scheduled: ${company} – ${role} on ${next_date}`;

    const sent: string[] = [];
    const failed: { email: string; error: string }[] = [];

    for (const recipient of recipients) {
      // Personalize greeting per recipient when possible
      let greetingName: string | null = null;
      if (prepName) {
        const prepEmail = await resolveEmailForName(supabase, prepName);
        if (prepEmail && prepEmail.toLowerCase() === recipient.toLowerCase()) greetingName = prepName;
      }
      if (!greetingName && supportName) {
        const supportEmail = await resolveEmailForName(supabase, supportName);
        if (supportEmail && supportEmail.toLowerCase() === recipient.toLowerCase()) greetingName = supportName;
      }
      const greeting = greetingName ? `Hi ${greetingName},` : "Hi,";

      const html = `
        <div style="font-family:-apple-system,Segoe UI,sans-serif; color:#1f2937; max-width:560px;">
          <p>${greeting}</p>
          <p>You scheduled a progress check on <b>${next_date}</b>${reminder_type ? ` (<i>${reminder_type}</i>)` : ""} for this LMP process. We'll email you a reminder that morning if no update is logged.</p>
          <table style="border-collapse:collapse; margin:16px 0; font-size:14px;">
            <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Company</td><td><b>${company}</b></td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Role</td><td>${role}</td></tr>
            <tr><td style="padding:4px 12px 4px 0; color:#6b7280;">Domain</td><td>${domain}</td></tr>
          </table>
          <p><a href="${APP_URL}" style="display:inline-block; background:#f97316; color:#fff; padding:8px 16px; border-radius:6px; text-decoration:none;">Open LMP Magic</a></p>
          <p style="color:#9ca3af; font-size:12px; margin-top:24px;">Confirmation from LMP Magic.</p>
        </div>
      `;
      const text = `${greeting}\nProgress check scheduled on ${next_date} for ${company} – ${role}. Open ${APP_URL}`;

      try {
        await sendGmail({ to: recipient, subject, html, text });
        sent.push(recipient);
      } catch (e: any) {
        failed.push({ email: recipient, error: String(e?.message || e) });
      }
    }

    return new Response(
      JSON.stringify({ ok: sent.length > 0, to: sent, failed: failed.length ? failed : undefined }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-progress-confirmation-email error:", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
