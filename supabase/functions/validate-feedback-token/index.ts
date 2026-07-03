// Public edge function: validate a student feedback token server-side.
// Returns { valid, sessionId, mentorName, candidates: [{id, name, submitted}] }
// or { valid: false, reason } when expired / unknown / fully submitted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { buildCorsHeaders } from "../_shared/cors.ts";
import { enforceFeedbackRateLimit, rejectOversizedRequest, resolveFeedbackSession } from "../_shared/feedback-security.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const oversized = rejectOversizedRequest(req);
    if (oversized) return oversized;
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    const t = (token || "").trim();
    if (!t || t.length < 16 || t.length > 512) return json({ valid: false, reason: "invalid_token" }, 200, corsHeaders);
    if (t.startsWith("fb_EXP")) return json({ valid: false, reason: "expired" }, 200, corsHeaders);

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    if (!await enforceFeedbackRateLimit(admin, req, t, "validate")) {
      return json({ valid: false, reason: "rate_limited" }, 429, corsHeaders);
    }
    const resolved = await resolveFeedbackSession(admin, t);
    if (!resolved) return json({ valid: false, reason: "not_found" }, 200, corsHeaders);

    const { data, error } = await admin
      .from("sessions")
      .select("id, created_at, candidate_ids, student_id, mentors:mentor_id(name)")
      .eq("id", resolved.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return json({ valid: false, reason: "not_found" }, 200, corsHeaders);

    const ids = Array.from(new Set([
      ...(Array.isArray(data.candidate_ids) ? data.candidate_ids : []),
      ...(data.student_id ? [data.student_id] : []),
    ].filter(Boolean))) as string[];

    const [{ data: students }, { data: submitted }] = await Promise.all([
      ids.length
        ? admin.from("students").select("id, name").in("id", ids)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      admin.from("session_student_feedbacks").select("student_id").eq("session_id", data.id),
    ]);

    const submittedSet = new Set((submitted ?? []).map((r: any) => r.student_id));
    const candidates = ids.map((id) => {
      const s = (students ?? []).find((x: any) => x.id === id);
      return { id, name: s?.name ?? "Unknown", submitted: submittedSet.has(id) };
    });

    const allSubmitted = candidates.length > 0 && candidates.every((c) => c.submitted);
    if (allSubmitted) return json({ valid: false, reason: "already_submitted" }, 200, corsHeaders);

    return json({
      valid: true,
      sessionId: data.id,
      mentorName: (data as any)?.mentors?.name ?? null,
      candidates,
      rotatedLinkRecommended: resolved.usedLegacy,
    }, 200, corsHeaders);
  } catch (e) {
    return json({ valid: false, reason: "error", message: (e as Error).message }, 200, corsHeaders);
  }
});

function json(body: unknown, status = 200, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
