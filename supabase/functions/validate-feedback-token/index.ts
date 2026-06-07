// Public edge function: validate a student feedback token server-side.
// Returns { valid, sessionId, mentorName, candidates: [{id, name, submitted}] }
// or { valid: false, reason } when expired / unknown / fully submitted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://preplane.pages.dev",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

Deno.serve(async (req) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { token } = (await req.json().catch(() => ({}))) as { token?: string };
    const t = (token || "").trim();
    if (!t) return json({ valid: false, reason: "invalid_token" });
    if (t.startsWith("fb_EXP")) return json({ valid: false, reason: "expired" });

    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);

    const { data, error } = await admin
      .from("sessions")
      .select("id, created_at, candidate_ids, student_id, mentors:mentor_id(name)")
      .eq("student_feedback_token", t)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return json({ valid: false, reason: "not_found" });

    if (data.created_at && Date.now() - new Date(data.created_at).getTime() > TOKEN_TTL_MS) {
      return json({ valid: false, reason: "expired" });
    }

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
    if (allSubmitted) return json({ valid: false, reason: "already_submitted" });

    return json({
      valid: true,
      sessionId: data.id,
      mentorName: (data as any)?.mentors?.name ?? null,
      candidates,
    });
  } catch (e) {
    return json({ valid: false, reason: "error", message: (e as Error).message }, 200);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
