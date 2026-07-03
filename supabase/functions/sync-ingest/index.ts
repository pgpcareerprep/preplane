// Retired Sheet-to-DB ingest endpoint.
//
// Supabase is authoritative and Google Sheets is a controlled mirror. This
// authenticated compatibility endpoint remains temporarily so old admin UI
// calls receive an explicit, safe response instead of a missing-function error.

import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireRole } from "../_shared/requireAuth.ts";


Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const auth = await requireRole(req, corsHeaders, ["admin", "allocator"]);
  if ("error" in auth) return auth.error;

  return json({
    ok: true,
    skipped: "sheet_to_db_retired",
    message: "Supabase is authoritative. Database changes are mirrored to Sheets through the outbox worker.",
  }, 200, corsHeaders);
});

function json(body: unknown, status = 200, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
