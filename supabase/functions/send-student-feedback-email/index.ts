import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { sendGmail, GMAIL_FROM } from "../_shared/gmail-send.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://lmpmagic.lovable.app",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ ok: false, error: "Unauthorized" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const sessionId = body?.sessionId as string | undefined;
    const origin = (body?.origin as string | undefined) || "https://lmpmagic.lovable.app";
    if (!sessionId) return json({ ok: false, error: "Missing sessionId" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: session, error: sErr } = await admin
      .from("sessions")
      .select("id, student_feedback_token, student_feedback, candidate_ids, student_id, session_type, scheduled_at, mentors:mentor_id(name), lmp:lmp_id(company, role)")
      .eq("id", sessionId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) return json({ ok: false, error: "Session not found" }, 404);
    if (!session.student_feedback_token) return json({ ok: false, error: "No feedback token on session" }, 400);
    if (session.student_feedback && Object.keys(session.student_feedback as object).length > 0) {
      return json({ ok: false, error: "Feedback already submitted" }, 400);
    }

    const ids = Array.from(new Set([
      ...(Array.isArray(session.candidate_ids) ? session.candidate_ids : []),
      ...(session.student_id ? [session.student_id] : []),
    ].filter(Boolean)));
    if (ids.length === 0) return json({ ok: false, error: "No candidate on session" }, 400);

    const { data: students, error: stErr } = await admin
      .from("students")
      .select("id, name, email")
      .in("id", ids as string[]);
    if (stErr) throw stErr;

    const recipients = (students ?? []).filter((s) => s.email && /.+@.+\..+/.test(s.email));
    if (recipients.length === 0) {
      return json({ ok: false, error: "No candidate has an email on file" }, 400);
    }

    const mentorName = (session as any)?.mentors?.name ?? "your mentor";
    const company = (session as any)?.lmp?.company ?? null;
    const role = (session as any)?.lmp?.role ?? null;
    const sessionType = (session as any)?.session_type ?? null;
    const scheduledAt = (session as any)?.scheduled_at ?? null;
    const scheduledLabel = scheduledAt
      ? new Date(scheduledAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })
      : null;
    const link = `${origin.replace(/\/$/, "")}/feedback/${session.student_feedback_token}`;


    const results: Array<{ to: string; ok: boolean; messageId?: string; error?: string }> = [];
    const sessionContextBits = [
      company ? `<b>${escapeHtml(company)}</b>${role ? ` · ${escapeHtml(role)}` : ""}` : null,
      sessionType ? `Session: ${escapeHtml(sessionType)}` : null,
      scheduledLabel ? `Held on ${escapeHtml(scheduledLabel)} IST` : null,
    ].filter(Boolean) as string[];
    const contextBlock = sessionContextBits.length
      ? `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;color:#374151;line-height:1.6;">
          ${sessionContextBits.map((b) => `<div>${b}</div>`).join("")}
        </div>`
      : "";
    const subjectSuffix = company ? ` (${company}${role ? ` · ${role}` : ""})` : "";

    for (const r of recipients) {
      try {
        const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2937;max-width:560px;margin:0 auto;padding:24px;">
          <h2 style="margin:0 0 12px;font-size:20px;">Share your session feedback</h2>
          <p style="margin:0 0 12px;font-size:14px;line-height:1.5;">Hi ${escapeHtml(r.name || "there")},</p>
          <p style="margin:0 0 16px;font-size:14px;line-height:1.5;">Thanks for attending your session with <b>${escapeHtml(mentorName)}</b>. Please take a minute to share your feedback — it helps us improve your mentor matches.</p>
          ${contextBlock}
          <p style="margin:24px 0;text-align:center;">
            <a href="${link}" style="background:#f97316;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:14px;display:inline-block;">Submit feedback</a>
          </p>
          <p style="margin:0 0 8px;font-size:12px;color:#6b7280;">Or open this link: <a href="${link}" style="color:#f97316;">${link}</a></p>
          <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;">This link expires in 30 days.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
          <p style="margin:0;font-size:12px;color:#9ca3af;">Sent by PGP Career Prep · ${GMAIL_FROM}</p>
        </div>`;
        const info = await sendGmail({
          to: r.email!,
          subject: `Share your feedback — session with ${mentorName}${subjectSuffix}`,
          html,
        });
        results.push({ to: r.email!, ok: true, messageId: info.id });
      } catch (e) {
        results.push({ to: r.email!, ok: false, error: String((e as Error)?.message || e) });
      }
    }

    const sent = results.filter((r) => r.ok).length;
    return json({ ok: sent > 0, sent, total: recipients.length, results });

  } catch (err) {
    console.error("send-student-feedback-email error:", err);
    return json({ ok: false, error: String((err as Error)?.message || err) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
