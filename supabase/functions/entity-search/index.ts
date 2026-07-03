// Entity search for @mention autocomplete in Copilot.
// Live UNION across source tables (entity_registry was dropped in Phase 5).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { searchEntities } from "../_shared/entitySearch.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) return auth.error;

  let body: { query?: string; types?: string[]; entity_types?: string[]; limit?: number };
  try { body = await req.json(); } catch { body = {}; }

  try {
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    // Accept both `entity_types` (sent by GlobalSearch) and `types` (legacy) as aliases.
    const rawTypes = body.entity_types ?? body.types;
    const results = await searchEntities(userClient, {
      query: String(body.query ?? ""),
      types: Array.isArray(rawTypes) ? rawTypes.filter((t) => typeof t === "string") : undefined,
      limit: body.limit,
    });
    const trimmed = results.map((r) => ({
      entity_type: r.entity_type,
      entity_id: r.entity_id,
      display_name: r.display_name,
      email: r.email,
      domain: r.domain,
      metadata: r.metadata,
    }));
    return new Response(JSON.stringify({ results: trimmed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message), results: [] }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
