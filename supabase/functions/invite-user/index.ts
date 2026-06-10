// Edge function: invite-user
// Admin-only. Creates an auth user via admin API and pre-fills profile role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
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
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: who } = await userClient.auth.getUser();
    if (!who?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Admin check
    const { data: profile } = await userClient
      .from("profiles")
      .select("role")
      .eq("user_id", who.user.id)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "Forbidden — admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const { name, email, role } = body as { name?: string; email?: string; role?: string };
    const cleanEmail = (email ?? "").trim().toLowerCase();
    const cleanName = (name ?? "").trim();
    const cleanRole = (role ?? "poc").toLowerCase();

    if (!cleanEmail || !cleanName) {
      return new Response(JSON.stringify({ error: "name and email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["admin", "allocator", "poc", "allocator"].includes(cleanRole)) {
      return new Response(JSON.stringify({ error: "invalid role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(url, serviceKey);

    // BUG-R3: dedupe + 60s cooldown per email so admins can't spam invites.
    const { data: existing } = await admin
      .from("profiles")
      .select("user_id, updated_at, access_status")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (existing?.user_id && existing.access_status === "approved") {
      // Already a real, approved account — don't re-invite.
      return new Response(
        JSON.stringify({ error: "A user with this email already has an active account." }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (existing?.updated_at) {
      const ageMs = Date.now() - new Date(existing.updated_at).getTime();
      if (ageMs < 60_000) {
        const wait = Math.ceil((60_000 - ageMs) / 1000);
        return new Response(
          JSON.stringify({ error: `Please wait ${wait}s before re-inviting this email.` }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Pre-create the profile so the role is set when handle_new_user fires.
    const { error: profErr } = await admin.from("profiles").upsert(
      {
        display_name: cleanName,
        email: cleanEmail,
        role: cleanRole,
        access_status: "approved",
        is_active: true,
      },
      { onConflict: "email" },
    );
    if (profErr) throw profErr;

    // Matching poc_profiles row is created automatically by the
    // trg_sync_profile_to_poc trigger on the profiles table.

    // Send invite email
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
      data: { full_name: cleanName, role: cleanRole },
    });
    if (inviteErr && !`${inviteErr.message}`.toLowerCase().includes("already")) {
      throw inviteErr;
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
