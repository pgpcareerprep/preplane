// Retired Sheet-to-DB ingest endpoint.
//
// Supabase is authoritative and Google Sheets is a controlled mirror. This
// authenticated compatibility endpoint remains temporarily so old admin UI
// calls receive an explicit, safe response instead of a missing-function error.

import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
import { pickAllowedOrigin } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const auth = await requireRole(req, corsHeaders, ["admin", "allocator"]);
  if ("error" in auth) return auth.error;

  return json({
    ok: true,
    skipped: "sheet_to_db_retired",
    message: "Supabase is authoritative. Database changes are mirrored to Sheets through the outbox worker.",
  });
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
