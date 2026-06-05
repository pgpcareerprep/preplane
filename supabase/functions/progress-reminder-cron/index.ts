import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { sendGmail } from "../_shared/gmail-send.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://preplane.netlify.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_BASE_URL = "https://preplane.netlify.app/lmp";

function buildAppUrl(lmpId?: string | null) {
  return lmpId ? `${APP_BASE_URL}/${encodeURIComponent(lmpId)}?tab=Overview` : APP_BASE_URL;
}

function buildEmail(opts: {
  pocName: string | null;
  company: string;
  role: string;
  domain: string;
  status: string;
  nextDate: string;
  reminderType: string | null;
  overdue?: boolean;
  appUrl: string;
}) {
  const overduePrefix = opts.overdue ? "Overdue: " : "Reminder: ";
  const subject = `${overduePrefix}${opts.company} – ${opts.role} progress update due`;
  const greeting = opts.pocName ? `Hi ${opts.pocName},` : "Hi,";
  const overdueLine = opts.overdue
    ? `<p style="margin:0 0 12px 0; color:#b91c1c;">The next expected progress date <b>${opts.nextDate}</b> has passed and no update has been logged yet.</p>`
    : "";
  const html = `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; color:#1f2937; max-width:560px; line-height:1.5;">
      <p>${greeting}</p>
      ${overdueLine}
      <p>This is a gentle reminder to update the progress for your assigned LMP process:</p>
      <table style="border-collapse:collapse; margin:16px 0; font-size:14px;">
        <tr><td style="padding:4px 16px 4px 0; color:#6b7280;">Company</td><td style="padding:4px 0;"><b>${opts.company}</b></td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#6b7280;">Role</td><td style="padding:4px 0;">${opts.role}</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#6b7280;">Domain</td><td style="padding:4px 0;">${opts.domain}</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#6b7280;">Current Status</td><td style="padding:4px 0;">${opts.status}</td></tr>
        <tr><td style="padding:4px 16px 4px 0; color:#6b7280;">Next Progress Date</td><td style="padding:4px 0;">${opts.nextDate}</td></tr>
      </table>
      <p>Please log today's update in LMP Magic so the process remains updated and visible to the team.</p>
      <p style="margin:20px 0;"><a href="${opts.appUrl}" style="display:inline-block; background:#f97316; color:#fff; padding:10px 20px; border-radius:6px; text-decoration:none; font-weight:500;">Open LMP Magic</a></p>
      <p style="margin-top:24px;">Regards,<br/>LMP Magic</p>
    </div>
  `;
  const overdueText = opts.overdue
    ? `The next expected progress date ${opts.nextDate} has passed and no update has been logged yet.\n\n`
    : "";
  const text = `${greeting}\n\n${overdueText}This is a gentle reminder to update the progress for your assigned LMP process:\n\nCompany: ${opts.company}\nRole: ${opts.role}\nDomain: ${opts.domain}\nCurrent Status: ${opts.status}\nNext Progress Date: ${opts.nextDate}\n\nPlease log today's update in LMP Magic so the process remains updated and visible to the team.\n\nOpen LMP Magic: ${opts.appUrl}\n\nRegards,\nLMP Magic`;
  return { subject, html, text };
}

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let body: { force_lmp_id?: string } = {};
  try {
    if (req.method === "POST") body = await req.json().catch(() => ({}));
  } catch {
    body = {};
  }
  const forceLmpId = body.force_lmp_id;

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read schedule config
    const { data: settingsRow } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "reminder_schedule")
      .single();

    const schedule = settingsRow?.value as {
      time: string;
      timezone: string;
      days: string[];
      enabled: boolean;
    } | null;

    const tz = schedule?.timezone || "Asia/Kolkata";
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: tz }));
    const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
    const todayDay = dayNames[nowLocal.getDay()];
    const today = nowLocal.toISOString().slice(0, 10);

    // Gate scheduled runs by enabled / day / time window. Forced runs bypass.
    if (!forceLmpId) {
      if (!schedule || !schedule.enabled) {
        return new Response(JSON.stringify({ message: "Reminders disabled" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!schedule.days.includes(todayDay)) {
        return new Response(JSON.stringify({ message: `Not an active day (${todayDay})` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const scheduleTime = schedule.time || "11:00:00";
      const [schedHour, schedMin] = scheduleTime.split(":").map(Number);
      const schedTotalMin = schedHour * 60 + schedMin;
      const currentTotalMin = nowLocal.getHours() * 60 + nowLocal.getMinutes();
      const minDiff = Math.abs(currentTotalMin - schedTotalMin);
      if (minDiff >= 5) {
        return new Response(
          JSON.stringify({
            message: `Outside time window (${scheduleTime} ±4 min)`,
            currentTime: `${nowLocal.getHours()}:${nowLocal.getMinutes()}`,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Find pending reminders. Forced: only that LMP. Scheduled: today + overdue.
    let q = supabase.from("lmp_progress_reminders").select("*").eq("status", "pending");
    if (forceLmpId) {
      q = q.eq("lmp_id", forceLmpId);
    } else {
      q = q.lte("next_progress_date", today);
    }
    const { data: reminders, error: remErr } = await q;

    if (remErr) {
      console.error("Failed to fetch reminders:", remErr);
      return new Response(JSON.stringify({ error: remErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ message: "No reminders to process", date: today, forced: !!forceLmpId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Array<{ lmp_id: string; action: string }> = [];

    for (const reminder of reminders) {
      // Atomic claim — only one invocation can transition pending -> processing.
      // Skip silently if another concurrent run already grabbed this row.
      if (!forceLmpId) {
        const { data: claimed, error: claimErr } = await supabase
          .from("lmp_progress_reminders")
          .update({ status: "processing" })
          .eq("id", reminder.id)
          .eq("status", "pending")
          .select("id");
        if (claimErr || !claimed || claimed.length === 0) {
          results.push({ lmp_id: reminder.lmp_id, action: "skipped (already claimed)" });
          continue;
        }
      }

      const { data: lmp, error: lmpErr } = await supabase
        .from("lmp_processes")
        .select("id, company, role, domain_raw, status, reminder_version, prep_poc, support_poc, next_progress_date")
        .eq("id", reminder.lmp_id)
        .single();
      if (lmpErr) console.error(`[REMINDER] LMP lookup failed for ${reminder.lmp_id}:`, lmpErr);

      if (!forceLmpId && (!lmp || (lmp as any).reminder_version !== reminder.reminder_version)) {
        await supabase
          .from("lmp_progress_reminders")
          .update({ status: "cancelled" })
          .eq("id", reminder.id);
        results.push({ lmp_id: reminder.lmp_id, action: "cancelled (version mismatch)" });
        continue;
      }

      // Skip if a progress_update already happened after the reminder was created (non-forced only)
      if (!forceLmpId) {
        const { data: updates } = await supabase
          .from("lmp_daily_logs")
          .select("id")
          .eq("lmp_id", reminder.lmp_id)
          .eq("entry_type", "progress")
          .gte("created_at", reminder.created_at)
          .limit(1);
        if (updates && updates.length > 0) {
          await supabase
            .from("lmp_progress_reminders")
            .update({ status: "skipped" })
            .eq("id", reminder.id);
          results.push({ lmp_id: reminder.lmp_id, action: "skipped (progress updated)" });
          continue;
        }
      }

      const prepName = (lmp as any)?.prep_poc;
      const supportName = (lmp as any)?.support_poc;

      const resolveEmail = async (name?: string | null): Promise<string | null> => {
        const n = (name || "").trim();
        if (!n) return null;
        const { data: pp } = await supabase.from("poc_profiles").select("email").eq("name", n).maybeSingle();
        if (pp?.email) return String(pp.email).trim();
        const { data: pf } = await supabase.from("profiles").select("email").eq("display_name", n).maybeSingle();
        return pf?.email ? String(pf.email).trim() : null;
      };

      const prepEmail = await resolveEmail(prepName);
      const supportEmail = await resolveEmail(supportName);

      // Dedupe (case-insensitive). Fall back to legacy reminder.poc_email if both lookups fail.
      const seen = new Set<string>();
      let recipients: string[] = [prepEmail, supportEmail].filter(Boolean) as string[];
      recipients = recipients.filter((e) => {
        const k = e.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (recipients.length === 0 && reminder.poc_email) {
        recipients = [reminder.poc_email];
      }

      const company = (lmp as any)?.company || "Unknown";
      const role = (lmp as any)?.role || "Unknown";
      const domain = (lmp as any)?.domain_raw || "Unknown";
      const lmpStatus = (lmp as any)?.status || "Unknown";

      if (recipients.length === 0) {
        await supabase
          .from("lmp_progress_reminders")
          .update({ status: "sent", sent_at: new Date().toISOString(), poc_email: null })
          .eq("id", reminder.id);
        results.push({ lmp_id: reminder.lmp_id, action: "skipped (no email resolved)" });
        continue;
      }

      const isOverdue = !forceLmpId && reminder.next_progress_date < today;

      const sentTo: string[] = [];
      const failedTo: string[] = [];
      for (const recipient of recipients) {
        // Personalize greeting per recipient when possible
        let greetingName: string | null = null;
        if (prepEmail && prepEmail.toLowerCase() === recipient.toLowerCase()) greetingName = prepName || null;
        else if (supportEmail && supportEmail.toLowerCase() === recipient.toLowerCase()) greetingName = supportName || null;

        const { subject, html, text } = buildEmail({
          pocName: greetingName,
          company,
          role,
          domain,
          status: lmpStatus,
          nextDate: reminder.next_progress_date,
          reminderType: (reminder as any).reminder_type || null,
          overdue: isOverdue,
          appUrl: buildAppUrl((lmp as any)?.id || reminder.lmp_id),
        });

        try {
          await sendGmail({ to: recipient, subject, html, text });
          sentTo.push(recipient);
        } catch (sendErr) {
          console.error(`[REMINDER] Send failed for ${recipient}:`, sendErr);
          failedTo.push(recipient);
        }
      }

      if (!forceLmpId) {
        if (sentTo.length > 0) {
          await supabase
            .from("lmp_progress_reminders")
            .update({ status: "sent", sent_at: new Date().toISOString(), poc_email: sentTo.join(", ") })
            .eq("id", reminder.id);
        } else {
          await supabase
            .from("lmp_progress_reminders")
            .update({ status: "failed", poc_email: failedTo.join(", ") || null })
            .eq("id", reminder.id);
        }
      }

      const summary = sentTo.length > 0
        ? `sent to ${sentTo.join(", ")}${failedTo.length ? ` (failed: ${failedTo.join(", ")})` : ""}${isOverdue ? " (overdue)" : ""}${forceLmpId ? " (forced)" : ""}`
        : `failed for ${failedTo.join(", ")}`;
      results.push({ lmp_id: reminder.lmp_id, action: summary });
    }

    return new Response(
      JSON.stringify({ date: today, forced: !!forceLmpId, processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Reminder cron error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
