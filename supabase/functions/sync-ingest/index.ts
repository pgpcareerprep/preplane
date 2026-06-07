import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "https://preplane.pages.dev",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYNC_COOLDOWN_MS = 60_000;
// NOTE: cooldown is enforced via the sheets_sync_log table only.
// Module-level state is unsafe — every cold start would reset it and let
// concurrent invocations both run a full sync.

Deno.serve((req: Request) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  // Sheet → DB ingest is permanently disabled. LMP Tracker is a one-way DB → Sheet mirror.
  return new Response(
    JSON.stringify({
      ok: true,
      skipped: "sheet_to_db_disabled",
      message: "LMP Tracker sync is unidirectional (DB → Sheet). Sheet → DB ingest is disabled.",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});

// Legacy handler retained as dead code so re-enabling sheet → DB is a single-commit revert.
const _legacyHandler = async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }


  // Allow trusted internal/scheduled invocations. The DB-side cron job reads a
  // shared token from public._internal_cron_auth (RLS-locked, service-role-only)
  // and passes it as Bearer. Service-role key is also accepted. All other
  // callers must be an authenticated admin/allocator.
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const bearer = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  let isInternalCron = SERVICE_ROLE_KEY !== "" && bearer === SERVICE_ROLE_KEY;
  if (!isInternalCron && bearer) {
    try {
      const probe = createClient(Deno.env.get("SUPABASE_URL")!, SERVICE_ROLE_KEY);
      const { data: tokenRow } = await probe
        .from("_internal_cron_auth")
        .select("token")
        .eq("id", true)
        .maybeSingle();
      if (tokenRow?.token && tokenRow.token === bearer) isInternalCron = true;
    } catch (_e) { /* fall through to user auth */ }
  }

  if (!isInternalCron) {
    const auth = await requireAuth(req, corsHeaders, { requireRoles: ["admin", "allocator"] });
    if ("error" in auth) return auth.error;
  }

  const GOOGLE_API_KEY = Deno.env.get("GOOGLE_API_KEY") ?? "";
  let SPREADSHEET_ID = Deno.env.get("LMP_SPREADSHEET_ID") ?? "";
  if (!SPREADSHEET_ID) return jsonError("LMP_SPREADSHEET_ID not configured", 500);
  const idMatch = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (idMatch) SPREADSHEET_ID = idMatch[1];
  else SPREADSHEET_ID = SPREADSHEET_ID.split("/")[0].split("?")[0];

  const gHeaders = { "Content-Type": "application/json" };
  const _GOOGLE_API_KEY = GOOGLE_API_KEY; // available for sheet reads via ?key=

  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

  // Parse request
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body = full sync */ }
  const scope = (body.scope as string) || "full";
  // Optional since-filter for incremental polls. When provided, we still scan
  // the sheet (Sheets API has no row-level mtime) but tag each upserted row
  // with `sync_source = "sheet"` and rely on the client-side cooldown to skip
  // pushing the same value back. The timestamp is recorded on sheets_sync_log.
  const since = typeof body.since === "string" ? body.since : null;

  try {
    const stats = { students: 0, lmp_processes: 0, lmp_total_in_sheet: 0, lmp_candidates: 0, poc_profiles: 0, poc_assignments: 0, domains_updated: 0, unmapped: 0, conflicts: 0, lmp_deleted: 0, students_deleted: 0, lmp_upsert_errors: 0 };
    const isFullSync = scope === "full" && !since;

    // ── DB-backed cooldown + concurrency claim ──
    // Read the last sync timestamp from sheets_sync_log (single source of truth).
    // If a recent sync exists OR another invocation just claimed the slot, bail out.
    const { data: lastSyncRow } = await serviceClient
      .from("sheets_sync_log")
      .select("last_synced_at")
      .eq("tab_name", "sync-ingest")
      .maybeSingle();
    const lastSyncedAt = lastSyncRow?.last_synced_at ? new Date(lastSyncRow.last_synced_at).getTime() : 0;
    if (lastSyncedAt && Date.now() - lastSyncedAt < SYNC_COOLDOWN_MS) {
      return jsonOk({ success: false, skipped: true, reason: "RECENT_SYNC", lastSyncedAt: lastSyncRow?.last_synced_at, message: "Existing database data is already current from a recent sync." });
    }
    // Claim the slot immediately so a second concurrent invocation sees a recent
    // last_synced_at and skips. The terminal upsert at the end records the real
    // completion timestamp.
    await serviceClient.from("sheets_sync_log").upsert(
      { tab_name: "sync-ingest", last_synced_at: new Date().toISOString() },
      { onConflict: "tab_name" },
    );

    function norm(v: unknown): string {
      if (v === null || v === undefined) return "";
      if (typeof v === "boolean") return v ? "true" : "false";
      return String(v).trim();
    }

    /**
     * Compare incoming sheet row against current DB row. Returns:
     *  - applyData: object with conflicting fields stripped (safe to upsert)
     *  - conflicts: array of conflict descriptors to persist
     * If there is no existing DB row, no conflicts (everything inserts as-is).
     */
    async function detectConflicts(
      _table: string,
      _lookup: Record<string, string>,
      incoming: Record<string, unknown>,
      _sheetTab: string,
      _sheetRowNumber: number | null,
    ): Promise<{ applyData: Record<string, unknown>; conflicts: number }> {
      // Sheet is the source of truth per Mapping Inspector — always apply incoming.
      return { applyData: incoming, conflicts: 0 };
    }

    // ── Fetch domain aliases for normalization (canonical: domains.aliases array) ──
    const { data: allDomains } = await serviceClient
      .from("domains")
      .select("id, name, slug, aliases");
    const aliasMap = new Map<string, string>();
    for (const d of allDomains || []) {
      for (const a of (d as any).aliases || []) {
        if (a) aliasMap.set(String(a).toLowerCase().trim(), d.id);
      }
    }
    const domainMap = new Map<string, string>();
    for (const d of allDomains || []) domainMap.set(d.slug, d.id);
    const unmappedDomainId = allDomains?.find(d => d.slug === "unmapped")?.id;

    function resolveDomainId(raw: string): { domainId: string | null; unmapped: boolean } {
      if (!raw || !raw.trim()) return { domainId: unmappedDomainId || null, unmapped: true };
      const key = raw.toLowerCase().trim();
      const found = aliasMap.get(key);
      if (found) return { domainId: found, unmapped: false };
      const exact = allDomains?.find(d => d.name.toLowerCase() === key);
      if (exact) return { domainId: exact.id, unmapped: false };
      return { domainId: unmappedDomainId || null, unmapped: true };
    }

    // ── Parse multi-name ownership cells ──
    // Splits on /, ,, &, +, " and " — returns individual names
    function parseOwnership(raw: string): string[] {
      if (!raw || !raw.trim()) return [];
      // First replace " and " (case-insensitive) with a delimiter
      const normalized = raw.replace(/\s+and\s+/gi, "/");
      const parts = normalized.split(/[\/,&+]/).map(s => s.trim()).filter(Boolean);
      return parts;
    }

    // ── Helper: read sheet range with retry ──
    async function batchGet(ranges: string[]): Promise<Record<string, string[][]>> {
      const params = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join("&");
      const maxAttempts = 5;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const res = await fetch(`${baseUrl}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`, { headers: gHeaders });
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts - 1) {
          // Exponential backoff with jitter: 2s, 4s, 8s, 16s
          const wait = Math.pow(2, attempt + 1) * 1000 + Math.floor(Math.random() * 500);
          console.warn(`batchGet ${res.status} — retry ${attempt + 1}/${maxAttempts - 1} in ${wait}ms`);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        if (!res.ok) {
          const body = await res.text();
          const err: Error & { status?: number } = new Error(`batchGet [${res.status}]: ${body}`);
          err.status = res.status;
          throw err;
        }
        const data = await res.json();
        const out: Record<string, string[][]> = {};
        for (const vr of data.valueRanges || []) out[vr.range] = vr.values || [];
        return out;
      }
      const err: Error & { status?: number } = new Error("batchGet: max retries exceeded");
      err.status = 429;
      throw err;
    }

    function parseRows(allRows: string[][], headerRowIdx = 0, opts: { sheetStartRow?: number } = {}): Record<string, string>[] {
      if (allRows.length < headerRowIdx + 2) return [];
      const headers = allRows[headerRowIdx];
      const tag = typeof opts.sheetStartRow === "number";
      const firstDataSheetRow = (opts.sheetStartRow ?? 1) + headerRowIdx + 1;
      return allRows.slice(headerRowIdx + 1).map((row, i) => {
        const obj: Record<string, string> = {};
        headers.forEach((h, j) => {
          if (!h) return;
          const key = String(h).replace(/\s+/g, " ").trim();
          obj[key] = (row[j] ?? "").toString();
        });
        if (tag) obj.__sheetRow = String(firstDataSheetRow + i);
        return obj;
      }).filter(r => {
        return Object.entries(r).some(([k, v]) => k !== "__sheetRow" && v.trim());
      });
    }

    // ══════════════════════════════════════════
    // INGEST STUDENTS from "Student Data" tab (row 1 = headers)
    // ══════════════════════════════════════════
    if (scope === "full" || scope === "students") {
      const result = await batchGet(["'Student Data'!A1:ZZ10000"]);
      const rows = parseRows(Object.values(result)[0] || []);
      const sheetRollNos = new Set<string>();

      for (const row of rows) {
        const rollNo = row["Roll No."]?.trim();
        if (!rollNo) continue;
        sheetRollNos.add(rollNo);

        // Derive program (TBM/YLC) and cohort from roll_no pattern
        const programMatch = rollNo.match(/^(PGP|YLC)(\d{4})/);
        const program = programMatch ? (programMatch[1] === "YLC" ? "YLC" : "TBM") : "";
        const cohortYear = programMatch ? programMatch[2] : "";
        const cohort = program && cohortYear ? `${program} ${cohortYear}` : "";

        const studentData = {
          roll_no: rollNo,
          name: row["Name"] || "",
          email: row["Email"] || row["Email ID"] || row["email"] || null,
          phone: row["Phone"] || row["Phone No"] || row["Contact"] || null,
          cohort: cohort || null,
          primary_domain: row["Primary Domain"] || "",
          secondary_domain: row["Secondary Domain"] || "",
          sync_source: "sheet",
        };

        const { applyData } = await detectConflicts(
          "students",
          { roll_no: rollNo },
          studentData,
          "Student Data",
          null,
        );
        const { error } = await serviceClient.from("students").upsert(applyData, { onConflict: "roll_no" });
        if (!error) stats.students++;
      }

      // ── Reconcile deletions: remove sheet-sourced students no longer in the sheet ──
      if (isFullSync && sheetRollNos.size > 0) {
        const { data: dbStudents } = await serviceClient
          .from("students")
          .select("id, roll_no")
          .eq("sync_source", "sheet");
        const stale = (dbStudents ?? []).filter(r => r.roll_no && !sheetRollNos.has(r.roll_no.trim()));
        const totalSheetSourced = dbStudents?.length ?? 0;
        if (stale.length > 0 && stale.length <= Math.max(10, totalSheetSourced * 0.5)) {
          const ids = stale.map(r => r.id);
          await serviceClient.from("students").delete().in("id", ids);
          stats.students_deleted = stale.length;
        } else if (stale.length > 0) {
          console.warn(`students reconcile skipped: ${stale.length}/${totalSheetSourced} would be deleted (>50% safety threshold)`);
        }
      }
    }

    // ══════════════════════════════════════════
    // INGEST LMP PROCESSES from LMP Tracker (row 15 = headers)
    // ══════════════════════════════════════════
    if (scope === "full" || scope === "lmp") {
      const result = await batchGet(["'LMP Tracker'!A15:ZZ10000"]);
      const rows = parseRows(Object.values(result)[0] || [], 0, { sheetStartRow: 15 });

      // Collect POC names for poc_profiles
      const pocSet = new Map<string, { role_type: string; domains: Set<string> }>();

      // ⚠️ DO NOT wipe lmp_candidates here — UI-added candidates (sync_source='app')
      // would be deleted on every cron tick. Only purge sheet-sourced rows; the
      // re-ingest below repopulates them. App-added rows are preserved.
      // lmp_poc_links is auto-managed by the trg_lmp_links_after_change trigger.
      await serviceClient.from("lmp_candidates").delete().eq("sync_source", "sheet");

      // Batch candidates for insert
      const allCandidates: {
        lmp_id: string;
        student_name: string;
        pipeline_stage: string;
        r1_status?: string;
        offer_status?: string;
        sync_source: string;
      }[] = [];

      const sheetLmpKeys = new Set<string>();
      const sheetLmpIds = new Set<string>();

      for (const row of rows) {
        const company = row["Company"]?.trim();
        const role = row["Role"]?.trim();
        if (!company || !role) continue;
        sheetLmpKeys.add(`${company.toLowerCase()}||${role.toLowerCase()}`);
        const lmpIdInSheet = (row["LMP ID"] || "").trim();
        if (lmpIdInSheet) sheetLmpIds.add(lmpIdInSheet.toLowerCase());
        stats.lmp_total_in_sheet++;

        const domainRaw = row["Domain"]?.trim() || "";
        const { domainId, unmapped: domainUnmapped } = resolveDomainId(domainRaw);

        // Parse ownership — now returns arrays of individual names
        const prepPocRaw = row["Prep POC"] || "";
        const supportPocRaw = row["Support POC"] || "";  // Column U of LMP Tracker
        const outreachPocRaw = row["Outreach POC"] || "";
        const allocatorRaw = "";   // No "Allocator" column in this sheet
        const adminOwnerRaw = "";  // No "Admin Owner" column in this sheet

        const prepPocs = parseOwnership(prepPocRaw);
        const supportPocs = parseOwnership(supportPocRaw);
        const outreachPocs = parseOwnership(outreachPocRaw);
        const allocators = parseOwnership(allocatorRaw);
        const adminOwners = parseOwnership(adminOwnerRaw);

        // Preserve full multi-POC strings — trigger resolves them to lmp_poc_links
        const primaryPoc = prepPocs.join(", ");
        const supportPocFinal = supportPocs.join(", ");
        const outreachFinal = outreachPocs.join(", ");

        

        // Helpers: return undefined for blank cells so Supabase client OMITS
        // the key from the upsert payload (vs. wiping the DB value to "").
        const pickText = (...vals: unknown[]): string | undefined => {
          for (const v of vals) {
            const s = (v ?? "").toString().trim();
            if (s) return s;
          }
          return undefined;
        };
        // Like pickText, but allows explicit clearing: if the column key is
        // present on the row but the value is empty/whitespace, returns null
        // so the upsert writes NULL (wiping the DB value). Returns undefined
        // only when the column is missing entirely from the row.
        const pickClearableText = (key: string): string | null | undefined => {
          if (!(key in row)) return undefined;
          const s = (row[key] ?? "").toString().trim();
          return s ? s : null;
        };
        const pickBool = (raw: unknown): boolean | undefined => {
          const s = (raw ?? "").toString().trim().toLowerCase();
          if (!s) return undefined; // blank cell → skip (don't wipe DB)
          const truthy = ["true", "1", "yes", "y", "x", "✓", "checked", "done", "complete", "completed"];
          const falsy  = ["false", "0", "no", "n", "✗", "unchecked", "pending", "not done", "incomplete"];
          if (truthy.includes(s)) return true;
          if (falsy.includes(s)) return false;
          // Unknown non-empty token: skip rather than guess, so a typo
          // doesn't flip a UI-set value.
          return undefined;
        };

        const lmpDataRaw: Record<string, unknown> = {
          company,
          role,
          domain_id: domainId,
          domain_raw: domainRaw || undefined,
          status: pickText(row["Status"]),
          type: pickText(row["Type"]),
          date: pickText(row["Date"]),
          closing_date: pickText(row["Closing Date"]),
          admin_owner: adminOwners[0] || undefined,
          allocator: allocators[0] || undefined,
          prep_poc: primaryPoc || undefined,
          support_poc: supportPocFinal || undefined,
          outreach_poc: outreachFinal || undefined,
          daily_progress: pickClearableText("Daily Progress"),
          // r1/r2/r3_shortlisted, final_convert, convert_names are derived from
          // lmp_candidates in the app — do NOT overwrite from sheet here.
          prep_doc: pickText(row["Prep Doc"]),
          mentor_aligned: pickBool(row["Mentor Aligned"]),
          prep_doc_shared: pickBool(row["Prep Doc Shared"]),
          assignment_review: pickBool(row["Assignment Review"]),
          // Col K — actual sheet header is "1:1 mock completed"
          one_to_one_mock: pickBool(row["1:1 mock completed"] ?? row["Mock (done by POC)"]),
          // Col X — Mentor Selected
          mentor_selected: pickText(row["Mentor Selected"]),
          // Col Z — Comment: NOT synced here. The dedicated
          // `sheets-pull-comments` function handles sheet→DB for Column Z
          // with a merge-only guard so app-posted lines are never wiped.
          // Leaving `comments` out of this upsert preserves whatever
          // `post_lmp_comment` appended to `lmp_processes.comments`.
          // Col Z is now "Comment" (bidirectional, handled below). The
          // legacy "JD" header no longer occupies a column in the sheet;
          // jd_label / jd_url remain DB-only fields managed by the UI.
          // Col L — header may be "Next Expected Progress (Date)" or "Next
          // Progress Date". Accept BOTH input formats: DD/MM/YYYY (sheet user
          // entry) AND YYYY-MM-DD (DB→Sheet roundtrip). Returns `undefined`
          // on unparseable input so the upsert SKIPS the column instead of
          // wiping a valid DB value.
          next_progress_date: (() => {
            const raw = (row["Next Progress Date"] || row["Next Expected Progress (Date)"] || row["Next Expected Progress(Date)"] || "").toString().trim();
            if (!raw) return undefined;
            const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
            const dmy = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
            if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,"0")}-${dmy[1].padStart(2,"0")}`;
            const n = Number(raw);
            if (Number.isFinite(n) && n > 25569 && n < 80000) {
              const ms = Math.round((n - 25569) * 86400 * 1000);
              const d = new Date(ms);
              const y = d.getUTCFullYear();
              const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
              const da = String(d.getUTCDate()).padStart(2, "0");
              return `${y}-${mo}-${da}`;
            }
            return undefined;
          })(),
          next_progress_reminder_type: pickText(
            row["Next Progress Type"], row["Next Expected Progress"],
            row["Next Expected\nProgress"], row["Next Expected Progress Type"],
          ),
          next_progress_type: pickText(
            row["Next Progress Type"], row["Next Expected Progress"],
            row["Next Expected\nProgress"], row["Next Expected Progress Type"],
          ),
          // Col Y — Rating (numeric). Blank cell → skip (don't wipe a UI-set value).
          mentor_rating: (() => {
            if (!("Rating" in row)) return undefined;
            const s = (row["Rating"] ?? "").toString().trim();
            if (!s) return null;
            const n = Number(s);
            return Number.isFinite(n) ? n : undefined;
          })(),
          sync_source: "sheet",
        };

        // Drop keys whose value is `undefined` so the upsert never wipes
        // a DB-set value with an empty sheet cell.
        const skipped: string[] = [];
        const lmpData = Object.fromEntries(
          Object.entries(lmpDataRaw).filter(([k, v]) => {
            if (v === undefined) { skipped.push(k); return false; }
            return true;
          }),
        ) as Record<string, unknown>;
        if (skipped.length) {
          console.info(`[sync-ingest] ${company}/${role} skipped ${skipped.length} empty fields:`, skipped.join(","));
        }


        // Col AA — adopt sheet's LMP ID so DB lmp_code matches the sheet.
        // The assign_lmp_code trigger no-ops when lmp_code is already set.
        const sheetLmpCode = (row["LMP ID"] || "").trim();
        if (sheetLmpCode) {
          (lmpData as Record<string, unknown>).lmp_code = sheetLmpCode;
        }

        // Persist the sheet row number so DB → Sheet targeted updates and
        // deletes can use rowNumber as a fallback when LMP ID is missing.
        // GUARD: if another lmp_processes row already owns this sheet_row_id
        // and has a different lmp_code, skip the stamp so we don't end up
        // with two DB rows pointing at the same sheet row (which makes the
        // delete trigger fire against the wrong row later).
        const sheetRowNum = (row.__sheetRow || "").toString();
        if (sheetRowNum) {
          const { data: rowOwner } = await serviceClient
            .from("lmp_processes")
            .select("id, lmp_code")
            .eq("sheet_row_id", sheetRowNum)
            .neq("lmp_code", sheetLmpCode || "")
            .limit(1)
            .maybeSingle();
          if (rowOwner && (rowOwner as { lmp_code?: string }).lmp_code) {
            console.warn(
              `[sync-ingest] sheet_row collision skipped: row ${sheetRowNum} already owned by lmp_code=${(rowOwner as { lmp_code?: string }).lmp_code}, refusing to stamp ${sheetLmpCode || company + "/" + role}.`,
            );
          } else {
            (lmpData as Record<string, unknown>).sheet_row_id = sheetRowNum;
          }
        }


        const { applyData: lmpApply } = await detectConflicts(
          "lmp_processes",
          { company, role },
          lmpData,
          "LMP Tracker",
          null,
        );
        // Prefer matching on lmp_code (sheet's "LMP ID" column) when present —
        // the (company, role) unique constraint was removed so multiple LMPs
        // can share company+role. Fall back to (company, role) only when the
        // sheet row doesn't yet have an LMP ID.
        const upsertConflict = sheetLmpCode ? "lmp_code" : undefined;
        let upserted: { id: string } | null = null;
        let error: any = null;
        if (upsertConflict) {
          const res = await serviceClient
            .from("lmp_processes")
            .upsert(lmpApply, { onConflict: upsertConflict })
            .select("id")
            .single();
          upserted = res.data; error = res.error;
        } else {
          // No lmp_code yet — try to find an existing row by company+role
          // (legacy), else insert fresh so the trigger assigns an lmp_code.
          const { data: existingRows } = await serviceClient
            .from("lmp_processes")
            .select("id")
            .ilike("company", company)
            .ilike("role", role)
            .limit(2);
          if ((existingRows?.length ?? 0) > 1) {
            console.warn(
              `[sync-ingest] ambiguous (company,role) match for "${company}"/"${role}" ` +
              `— ${existingRows!.length}+ DB rows and sheet row has no LMP ID. ` +
              `Picking first; add LMP ID on the sheet to disambiguate.`,
            );
          }
          const existingRow = existingRows?.[0];
          if (existingRow?.id) {
            const res = await serviceClient
              .from("lmp_processes")
              .update(lmpApply)
              .eq("id", existingRow.id)
              .select("id")
              .single();
            upserted = res.data; error = res.error;
          } else {
            const res = await serviceClient
              .from("lmp_processes")
              .insert(lmpApply)
              .select("id")
              .single();
            upserted = res.data; error = res.error;
          }
        }

        if (error) {
          stats.lmp_upsert_errors++;
          console.error(`LMP upsert failed for ${company} / ${role}:`, error.message);
        }
        if (!error && upserted) {
          stats.lmp_processes++;
          const lmpId = upserted.id;

          // If the sheet row didn't have an LMP ID, write the DB-assigned
          // lmp_code back so the next sync can match by ID (not company+role).
          if (!sheetLmpCode) {
            try {
              const { data: refreshed } = await serviceClient
                .from("lmp_processes")
                .select("lmp_code")
                .eq("id", lmpId)
                .maybeSingle();
              const newCode = (refreshed as { lmp_code?: string } | null)?.lmp_code;
              if (newCode) {
                // Push asynchronously via the existing sheets-lmp update path.
                fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/sheets-lmp`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                    "apikey": Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
                    "x-sheet-sweeper": "1",
                  },
                  body: JSON.stringify({
                    op: "update",
                    tab: "LMP Tracker",
                    headerRow: 15,
                    id: lmpId,
                    findBy: { Company: company, Role: role },
                    patch: { "LMP ID": newCode },
                  }),
                }).catch((e) => console.warn("[sync-ingest] LMP ID writeback failed:", e));
              }
            } catch (e) {
              console.warn("[sync-ingest] failed to read lmp_code for writeback:", e);
            }
          }

          // lmp_poc_links is auto-populated by trg_lmp_links_after_change
          // from prep_poc/support_poc/outreach_poc text columns. Nothing to write here.


          // ── Link candidates from Converted Name(s) and R1/R2/R3 shortlisted ──
          const convertNamesRaw = row["Converted Name(s)"] || row["Convert Name(s)"] || "";
          const convertNames = convertNamesRaw.split(/[,\n]+/).map((s: string) => s.trim()).filter(Boolean);
          for (const cName of convertNames) {
            allCandidates.push({
              lmp_id: lmpId,
              student_name: cName,
              pipeline_stage: "converted",
              offer_status: "converted",
              sync_source: "sheet",
            });
          }

          // R1 shortlisted names (if text names, not just count)
          const r1Raw = row["R1 Shortlisted"] || "";
          if (r1Raw && isNaN(Number(r1Raw))) {
            const r1Names = r1Raw.split(/[,\n]+/).map((s: string) => s.trim()).filter(Boolean);
            for (const n of r1Names) {
              allCandidates.push({ lmp_id: lmpId, student_name: n, pipeline_stage: "r1_shortlisted", r1_status: "shortlisted", sync_source: "sheet" });
            }
          }
        }

        // Track unmapped domains
        if (domainUnmapped && domainRaw) {
          await serviceClient.from("unmapped_items").upsert({
            item_type: "domain",
            raw_value: domainRaw,
            source_tab: "LMP Tracker",
            source_field: "Domain",
            source_record_id: `${company}-${role}`,
          }, { onConflict: "item_type,raw_value,source_tab,source_field" });
          stats.unmapped++;
        }

        // Collect individual POC names for poc_profiles
        const addPoc = (name: string, roleType: string) => {
          if (!name) return;
          const existing = pocSet.get(name);
          if (existing) {
            if (domainRaw) existing.domains.add(domainRaw);
          } else {
            pocSet.set(name, { role_type: roleType, domains: domainRaw ? new Set([domainRaw]) : new Set() });
          }
        };

        for (const p of prepPocs) addPoc(p, "prep_poc");
        for (const s of supportPocs) addPoc(s, "prep_poc");
        for (const o of outreachPocs) addPoc(o, "outreach_poc");
        for (const a of allocators) addPoc(a, "allocator");
        for (const ao of adminOwners) addPoc(ao, "admin");
      }

      // ── Reconcile deletions: any LMP not present in the current sheet is removed ──
      // Runs on every poll (not just full sync) so sheet → DB delete is near-instant.
      // Match by sheet "LMP ID" (= DB lmp_code), then fall back to UUID, then company+role.
      // A 50% safety threshold prevents accidental wipes.
      //
      // CRITICAL GUARDS (prevents app-created LMPs vanishing while the sheet
      // mirror is still in-flight — see "LMP not found" bug):
      //   1. Only consider rows whose sync_source = 'sheet'. App / system-created
      //      rows are owned by the DB; the sheet is the mirror, not the source
      //      of truth for them.
      //   2. Never delete rows created in the last 15 minutes — the sheet write
      //      queue + retry sweeper need time to push them to the sheet.
      if (sheetLmpKeys.size > 0) {
        const RECENT_GRACE_MS = 15 * 60 * 1000;
        const cutoffIso = new Date(Date.now() - RECENT_GRACE_MS).toISOString();
        const { data: dbLmps } = await serviceClient
          .from("lmp_processes")
          .select("id, company, role, lmp_code, sync_source, created_at")
          .eq("sync_source", "sheet")
          .lt("created_at", cutoffIso);
        const sheetCodes = new Set(
          Array.from(sheetLmpIds).map((s) => s.toLowerCase()),
        );
        const stale = (dbLmps ?? []).filter((r) => {
          const code = (r.lmp_code || "").toLowerCase();
          if (code && sheetCodes.has(code)) return false;
          if (sheetLmpIds.size > 0 && sheetCodes.has((r.id || "").toLowerCase())) return false;
          const companyRoleKey = r.company && r.role
            ? `${r.company.trim().toLowerCase()}||${r.role.trim().toLowerCase()}`
            : "";
          return companyRoleKey && !sheetLmpKeys.has(companyRoleKey);
        });
        const totalDb = dbLmps?.length ?? 0;
        if (stale.length > 0 && stale.length <= Math.max(20, totalDb * 0.5)) {
          const ids = stale.map((r) => r.id);
          // FK CASCADE handles lmp_candidates / lmp_mentors / lmp_poc_links / etc.
          // The AFTER DELETE trigger on lmp_processes also pushes sheet deletes,
          // which will short-circuit as "row not found" since the sheet already lacks them.
          await serviceClient.from("lmp_processes").delete().in("id", ids);
          stats.lmp_deleted = stale.length;
          console.log(`lmp_processes reconcile: deleted ${stale.length} stale rows (sheet-sourced, >15min old)`);
        } else if (stale.length > 0) {
          console.warn(`lmp_processes reconcile skipped: ${stale.length}/${totalDb} would be deleted (>50% safety threshold)`);
        }
      }

      // Upsert sheet-sourced candidates (unique on lmp_id,student_name).
      // Using upsert with ignoreDuplicates avoids errors when a UI-added row
      // exists for the same student under the same LMP.
      if (allCandidates.length > 0) {
        for (let i = 0; i < allCandidates.length; i += 100) {
          const chunk = allCandidates.slice(i, i + 100);
          const { error: candErr } = await serviceClient
            .from("lmp_candidates")
            .upsert(chunk, { onConflict: "lmp_id,student_name", ignoreDuplicates: true });
          if (candErr) console.warn("[sync-ingest] candidate upsert error:", candErr.message);
        }
        stats.lmp_candidates = allCandidates.length;
      }

      // ══════════════════════════════════════════
      // UPSERT POC PROFILES
      // ══════════════════════════════════════════
      if (scope === "full" || scope === "poc") {
        const { data: profileUsers } = await serviceClient
          .from("profiles")
          .select("id, display_name, email, role")
          .not("email", "is", null);
        const approvedMap = new Map<string, { id: string; email: string; role: string }>();
        for (const pu of profileUsers || []) {
          if (!pu.display_name || !pu.email) continue;
          approvedMap.set(pu.display_name.toLowerCase().trim(), {
            id: pu.id,
            email: pu.email,
            role: (pu.role as string) || "poc",
          });
        }

        for (const [name, info] of pocSet) {
          const approvedUser = approvedMap.get(name.toLowerCase().trim());
          const domainTags = [...info.domains];

          // Only create/update POC profiles when we have a verified email (a profile row).
          // Sheet first-name aliases (e.g. "Vidit", "Mansi") must NOT spawn duplicate POC rows;
          // they are resolved at read-time against canonical email-bearing POCs via aliases.
          if (!approvedUser?.email) {
            await serviceClient.from("unmapped_items").upsert({
              item_type: "user",
              raw_value: name,
              source_tab: "LMP Tracker",
              source_field: "POC",
            }, { onConflict: "item_type,raw_value,source_tab,source_field" });
            stats.unmapped++;
            continue;
          }

          const pocData = {
            name,
            email: approvedUser.email,
            role_type: approvedUser.role === "admin" ? "admin" : approvedUser.role === "allocator" ? "allocator" : info.role_type,
            primary_domain: domainTags[0] || "",
            domain_tags: domainTags,
            status: "active",
          };

          const { data: existing } = await serviceClient.from("poc_profiles")
            .select("id").eq("email", approvedUser.email).maybeSingle();
          if (existing) {
            await serviceClient.from("poc_profiles").update(pocData).eq("id", existing.id);
          } else {
            await serviceClient.from("poc_profiles").insert(pocData);
          }
          stats.poc_profiles++;
        }
      }

      // ══════════════════════════════════════════
      // RECOMPUTE DOMAIN AGGREGATES
      // ══════════════════════════════════════════
      const { data: lmpAll } = await serviceClient.from("lmp_processes").select("domain_id, status");
      const domainAgg: Record<string, { total: number; active: number; converted: number; offer: number; dormant: number; closed: number; hold: number }> = {};

      for (const d of allDomains || []) {
        domainAgg[d.id] = { total: 0, active: 0, converted: 0, offer: 0, dormant: 0, closed: 0, hold: 0 };
      }

      for (const lmp of lmpAll || []) {
        const did = lmp.domain_id;
        if (!did || !domainAgg[did]) continue;
        domainAgg[did].total++;
        const s = (lmp.status || "").toLowerCase().trim();
        if (s === "ongoing" || s === "not started") domainAgg[did].active++;
        else if (s === "converted") domainAgg[did].converted++;
        else if (s === "offer received") domainAgg[did].offer++;
        else if (s === "dormant") domainAgg[did].dormant++;
        else if (s === "closed") domainAgg[did].closed++;
        else if (s === "on hold") domainAgg[did].hold++;
      }

      for (const [dId, agg] of Object.entries(domainAgg)) {
        const convRate = agg.total > 0 ? (agg.converted / agg.total) * 100 : 0;
        await serviceClient.from("domains").update({
          total_lmps: agg.total,
          active_lmps: agg.active,
          converted_lmps: agg.converted,
          offer_received: agg.offer,
          dormant: agg.dormant,
          closed: agg.closed,
          on_hold: agg.hold,
          conversion_rate: Math.round(convRate * 100) / 100,
        }).eq("id", dId);
        stats.domains_updated++;
      }

      // Recompute POC load from lmp_poc_links joined with lmp_processes (canonical)
      const { data: linkRows } = await (serviceClient as any)
        .from("lmp_poc_links")
        .select("poc_id, role, lmp:lmp_processes!inner(status)")
        .eq("is_active", true)
        .limit(20000);

      type Agg = { primary: number; secondary: number; outreach: number; total: number; active: number; converted: number };
      const aggByPoc = new Map<string, Agg>();
      for (const r of (linkRows as any[]) || []) {
        const pocId = r.poc_id as string;
        if (!pocId) continue;
        if (!aggByPoc.has(pocId)) aggByPoc.set(pocId, { primary: 0, secondary: 0, outreach: 0, total: 0, active: 0, converted: 0 });
        const a = aggByPoc.get(pocId)!;
        a.total++;
        if (r.role === "prep") a.primary++;
        else if (r.role === "support") a.secondary++;
        else if (r.role === "outreach") a.outreach++;
        const status = ((r.lmp?.status as string) || "").toLowerCase().trim();
        if (status === "ongoing" || status === "not started") a.active++;
        else if (status === "converted") a.converted++;
      }

      const { data: pocAll } = await serviceClient.from("poc_profiles").select("id");
      for (const poc of pocAll || []) {
        const a = aggByPoc.get(poc.id) || { primary: 0, secondary: 0, outreach: 0, total: 0, active: 0, converted: 0 };
        const convRate = a.total > 0 ? (a.converted / a.total) * 100 : 0;
        await serviceClient.from("poc_profiles").update({
          active_load: a.active,
          historical_load: a.total,
          ongoing_count: a.primary + a.secondary,
          converted_count: a.converted,
          conversion_rate: Math.round(convRate * 100) / 100,
        }).eq("id", poc.id);
      }
    }

    // Log sync event
    await serviceClient.from("sheet_sync_events").insert({
      tab_name: scope === "full" ? "ALL" : scope,
      direction: "sheet_to_app",
      operation: since ? "sync-ingest-incremental" : "sync-ingest",
      fields_synced: Object.keys(stats),
      field_count: Object.values(stats).reduce((a, b) => a + b, 0),
      status: "success",
      synced_by: "system",
    });

    await serviceClient.from("sheets_sync_log").upsert({
      tab_name: "sync-ingest",
      last_synced_at: new Date().toISOString(),
      row_count: stats.students + stats.lmp_processes,
    }, { onConflict: "tab_name" });

    return jsonOk({ success: true, stats, since });
  } catch (err) {
    console.error("sync-ingest error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = (err as { status?: number })?.status;
    const isRateLimited = status === 429 || /\[429\]|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED|Quota exceeded/i.test(message);
    if (isRateLimited) {
      // Return 200 with fallback flag so the client can degrade gracefully
      return jsonOk({
        success: false,
        fallback: true,
        code: "SHEETS_RATE_LIMITED",
        message: "Google Sheets read quota exceeded — try again in a minute.",
        retryAfterSeconds: 60,
      });
    }
    return jsonError(message, 500);
  }
};
void _legacyHandler;

function jsonOk(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
