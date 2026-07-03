// One-shot backfill: stamp the human-readable `lmp_code` (e.g. "LMP-2026-16021")
// into the "LMP ID" column of the LMP Tracker sheet. Overwrites any row that
// currently holds a UUID (legacy stamp) or has a blank/legacy value, as long as
// a unique Company+Role match exists in lmp_processes.
//
// Invoke: POST /sheets-backfill-lmp-id  (admin only)
// Returns: { matched, updated, skipped_duplicates, missing_in_db, already_ok }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAdminOrInternal } from "../_shared/requireAuth.ts";

const HEADER_ROW = 15;
const TAB = "LMP Tracker";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = await requireAdminOrInternal(req, corsHeaders);
  if ("error" in auth) return auth.error;

  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
  let SPREADSHEET_ID = Deno.env.get("LMP_SPREADSHEET_ID") ?? "";
  const m = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9_-]+)/);
  SPREADSHEET_ID = m ? m[1] : SPREADSHEET_ID.split("/")[0].split("?")[0];

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
  const gHeaders = { "Content-Type": "application/json" };

  try {
    // 1. Pull entire LMP Tracker sheet.
    const range = `'${TAB}'!A${HEADER_ROW}:ZZ10000`;
    const getRes = await fetch(
      `${baseUrl}/values:batchGet?ranges=${encodeURIComponent(range)}&valueRenderOption=FORMATTED_VALUE&key=${GOOGLE_API_KEY}`,
      { headers: gHeaders },
    );
    if (!getRes.ok) {
      const t = await getRes.text();
      return json({ error: `batchGet failed [${getRes.status}]: ${t.slice(0, 300)}` }, 500, corsHeaders);
    }
    const getJson = await getRes.json();
    const rows: string[][] = (getJson.valueRanges?.[0]?.values ?? []);
    if (rows.length < 2) return json({ error: "Sheet appears empty" }, 400, corsHeaders);

    const headers = rows[0];
    const lmpIdCol = headers.indexOf("LMP ID");
    const companyCol = headers.indexOf("Company");
    const roleCol = headers.indexOf("Role");
    if (lmpIdCol === -1 || companyCol === -1 || roleCol === -1) {
      return json({ error: "Sheet missing required columns (LMP ID / Company / Role)" }, 400, corsHeaders);
    }

    // 2. Pull all DB processes; build a Company+Role → [{id, lmp_code}] map.
    const { data: dbRows } = await sb.from("lmp_processes").select("id, lmp_code, company, role");
    const byKey = new Map<string, { id: string; lmp_code: string | null }[]>();
    for (const r of dbRows ?? []) {
      const k = `${(r.company ?? "").trim().toLowerCase()}||${(r.role ?? "").trim().toLowerCase()}`;
      if (!k.startsWith("||")) {
        const arr = byKey.get(k) ?? [];
        arr.push({ id: r.id, lmp_code: r.lmp_code });
        byKey.set(k, arr);
      }
    }

    // 3. For each sheet row, decide whether the LMP ID cell needs to be
    //    overwritten with the canonical lmp_code. Cells already holding the
    //    correct lmp_code are left alone.
    const LMP_CODE_RE = /^LMP-\d{4}-\d{4,}$/i;
    const updates: { range: string; values: string[][] }[] = [];
    let skippedDuplicates = 0;
    let missingInDb = 0;
    let alreadyOk = 0;

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const existing = (row[lmpIdCol] ?? "").trim();
      const company = (row[companyCol] ?? "").trim();
      const role = (row[roleCol] ?? "").trim();
      if (!company || !role) continue;
      const key = `${company.toLowerCase()}||${role.toLowerCase()}`;
      const matches = byKey.get(key) ?? [];
      if (matches.length === 0) { missingInDb++; continue; }
      if (matches.length > 1) { skippedDuplicates++; continue; }
      const canonical = matches[0].lmp_code ?? "";
      if (!canonical) { missingInDb++; continue; }
      if (existing && LMP_CODE_RE.test(existing) && existing.toLowerCase() === canonical.toLowerCase()) {
        alreadyOk++;
        continue;
      }
      const sheetRowNum = HEADER_ROW + i; // 1-indexed
      const colLetter = colToLetter(lmpIdCol);
      updates.push({
        range: `'${TAB}'!${colLetter}${sheetRowNum}:${colLetter}${sheetRowNum}`,
        values: [[canonical]],
      });
    }

    if (updates.length === 0) {
      return json({
        matched: rows.length - 1,
        updated: 0,
        already_ok: alreadyOk,
        skipped_duplicates: skippedDuplicates,
        missing_in_db: missingInDb,
        message: "Nothing to backfill",
      });
    }

    // 4. Apply via batchUpdate (chunks of 500).
    const CHUNK = 500;
    let updated = 0;
    for (let i = 0; i < updates.length; i += CHUNK) {
      const slice = updates.slice(i, i + CHUNK);
      const { getGoogleAccessToken } = await import("../_shared/googleAuth.ts");
      const writeToken = await getGoogleAccessToken(["https://www.googleapis.com/auth/spreadsheets"]);
      const upRes = await fetch(`${baseUrl}/values:batchUpdate`, {
        method: "POST",
        headers: { ...gHeaders, Authorization: `Bearer ${writeToken}` },
        body: JSON.stringify({
          valueInputOption: "RAW",
          data: slice.map((d) => ({ ...d, majorDimension: "ROWS" })),
        }),
      });
      if (!upRes.ok) {
        const t = await upRes.text();
        return json({ error: `batchUpdate failed [${upRes.status}]: ${t.slice(0, 300)}`, updated }, 500, corsHeaders);
      }
      updated += slice.length;
    }

    return json({
      matched: rows.length - 1,
      updated,
      already_ok: alreadyOk,
      skipped_duplicates: skippedDuplicates,
      missing_in_db: missingInDb,
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, corsHeaders);
  }
});

function colToLetter(zeroBasedIdx: number): string {
  let n = zeroBasedIdx + 1;
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function json(data: unknown, status = 200, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
