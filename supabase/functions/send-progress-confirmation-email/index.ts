import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { sendGmail } from "../_shared/gmail-send.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { resolveOperationalPocEmails } from "../_shared/resolvePocEmails.ts";


async function resolveEmailForName(supabase: any, name?: string | null): Promise<string | null> {
  const n = (name || "").trim();
  if (!n) return null;
  const { data: pp } = await supabase.from("poc_profiles").select("email, aliases").eq("name", n).maybeSingle();
  if (pp?.email) return String(pp.email).trim();
  const { data: profiles } = await supabase.from("poc_profiles").select("email, aliases");
  for (const p of profiles ?? []) {
    if ((p.aliases || []).some((a: string) => (a || "").trim().toLowerCase() === n.toLowerCase()) && p.email) {
      return String(p.email).trim();
    }
  }
  const { data: pf } = await supabase.from("profiles").select("email").eq("display_name", n).maybeSingle();
  return pf?.email ? String(pf.email).trim() : null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

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
      .select("company, role, domain_raw, prep_poc, support_poc, prep_poc_id, support_poc_id")
      .eq("id", lmp_id)
      .single();

    // Build recipient list — prep + support operational POCs only (never outreach).
    let recipients: string[] = [];
    if (auth.user.role === "admin" && Array.isArray(to_emails) && to_emails.length > 0) {
      recipients = to_emails.filter(Boolean).map((e: string) => String(e).trim());
    } else if (auth.user.role === "admin" && to_email) {
      recipients = [String(to_email).trim()];
    } else {
      recipients = await resolveOperationalPocEmails(
        supabase,
        {
          prep_poc_id: (lmp as any)?.prep_poc_id,
          support_poc_id: (lmp as any)?.support_poc_id,
          prep_poc: (lmp as any)?.prep_poc,
          support_poc: (lmp as any)?.support_poc,
        },
        to_email,
      );
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
    const appUrl = getLmpAppUrl();
    const brand = getBrandName();

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
          <p><a href="${appUrl}" style="display:inline-block; background:#f97316; color:#fff; padding:8px 16px; border-radius:6px; text-decoration:none;">Open ${brand}</a></p>
          <p style="color:#9ca3af; font-size:12px; margin-top:24px;">Confirmation from ${brand}.</p>
        </div>
      `;
      const text = `${greeting}\nProgress check scheduled on ${next_date} for ${company} – ${role}. Open ${appUrl}`;

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
