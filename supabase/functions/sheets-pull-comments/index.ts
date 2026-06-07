// Pulls the "Comment" column from the LMP Tracker sheet and writes it
// into public.lmp_processes.comments keyed by lmp_code (LMP ID column).
// One-way sync: Sheet → DB. Uses SA OAuth token (not API key) to avoid
// HTTP-referrer restrictions on the API key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { pickAllowedOrigin } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { getGoogleAccessToken } from "../_shared/googleAuth.ts";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";

Deno.serve(async (req: Request) => {
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": pickAllowedOrigin(req),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";
  let isInternal = SERVICE_ROLE_KEY !== "" && bearer === SERVICE_ROLE_KEY;

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    SERVICE_ROLE_KEY,
  );

  if (!isInternal && bearer) {
    try {
      const { data: tokenRow } = await serviceClient
        .from("_internal_cron_auth")
        .select("token")
        .eq("id", true)
        .maybeSingle();
      if (tokenRow?.token && tokenRow.token === bearer) isInternal = true;
    } catch (_e) { /* fall through */ }
  }

  if (!isInternal) {
    const auth = await requireAuth(req, corsHeaders);
    if ("error" in auth) return auth.error;
  }

  let SPREADSHEET_ID = Deno.env.get("LMP_SPREADSHEET_ID") ?? "";
  if (!SPREADSHEET_ID) {
    return json({ error: "LMP_SPREADSHEET_ID not configured" }, 500, corsHeaders);
  }
  const idMatch = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9_-]+)/);
  SPREADSHEET_ID = idMatch ? idMatch[1] : SPREADSHEET_ID.split("/")[0].split("?")[0];

  // Use SA OAuth token (avoids HTTP referrer restrictions on the API key).
  let token: string;
  try {
    token = await getGoogleAccessToken([SHEETS_SCOPE]);
  } catch (e) {
    return json({ error: `SA token error: ${(e as Error).message}` }, 500, corsHeaders);
  }

  // Read header row (row 15) + data rows. Columns Z (Comment) + AA (LMP ID).
  const range = `'LMP Tracker'!Z15:AA10000`;
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`;
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) {
    const body = await resp.text();
    return json({ error: "Sheets fetch failed", status: resp.status, body }, 502, corsHeaders);
  }
  const data = await resp.json() as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length === 0) {
    return json({ ok: true, scanned: 0, updated: 0, errors: 0 }, 200, corsHeaders);
  }

  // Row 0 is header row (Z15/AA15). Confirm the headers we expect.
  const header = rows[0] ?? [];
  const commentsHeader = (header[0] ?? "").toString().trim().toLowerCase();
  const lmpIdHeader = (header[1] ?? "").toString().trim().toLowerCase();
  if (!commentsHeader.startsWith("comment") || lmpIdHeader !== "lmp id") {
    return json({
      error: "Unexpected headers at Z15/AA15",
      expected: { Z15: "Comments", AA15: "LMP ID" },
      got: { Z15: header[0], AA15: header[1] },
    }, 400, corsHeaders);
  }

  // Collect (lmp_code -> comment) pairs (skip empty lmp_code).
  const pairs: { lmp_code: string; comment: string }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const comment = (row[0] ?? "").toString();
    const lmp_code = (row[1] ?? "").toString().trim();
    if (!lmp_code) continue;
    pairs.push({ lmp_code, comment });
  }

  if (pairs.length === 0) {
    return json({ ok: true, scanned: rows.length - 1, updated: 0, errors: 0 }, 200, corsHeaders);
  }

  // Load current comments for those codes.
  const codes = pairs.map((p) => p.lmp_code);
  const { data: existing, error: selErr } = await serviceClient
    .from("lmp_processes")
    .select("lmp_code, comments")
    .in("lmp_code", codes);
  if (selErr) return json({ error: selErr.message }, 500, corsHeaders);

  const currentByCode = new Map<string, string>();
  (existing ?? []).forEach((r: { lmp_code: string; comments: string | null }) => {
    currentByCode.set(r.lmp_code, r.comments ?? "");
  });

  let updated = 0;
  let errors = 0;
  const errorDetails: { lmp_code: string; error: string }[] = [];

  // Line-level merge: union of existing DB lines + sheet lines, preserving
  // order (DB first, then any genuinely new sheet line). Never shrinks.
  // Sheet lines that don't already carry a [timestamp] prefix are attributed
  // to "Abhinav Arora" (the designated sheet commentor) so they render
  // correctly in the comments drawer UI.
  const TIMESTAMP_PREFIX = /^\[\d{4}-\d{2}-\d{2}/;
  const AUTHOR_PREFIX = /^[^:]+:\s/; // "Name: text"
  const nowIso = () => new Date().toISOString();
  const formatSheetLine = (raw: string): string => {
    const trimmed = raw.trim();
    if (TIMESTAMP_PREFIX.test(trimmed)) return trimmed; // already formatted
    if (AUTHOR_PREFIX.test(trimmed)) {
      // Has "Name: text" but no timestamp — add one
      return `[${nowIso()}] ${trimmed}`;
    }
    return `[${nowIso()}] Abhinav Arora: ${trimmed}`;
  };
  // Strip [timestamp] and Author: prefix to get raw content for dedup comparison.
  // DB lines are stored as "[timestamp] Author: text"; sheet lines may be raw.
  // Comparing stripped content prevents infinite re-insertion on every poll.
  const stripForDedup = (s: string): string => {
    const t = s.trim();
    const noTs = TIMESTAMP_PREFIX.test(t) ? t.replace(/^\[[^\]]+\]\s*/, "") : t;
    const noAuth = AUTHOR_PREFIX.test(noTs) ? noTs.replace(/^[^:]+:\s*/, "") : noTs;
    return noAuth.trim().toLowerCase().replace(/\s+/g, " ");
  };
  for (const { lmp_code, comment } of pairs) {
    if (!currentByCode.has(lmp_code)) continue;
    const dbVal = currentByCode.get(lmp_code) ?? "";
    const dbLines = dbVal.split(/\r?\n/);
    const dbContentSet = new Set(dbLines.map(stripForDedup).filter(Boolean));
    const rawNewLines = comment
      .split(/\r?\n/)
      .filter((l) => l.trim() !== "" && !dbContentSet.has(stripForDedup(l)));
    if (rawNewLines.length === 0) continue;
    const newSheetLines = rawNewLines.map(formatSheetLine);
    const merged = (dbVal.trim() === "" ? "" : dbVal + "\n") + newSheetLines.join("\n");
    const { error: updErr } = await serviceClient
      .from("lmp_processes")
      .update({ comments: merged, sync_source: "sheet" })
      .eq("lmp_code", lmp_code);
    if (updErr) {
      errors++;
      errorDetails.push({ lmp_code, error: updErr.message });
    } else {
      updated++;
    }
  }

  return json({
    ok: true,
    scanned: pairs.length,
    updated,
    errors,
    errorDetails: errorDetails.slice(0, 10),
  }, 200, corsHeaders);
});

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
