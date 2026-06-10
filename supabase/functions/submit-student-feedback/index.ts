// Public edge function: anonymous student submits feedback for a session
// via their shared link token. Writes a per-candidate row into
// session_student_feedbacks (one row per student per session).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { pickAllowedOrigin } from "../_shared/cors.ts";
import { enforceFeedbackRateLimit, rejectOversizedRequest, resolveFeedbackSession } from "../_shared/feedback-security.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const oversized = rejectOversizedRequest(req);
    if (oversized) return oversized;
    const body = (await req.json().catch(() => ({}))) as {
      token?: string;
      studentId?: string;
      feedback?: Record<string, unknown>;
      rating?: number | null;
    };
    const token = (body.token || "").trim();
    const studentId = (body.studentId || "").trim();
    if (!token || token.length < 16 || token.length > 512 || !studentId || !body.feedback || typeof body.feedback !== "object" || Array.isArray(body.feedback)) {
      return json({ ok: false, error: "missing_fields" }, 400);
    }
    if (body.rating != null && (!Number.isFinite(body.rating) || body.rating < 1 || body.rating > 5)) {
      return json({ ok: false, error: "invalid_rating" }, 400);
    }
    if (JSON.stringify(body.feedback).length > 20_000) {
      return json({ ok: false, error: "feedback_too_large" }, 413);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    if (!await enforceFeedbackRateLimit(admin, req, token, "submit")) {
      return json({ ok: false, error: "rate_limited" }, 429);
    }
    const resolved = await resolveFeedbackSession(admin, token);
    if (!resolved) return json({ ok: false, error: "not_found" }, 404);

    const { data: session, error: sErr } = await admin
      .from("sessions")
      .select("id, candidate_ids, student_id")
      .eq("id", resolved.id)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session?.id) return json({ ok: false, error: "not_found" }, 404);

    const candidateIds = new Set<string>([
      ...(Array.isArray(session.candidate_ids) ? session.candidate_ids : []),
      ...(session.student_id ? [session.student_id] : []),
    ].filter(Boolean) as string[]);
    if (!candidateIds.has(studentId)) {
      return json({ ok: false, error: "invalid_candidate" }, 400);
    }

    // Already submitted?
    const { data: existing } = await admin
      .from("session_student_feedbacks")
      .select("id")
      .eq("session_id", session.id)
      .eq("student_id", studentId)
      .maybeSingle();
    if (existing?.id) return json({ ok: false, error: "already_submitted" }, 409);

    // Derive a rating (1-5) from feedback values if not explicitly passed.
    let rating: number | null = typeof body.rating === "number" ? body.rating : null;
    if (rating == null) {
      const ratings: number[] = [];
      for (const v of Object.values(body.feedback)) {
        if (typeof v === "number" && v >= 1 && v <= 5) ratings.push(v);
      }
      if (ratings.length) rating = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    }

    const { error: insErr } = await admin
      .from("session_student_feedbacks")
      .insert({
        session_id: session.id,
        student_id: studentId,
        feedback: body.feedback,
        student_rating: rating,
        mentor_rating: rating,
      });
    if (insErr) throw insErr;

    // Best-effort: keep the parent session's aggregate rating in sync so
    // legacy mentor cards keep working.
    const { data: allRows } = await admin
      .from("session_student_feedbacks")
      .select("mentor_rating, feedback")
      .eq("session_id", session.id);
    const nums = (allRows ?? [])
      .map((r) => (typeof r.mentor_rating === "number" ? r.mentor_rating : null))
      .filter((n): n is number => n != null);
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
    await admin
      .from("sessions")
      .update({
        student_feedback: { rating: avg, lastSubmittedAt: new Date().toISOString() },
        student_rating: avg,
      })
      .eq("id", session.id);

    return json({ ok: true });
  } catch (e) {
    console.error("submit-student-feedback error:", e);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
