import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { createSheetsClient } from "../_shared/sheets.ts";
import { SHEET_TO_DB, DB_TO_SHEET, normalizeStatusForSheet } from "../_shared/fieldMap.ts";
import {
  buildLmpSheetIntegrityReport,
  findCompactableLmpBlankRows,
  findLmpSheetRow,
  findLmpSheetRowIndexes,
  LMP_ID_COLUMN_INDEX,
  LMP_TRACKER_HEADER_ROW,
  validateLmpTrackerHeaders,
} from "../_shared/lmpSheetIdentity.ts";
import { hasValidInternalSecret, requireAuth } from "../_shared/requireAuth.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret, x-sheet-sweeper, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const METADATA_CACHE_MS = 10 * 60 * 1000;
const LIST_CACHE_MS = 2 * 60 * 1000;
let metadataCache: { ts: number; data: unknown } | null = null;
const rangeCache = new Map<string, { ts: number; data: Record<string, string[][]> }>();

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\[429\]|RATE_LIMIT_EXCEEDED|RESOURCE_EXHAUSTED|Quota exceeded|sheets_rate_limited/i.test(message);
}

// Coerce values from sheet-shape ("Yes"/"" strings) to types Postgres expects
// before mirroring into lmp_processes. Without this, boolean columns reject
// "Yes"/"" and date columns reject "".
const BOOL_DB_COLS = new Set([
  "prep_doc_shared",
  "mentor_aligned",
  "assignment_review",
  "one_to_one_mock",
]);
const DATE_DB_COLS = new Set([
  "next_progress_date",
  "closing_date",
  "date",
]);
function coerceDbValue(dbCol: string, val: unknown): unknown {
  if (BOOL_DB_COLS.has(dbCol)) {
    if (typeof val === "boolean") return val;
    const s = String(val ?? "").trim().toLowerCase();
    return s === "yes" || s === "true" || s === "1" || s === "y";
  }
  if (DATE_DB_COLS.has(dbCol)) {
    if (val == null) return null;
    const s = String(val).trim();
    return s === "" ? null : val;
  }
  return val;
}

// Auto-stamp Closing Date when Status transitions to a terminal value.
const TERMINAL_STATUSES = new Set(["converted", "not converted", "other reasons"]);
function isTerminalStatus(v: unknown): boolean {
  return TERMINAL_STATUSES.has(String(v ?? "").replace(/\s+/g, " ").trim().toLowerCase());
}
function formatClosingDateForSheet(d: Date = new Date()): string {
  // Matches col A "Date" format, e.g. "4 Jun 2026", in Asia/Kolkata.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
  }).format(d);
}
function todayKolkataISODate(): string {
  // YYYY-MM-DD in Asia/Kolkata, suitable for a Postgres date column.
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", timeZone: "Asia/Kolkata",
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const d = parts.find(p => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

Deno.serve(async (req: Request) => {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let SPREADSHEET_ID = Deno.env.get("LMP_SPREADSHEET_ID") ?? "";
  if (!SPREADSHEET_ID) return jsonError("LMP_SPREADSHEET_ID not configured", 500);
  const idMatch = SPREADSHEET_ID.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (idMatch) {
    SPREADSHEET_ID = idMatch[1];
  } else {
    SPREADSHEET_ID = SPREADSHEET_ID.split("/")[0].split("?")[0];
  }

  // Service-role client is used only after application-level authorization.
  const serviceClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const internalRequest = await hasValidInternalSecret(req);
  let userId: string | null = null;
  let userRole: "admin" | "allocator" | "poc" | null = null;
  if (!internalRequest) {
    const auth = await requireAuth(req, corsHeaders);
    if ("error" in auth) return auth.error;
    userId = auth.user.id;
    userRole = auth.user.role;
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const op = String(body.op ?? "").trim();
  const tab = String(body.tab ?? "").trim();
  const requestedHeaderRow = Number(body.headerRow);
  const hasValidHeaderRow = Number.isInteger(requestedHeaderRow) && requestedHeaderRow > 0;
  const isLmpTracker = tab.toLowerCase() === "lmp tracker";
  // The tracker contract is fixed: row 14 is headers and row 15 is the first
  // data row. Ignore legacy queued values rather than parsing a data row as
  // headers and inserting duplicates.
  const headerRow = isLmpTracker
    ? LMP_TRACKER_HEADER_ROW
    : hasValidHeaderRow
      ? requestedHeaderRow
      : 1;

  const lmpSlug = (company: unknown, role: unknown) =>
    `${String(company ?? "").toLowerCase().replace(/[^a-z0-9]/g, "-")}-${String(role ?? "").toLowerCase().replace(/[^a-z0-9]/g, "-")}`
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");

  const colIndexToLetter = (idx: number): string => {
    let n = idx;
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };

  if (!op) return jsonError("Missing 'op'", 400);
  if (!tab && op !== "metadata") return jsonError("Missing 'tab'", 400);
  if (["lmp-integrity-report", "lmp-compact"].includes(op) && !internalRequest && userRole !== "admin") {
    return jsonError("ADMIN_REQUIRED: LMP maintenance operations are admin-only", 403);
  }

  const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

  const WRITE_OPS = new Set(["insert", "update", "delete", "sync-db-to-sheet"]);
  const fromSweeper = req.headers.get("x-sheet-sweeper") === "1" && internalRequest;

  // Enqueue a write op into the retry queue (used on 429 or active cooldown).
  async function enqueueWrite(reason: string) {
    try {
      const delaySec = reason === "rate_limited" ? 60 : 5;
      const safePayload = isLmpTracker
        ? { ...body, headerRow: LMP_TRACKER_HEADER_ROW }
        : body;
      await serviceClient.from("sheet_write_queue").insert({
        tab_name: tab,
        operation: op,
        payload: safePayload,
        status: "pending",
        next_retry_at: new Date(Date.now() + delaySec * 1000).toISOString(),
        last_error: reason,
        enqueued_by: userId || "system",
        idempotency_key: `sheet:${tab}:${op}:${String(body.lmp_code || body.id || `${body.company || ""}:${body.role || ""}`)}`,
      });
    } catch (e) {
      console.warn("enqueueWrite failed:", e);
    }
  }

  // Only the authenticated worker may write to Google Sheets. All other
  // callers enqueue a durable job and return immediately.
  if (WRITE_OPS.has(op) && !fromSweeper) {
    await enqueueWrite("queued_for_worker");
    return jsonOk({ queued: true, tab, operation: op });
  }

  // Cooldown gate for the authenticated worker.
  if (WRITE_OPS.has(op) && fromSweeper) {
    try {
      const { data: log } = await serviceClient
        .from("sheets_sync_log")
        .select("rate_limited_until")
        .eq("tab_name", tab)
        .maybeSingle();
      const until = log?.rate_limited_until ? new Date(log.rate_limited_until).getTime() : 0;
      if (until > Date.now()) {
        await enqueueWrite("cooldown_active");
        return jsonOk({
          queued: true,
          tab,
          message: "Tab is in cooldown — write queued for retry.",
          retryAfterSeconds: Math.ceil((until - Date.now()) / 1000),
        });
      }
    } catch (e) {
      console.warn("cooldown check failed:", e);
    }
  }

  // ── Sync event logger (fire-and-forget) ──
  async function logSyncEvent(params: {
    tab_name: string;
    direction: string;
    operation: string;
    record_id?: string;
    fields_synced?: string[];
    status: string;
    error_message?: string;
  }) {
    try {
      await serviceClient.from("sheet_sync_events").insert({
        tab_name: params.tab_name,
        direction: params.direction,
        operation: params.operation,
        record_id: params.record_id || null,
        fields_synced: params.fields_synced || [],
        field_count: params.fields_synced?.length || 0,
        status: params.status,
        error_message: params.error_message || null,
        synced_by: userId || "system",
      });
    } catch (e) {
      console.warn("Failed to log sync event:", e);
    }
  }

  // ── Update sheets_sync_log (tab-level summary) ──
  async function updateSyncLog(tabName: string, rowCount: number) {
    try {
      const { data: existing } = await serviceClient
        .from("sheets_sync_log")
        .select("id")
        .eq("tab_name", tabName)
        .maybeSingle();

      if (existing) {
        await serviceClient.from("sheets_sync_log")
          .update({ last_synced_at: new Date().toISOString(), row_count: rowCount })
          .eq("id", existing.id);
      } else {
        await serviceClient.from("sheets_sync_log").insert({
          tab_name: tabName,
          last_synced_at: new Date().toISOString(),
          row_count: rowCount,
        });
      }
    } catch (e) {
      console.warn("Failed to update sync log:", e);
    }
  }

  // Shared retry/backoff/timeout helper (same impl used by copilot-ai).
  const sheetsClient = createSheetsClient({
    spreadsheetId: SPREADSHEET_ID,
    maxRetries: 2,
    baseBackoffMs: 1200,
  });
  const batchGet = (ranges: string[]) => sheetsClient.batchGet(ranges, "UNFORMATTED_VALUE");
  const batchUpdate = (data: { range: string; values: unknown[][] }[]) => sheetsClient.batchUpdate(data);

  const cachedBatchGet = async (ranges: string[]) => {
    const key = ranges.join("||");
    const cached = rangeCache.get(key);
    if (cached && Date.now() - cached.ts < LIST_CACHE_MS) return cached.data;
    try {
      const data = await batchGet(ranges);
      rangeCache.set(key, { ts: Date.now(), data });
      return data;
    } catch (err) {
      if (isRateLimitError(err) && cached) return cached.data;
      throw err;
    }
  };

  // Helper: append row
  async function appendRow(tab: string, values: unknown[]) {
    const range = `'${tab}'!A${headerRow}:ZZ`;
    const result = await batchGet([range]);
    const allRows = Object.values(result)[0] || [];
    const nextRow = headerRow + allRows.length;
    
    await batchUpdate([{
      range: `'${tab}'!A${nextRow}`,
      values: [values],
    }]);
    return nextRow;
  }

  // Per-request cache: tab title → numeric sheetId (gid)
  const sheetIdByTitleCache = new Map<string, number>();
  async function getSheetIdByTitle(tabTitle: string): Promise<number> {
    const cached = sheetIdByTitleCache.get(tabTitle);
    if (cached !== undefined) return cached;
    const res = await sheetsClient.rawFetch(`${baseUrl}?fields=sheets.properties`);
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`getSheetIdByTitle [${res.status}]: ${txt.slice(0, 300)}`);
    }
    const data = await res.json();
    for (const s of (data.sheets || [])) {
      const t = s.properties?.title;
      const id = s.properties?.sheetId;
      if (typeof t === "string" && typeof id === "number") {
        sheetIdByTitleCache.set(t, id);
      }
    }
    const found = sheetIdByTitleCache.get(tabTitle);
    if (found === undefined) throw new Error(`Could not resolve sheetId for tab '${tabTitle}'`);
    return found;
  }

  // Helper: insert a new row directly under the header row (row headerRow+1),
  // physically shifting any existing rows below it down by one. Inherits
  // formatting from the header row, not from whatever was previously in that row.
  async function insertRowAtTop(tab: string, values: unknown[]) {
    const sheetIdNum = await getSheetIdByTitle(tab);
    // 1) Insert a blank row and 2) copy full formatting (incl. borders,
    //    data validation, conditional formats) from the row that was
    //    previously the first data row (now pushed down by 1).
    const insertReqBody = {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: sheetIdNum,
              dimension: "ROWS",
              startIndex: headerRow,       // 0-based → row headerRow+1 (1-based)
              endIndex: headerRow + 1,
            },
            inheritFromBefore: false,      // inherit from row after (old first data row)
          },
        },
        {
          copyPaste: {
            // Source: the row that was the first data row before insertion,
            // now at 0-based index headerRow + 1.
            source: {
              sheetId: sheetIdNum,
              startRowIndex: headerRow + 1,
              endRowIndex: headerRow + 2,
            },
            // Destination: the freshly inserted row at 0-based index headerRow.
            destination: {
              sheetId: sheetIdNum,
              startRowIndex: headerRow,
              endRowIndex: headerRow + 1,
            },
            pasteType: "PASTE_FORMAT",     // borders/format only, no values
            pasteOrientation: "NORMAL",
          },
        },
      ],
    };
    const insRes = await sheetsClient.rawFetch(`${baseUrl}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify(insertReqBody),
    });
    if (!insRes.ok) {
      const txt = await insRes.text();
      throw new Error(`insertDimension [${insRes.status}]: ${txt.slice(0, 300)}`);
    }
    const targetRow = headerRow + 1;
    await batchUpdate([{
      range: `'${tab}'!A${targetRow}`,
      values: [values],
    }]);
    // Cached row ranges are now stale (everything shifted down).
    rangeCache.clear();
    return targetRow;
  }

  async function deleteSheetRows(tab: string, sheetRows: number[]) {
    const uniqueRows = [...new Set(sheetRows)]
      .filter((row) => Number.isInteger(row) && row > headerRow)
      .sort((a, b) => b - a);
    if (uniqueRows.length === 0) return [];
    const sheetIdNum = await getSheetIdByTitle(tab);
    const res = await sheetsClient.rawFetch(`${baseUrl}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: uniqueRows.map((sheetRow) => ({
          deleteDimension: {
            range: {
              sheetId: sheetIdNum,
              dimension: "ROWS",
              startIndex: sheetRow - 1,
              endIndex: sheetRow,
            },
          },
        })),
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`deleteDimension [${res.status}]: ${text.slice(0, 300)}`);
    }
    rangeCache.clear();
    return uniqueRows;
  }

  async function compactLmpTrackerBlankRows(tab: string) {
    if (tab !== "LMP Tracker") return [];
    const range = `'${tab}'!A${headerRow}:ZZ10000`;
    const result = await batchGet([range]);
    const rows = Object.values(result)[0] || [];
    if (rows.length < 2) return [];
    const blankRows = findCompactableLmpBlankRows(rows[0], rows);
    return deleteSheetRows(tab, blankRows);
  }

  try {
    switch (op) {
      case "metadata": {
        if (metadataCache && Date.now() - metadataCache.ts < METADATA_CACHE_MS) {
          return jsonOk(metadataCache.data);
        }
        const res = await sheetsClient.rawFetch(`${baseUrl}?fields=sheets.properties`);
        if (!res.ok) {
          const err = new Error(`metadata [${res.status}]: ${await res.text()}`);
          if (res.status === 429 && metadataCache) return jsonOk({ ...(metadataCache.data as Record<string, unknown>), stale: true });
          throw err;
        }
        const data = await res.json();
        const sheets = (data.sheets || []).map((s: any) => ({
          title: s.properties?.title,
          sheetId: s.properties?.sheetId,
          rowCount: s.properties?.gridProperties?.rowCount,
          colCount: s.properties?.gridProperties?.columnCount,
        }));
        const payload = { sheets, spreadsheetId: SPREADSHEET_ID };
        metadataCache = { ts: Date.now(), data: payload };
        return jsonOk(payload);
      }

      case "lmp-integrity-report": {
        if (tab !== "LMP Tracker") return jsonError("LMP_TRACKER_REQUIRED", 400);
        const range = `'${tab}'!A${headerRow}:ZZ10000`;
        const result = await batchGet([range]);
        const allRows = Object.values(result)[0] || [];
        if (allRows.length < 1) return jsonError("Sheet has no header row", 404);
        return jsonOk({
          dryRun: true,
          tab,
          headerRow,
          firstDataRow: headerRow + 1,
          ...buildLmpSheetIntegrityReport(allRows[0], allRows),
          cleanupPlan: [
            "Repair the single canonical LMP ID header at AA without moving data.",
            "Review duplicate LMP IDs and choose the authoritative row manually.",
            "Backfill missing LMP IDs only from a stable DB identity.",
            "Retry failed queue rows only after the header report is safe.",
          ],
        });
      }

      case "lmp-compact": {
        if (tab !== "LMP Tracker") return jsonError("LMP_TRACKER_REQUIRED", 400);
        const compactedRows = await compactLmpTrackerBlankRows(tab);
        return jsonOk({
          compacted: true,
          tab,
          removedBlankRows: compactedRows,
          removedCount: compactedRows.length,
        });
      }

      case "list": {
        const dataStartRow = headerRow;
        const range = `'${tab}'!A${dataStartRow}:ZZ10000`;
        const result = await cachedBatchGet([range]);
        const allRows = Object.values(result)[0] || [];
        if (allRows.length < 2) return jsonOk({ rows: [], tab, count: 0 });

        const headers = allRows[0];

        // Guard against the hardcoded header-row drifting. The LMP Tracker
        // header row is configured at row 14; if that row no longer contains
        // recognizable column names, fail loudly so callers don't silently
        // ingest garbage. We probe for two columns we know must be present.
        if (tab === "LMP Tracker") {
          const hasCompany = headers.some((h: string) => /company/i.test(h ?? ""));
          const hasRole = headers.some((h: string) => /^role$/i.test((h ?? "").trim()));
          if (!hasCompany || !hasRole) {
            return jsonError(
              `LMP Tracker headers not found at row ${headerRow}. ` +
              `Got: ${JSON.stringify(headers.slice(0, 8))}. ` +
              `Either the sheet was restructured (move the header row back to row 14) ` +
              `or pass an explicit headerRow in the request body.`,
              409,
            );
          }
        }

        const rows = allRows.slice(1).map((row, idx) => {
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { if (h) obj[h] = (row[i] ?? "").toString(); });
          obj.__sheetRowNumber = String(headerRow + idx + 1);
          return obj;
        }).filter((r) => !r.deletedAt);

        // Log sync event (fire-and-forget)
        logSyncEvent({
          tab_name: tab,
          direction: "sheet_to_app",
          operation: "read",
          fields_synced: headers.filter(Boolean),
          status: "success",
        });
        updateSyncLog(tab, rows.length);

        return jsonOk({ rows, tab, count: rows.length, headers });
      }

      case "get": {
        const id = body.id as string;
        if (!id) return jsonError("Missing 'id'", 400);
        const range = `'${tab}'!A${headerRow}:ZZ10000`;
        const result = await batchGet([range]);
        const allRows = Object.values(result)[0] || [];
        if (allRows.length < 2) return jsonError("No data", 404);

        const headers = allRows[0];
        const idCol = headers.indexOf("id");
        for (let i = 1; i < allRows.length; i++) {
          if (allRows[i][idCol] === id) {
            const obj: Record<string, string> = {};
            headers.forEach((h, idx) => { if (h) obj[h] = (allRows[i][idx] ?? "").toString(); });
            
            logSyncEvent({
              tab_name: tab,
              direction: "sheet_to_app",
              operation: "read",
              record_id: id,
              fields_synced: headers.filter(Boolean),
              status: "success",
            });
            
            return jsonOk({ row: obj, tab });
          }
        }
        return jsonError(`Row '${id}' not found`, 404);
      }

      case "insert": {
        const row = body.row as Record<string, unknown>;
        if (!row) return jsonError("Missing 'row'", 400);

        const hRange = `'${tab}'!A${headerRow}:ZZ${headerRow}`;
        const hResult = await batchGet([hRange]);
        let sheetHeaders = (Object.values(hResult)[0] || [[]])[0] as string[];
        if (!sheetHeaders.length) return jsonError("No headers in sheet", 400);

        if (tab === "LMP Tracker") {
          const validation = validateLmpTrackerHeaders(sheetHeaders);
          if (validation.error) return jsonError(validation.error, 409);
          const lmpCode = String(row["LMP ID"] ?? "").trim();
          if (!lmpCode) return jsonError("LMP_ID_REQUIRED", 400);
          const allRange = `'${tab}'!A${headerRow}:ZZ10000`;
          const allResult = await batchGet([allRange]);
          const allRows = Object.values(allResult)[0] || [];
          const duplicateLookup = findLmpSheetRow(sheetHeaders, allRows, { lmpCode, company: "", role: "" });
          if (duplicateLookup.error) return jsonError(duplicateLookup.error, 409);
          if (duplicateLookup.rowIndex !== -1) {
            return jsonError(`LMP_ID_ALREADY_EXISTS: ${lmpCode}`, 409);
          }
        }

        const values = sheetHeaders.map((h) => {
          if (!h) return "";
          if (h === "id" && !row.id) return generateId();
          if (h === "updatedAt") return new Date().toISOString();
          if (h === "updatedBy") return userId;
          if (h === "createdAt" && !row.createdAt) return new Date().toISOString();
          return row[h] ?? "";
        });

        const insertedRowNumber = tab === "LMP Tracker"
          ? await insertRowAtTop(tab, values)
          : await appendRow(tab, values);

        const inserted: Record<string, unknown> = {};
        sheetHeaders.forEach((h, i) => { inserted[h] = values[i]; });
        inserted.__sheetRowNumber = String(insertedRowNumber);

        const fieldsSynced = Object.keys(row).filter(k => row[k] !== "" && row[k] !== null && row[k] !== undefined);
        const recordId = (row.Company ? `${row.Company}-${row.Role || ""}` : inserted.id) as string;
        logSyncEvent({
          tab_name: tab,
          direction: "app_to_sheet",
          operation: "insert",
          record_id: recordId,
          fields_synced: fieldsSynced,
          status: "success",
        });

        return jsonOk({ row: inserted, tab, sheetRowNumber: insertedRowNumber });
      }

      case "update": {
        const id = body.id as string;
        const patch = body.patch as Record<string, unknown>;
        const findBy = body.findBy as Record<string, string> | undefined;
        const rowNumber = Number(body.rowNumber);
        const changeSource = (body.source as string) || "app";
        if (!id && !findBy) return jsonError("Missing 'id' or 'findBy'", 400);
        if (!patch) return jsonError("Missing 'patch'", 400);

        const range = `'${tab}'!A${headerRow}:ZZ10000`;
        const result = await batchGet([range]);
        const allRows = Object.values(result)[0] || [];
        if (allRows.length < 2) return jsonError("No data", 404);

        const headers = allRows[0] as string[];
        if (tab === "LMP Tracker") {
          const validation = validateLmpTrackerHeaders(headers);
          if (validation.error) return jsonError(validation.error, 409);
        }

        let rowIndex = -1;

        // ── Primary lookup: LMP ID (column AA). Immutable per-process key
        //    so updates target the exact row even when multiple rows share
        //    the same Company + Role.
        const lmpIdCol = headers.indexOf("LMP ID");
        const lmpIdFromFindBy = findBy?.["LMP ID"]?.toString().trim();
        if (rowIndex === -1 && lmpIdCol !== -1 && lmpIdFromFindBy) {
          for (let i = 1; i < allRows.length; i++) {
            const v = (allRows[i][lmpIdCol] ?? "").toString().trim();
            if (v && v.toLowerCase() === lmpIdFromFindBy.toLowerCase()) {
              rowIndex = i;
              break;
            }
          }
        }

        if (rowIndex === -1 && Number.isInteger(rowNumber) && rowNumber > headerRow) {
          const candidateIndex = rowNumber - headerRow;
          const companyCol = headers.indexOf("Company");
          const roleCol = headers.indexOf("Role");
          const candidate = allRows[candidateIndex];
          const idBase = id.replace(/--row-\d+$/i, "").toLowerCase();
          const matchesFindBy = candidate && findBy && Object.entries(findBy).every(([col, val]) => {
            const colIdx = headers.indexOf(col);
            return colIdx !== -1 && (candidate[colIdx] ?? "").toString().trim().toLowerCase() === val.trim().toLowerCase();
          });
          const matchesSlug = candidate && companyCol !== -1 && roleCol !== -1 && lmpSlug(candidate[companyCol], candidate[roleCol]) === idBase;
          if (candidateIndex > 0 && candidateIndex < allRows.length && (matchesFindBy || matchesSlug)) rowIndex = candidateIndex;
        }
        if (rowIndex === -1 && tab !== "LMP Tracker" && findBy && !lmpIdFromFindBy) {
          // Legacy lookup (Company+Role etc). Only used when caller did NOT
          // pass an LMP ID — i.e. non-LMP-Tracker tabs.
          for (let i = 1; i < allRows.length; i++) {
            const match = Object.entries(findBy).every(([col, val]) => {
              const colIdx = headers.indexOf(col);
              return colIdx !== -1 && (allRows[i][colIdx] ?? "").toString().trim().toLowerCase() === val.trim().toLowerCase();
            });
            if (match) { rowIndex = i; break; }
          }
        }
        if (rowIndex === -1 && tab !== "LMP Tracker" && id) {
          const idCol = headers.indexOf("id");
          const companyCol = headers.indexOf("Company");
          const roleCol = headers.indexOf("Role");
          for (let i = 1; i < allRows.length; i++) {
            const rowId = idCol === -1 ? "" : (allRows[i][idCol] ?? "").toString();
            const slugId = companyCol === -1 || roleCol === -1 ? "" : lmpSlug(allRows[i][companyCol], allRows[i][roleCol]);
            if (rowId === id || slugId === id.toLowerCase()) { rowIndex = i; break; }
          }
        }
        if (rowIndex === -1) {
          // Sheet row missing — for LMP Tracker, still try to write the patch
          // to lmp_processes so the UI stays consistent. Target by lmp_code
          // (LMP ID) ONLY. Refuse Company+Role fallback to prevent stamping
          // an older duplicate.
          if (tab === "LMP Tracker" && lmpIdFromFindBy) {
            const dbPatch: Record<string, unknown> = {};
            for (const [sc, val] of Object.entries(patch)) {
              const dc = SHEET_TO_DB[sc];
              if (dc) dbPatch[dc] = coerceDbValue(dc, val);
            }
            if (Object.keys(dbPatch).length > 0) {
              dbPatch["sync_source"] = changeSource;
              await serviceClient.from("lmp_processes")
                .update(dbPatch)
                .eq("lmp_code", lmpIdFromFindBy);
              return jsonOk({ skipped_sheet: true, db_updated: true, reason: "sheet_row_missing" });
            }
          }
          if (tab === "LMP Tracker" && !lmpIdFromFindBy) {
            return jsonError(
              "LMP_ID_REQUIRED: LMP Tracker updates must pass findBy['LMP ID']. Refusing Company+Role fallback to prevent updating the wrong duplicate row.",
              400,
            );
          }
          return jsonError(`Row not found`, 404);
        }

        // Auto-stamp Closing Date when Status is set to a terminal value
        // (Converted / Not Converted / Other reasons). Resolved via header
        // lookup so it works regardless of which column "Closing Date" lives in.
        {
          const statusHeader = dbToActualHeader["status"]
            ?? headerLookup[normalize("Status")];
          const closingHeader = dbToActualHeader["closing_date"]
            ?? headerLookup[normalize("Closing Date")];
          if (statusHeader && closingHeader && statusHeader in normalizedPatch) {
            if (isTerminalStatus(normalizedPatch[statusHeader])) {
              normalizedPatch[closingHeader] = formatClosingDateForSheet();
            }
          }
        }

        const existingRow = allRows[rowIndex];

        // Resolve patch keys to actual sheet headers tolerating whitespace
        // and \n variants (e.g. "Next Progress Date" → "Next  Expected
        // Progress (Date)" if that's what the live sheet has).
        const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
        const headerLookup: Record<string, string> = {};
        for (const h of headers) {
          if (typeof h === "string" && h) headerLookup[normalize(h)] = h;
        }
        // Also map any SHEET_TO_DB key whose db col matches an actual header
        // (so a patch using a variant key still routes to the live header).
        const dbToActualHeader: Record<string, string> = {};
        for (const [sheetKey, dbCol] of Object.entries(SHEET_TO_DB)) {
          const actual = headers.indexOf(sheetKey) !== -1 ? sheetKey : headerLookup[normalize(sheetKey)];
          if (actual && !(dbCol in dbToActualHeader)) dbToActualHeader[dbCol] = actual;
        }
        const normalizedPatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          let actual: string | undefined = headers.indexOf(k) !== -1 ? k : headerLookup[normalize(k)];
          if (!actual) {
            const dbCol = SHEET_TO_DB[k];
            if (dbCol) actual = dbToActualHeader[dbCol];
          }
          normalizedPatch[actual || k] = v;
        }

        // Capture before values for audit
        const beforeValues: Record<string, string> = {};
        const afterValues: Record<string, string> = {};

        const actualSheetRow = headerRow + rowIndex;

        // Per-cell updates ONLY for columns that actually changed. Rewriting
        // the full row would re-stamp every cell with USER_ENTERED parsing
        // and clobber dropdowns, data validation, checkboxes, and pill
        // formatting in unrelated columns. Mirrors the sync-db-to-sheet path.
        const cellUpdates: { range: string; values: unknown[][] }[] = [];
        const updated: Record<string, unknown> = {};
        headers.forEach((h: string, i: number) => { updated[h] = existingRow[i] ?? ""; });

        for (const h of Object.keys(normalizedPatch)) {
          const colIdx = headers.indexOf(h);
          if (colIdx === -1) continue;
          const newVal = normalizedPatch[h] ?? "";
          const oldVal = existingRow[colIdx] ?? "";
          beforeValues[h] = String(oldVal);
          afterValues[h] = String(newVal);
          updated[h] = newVal;
          if (String(newVal) === String(oldVal)) continue;
          const colLetter = colIndexToLetter(colIdx);
          cellUpdates.push({
            range: `'${tab}'!${colLetter}${actualSheetRow}`,
            values: [[newVal]],
          });
        }

        // Stamp updatedAt / updatedBy as their own single-cell writes
        // (no collateral damage to other columns).
        const updatedAtIdx = headers.indexOf("updatedAt");
        if (updatedAtIdx !== -1) {
          const ts = new Date().toISOString();
          updated["updatedAt"] = ts;
          cellUpdates.push({
            range: `'${tab}'!${colIndexToLetter(updatedAtIdx)}${actualSheetRow}`,
            values: [[ts]],
          });
        }
        const updatedByIdx = headers.indexOf("updatedBy");
        if (updatedByIdx !== -1 && userId) {
          updated["updatedBy"] = userId;
          cellUpdates.push({
            range: `'${tab}'!${colIndexToLetter(updatedByIdx)}${actualSheetRow}`,
            values: [[userId]],
          });
        }

        if (cellUpdates.length > 0) {
          await batchUpdate(cellUpdates);
        }

        // Also update DB if this is LMP Tracker
        if (tab === "LMP Tracker") {
          // Resolve the row's LMP ID — prefer findBy, fall back to the
          // sheet row's own column AA value. This is the ONLY safe primary
          // key for routing DB updates; Company+Role can collide on
          // duplicate processes.
          const lmpIdCell = lmpIdCol !== -1 ? (existingRow[lmpIdCol] ?? "").toString().trim() : "";
          const targetLmpCode = lmpIdFromFindBy || lmpIdCell || (updated["LMP ID"] as string) || "";
          const company = findBy?.Company || (updated["Company"] as string) || "";
          const role = findBy?.Role || (updated["Role"] as string) || "";
          if (targetLmpCode) {
            const dbPatch: Record<string, unknown> = {};
            // R1/R2/R3 Shortlisted are calculated DB→Sheet only — strip them
            // from the Sheet→DB direction so manual sheet edits to those
            // columns are ignored.
            const SHEET_TO_DB_INGEST: Record<string, string> = { ...SHEET_TO_DB };
            for (const k of [
              "Shortlisted (Pool) - Number", "Shortlisted (Pool) - Name(s)",
              "R1 - Numbers", "R1 - Names",
              "R2 - Numbers", "R2 - Names",
              "R3 - Numbers", "R3 - Names",
              "Final Converted Numbers", "Converted Names",
            ]) delete SHEET_TO_DB_INGEST[k];
            for (const [sheetCol, dbCol] of Object.entries(SHEET_TO_DB_INGEST)) {
              if (sheetCol in patch) dbPatch[dbCol] = coerceDbValue(dbCol, patch[sheetCol]);
            }
            // Mirror the auto-stamped Closing Date when Status becomes terminal.
            if ("status" in dbPatch && isTerminalStatus(dbPatch["status"])) {
              dbPatch["closing_date"] = todayKolkataISODate();
            }
            dbPatch["sync_source"] = changeSource;
            if (Object.keys(dbPatch).length > 1) {
              await serviceClient.from("lmp_processes")
                .update(dbPatch)
                .eq("lmp_code", targetLmpCode);
            }
          } else {
            console.warn(`[sheets-lmp] LMP_ID_MISSING for DB mirror update; company=${company} role=${role}. Skipped DB write to avoid duplicate collision.`);
          }

          // Log field-level audit
          if (Object.keys(beforeValues).length > 0) {
            const auditEntries = Object.keys(beforeValues).map(field => ({
              entity_type: "lmp",
              entity_id: targetLmpCode || (findBy ? `${findBy.Company}-${findBy.Role}` : id),
              action: `field_update:${field}`,
              actor_name: userId || "unknown",
              previous_value: beforeValues[field],
              new_value: afterValues[field],
              metadata: { field, source: changeSource, tab, lmp_code: targetLmpCode },
              source: changeSource,
            }));
            await serviceClient.from("activity_log").insert(auditEntries);
          }
        }

        const recordId = findBy ? `${findBy.Company || ""}-${findBy.Role || ""}` : id;
        logSyncEvent({
          tab_name: tab,
          direction: "app_to_sheet",
          operation: "update",
          record_id: recordId,
          fields_synced: Object.keys(patch),
          status: "success",
        });

        return jsonOk({ row: updated, tab, audit: { before: beforeValues, after: afterValues } });
      }

      case "delete": {
        const id = body.id as string;
        const explicitRowNumber = Number(body.rowNumber);
        const findBy = (body.findBy as Record<string, string>) || null;
        if (!id && !explicitRowNumber && !findBy) {
          return jsonError("Missing 'id', 'rowNumber', or 'findBy'", 400);
        }

        // Resolve the actual sheet row number to delete.
        // CRITICAL: never trust `rowNumber` blindly. Sheet rows shift whenever
        // any row above is deleted, so a `sheet_row_id` stored on a DB row
        // can quickly point at an unrelated LMP. If we have both a row hint
        // AND findBy["LMP ID"], verify the row actually carries that LMP ID
        // before deleting; otherwise fall back to a findBy lookup.
        let actualSheetRow = -1;
        let exactLmpRows: number[] = [];
        const hintedRow = Number.isFinite(explicitRowNumber) && explicitRowNumber > 0
          ? explicitRowNumber
          : -1;
        const lmpIdHint = findBy?.["LMP ID"]?.toString().trim() || "";

        const needSheetRead = hintedRow > 0 || !!findBy;
        let headers: string[] = [];
        let allRows: any[][] = [];
        if (needSheetRead) {
          const range = `'${tab}'!A${headerRow}:ZZ10000`;
          const result = await batchGet([range]);
          allRows = Object.values(result)[0] || [];
          if (allRows.length < 1) return jsonError("No data", 404);
          headers = allRows[0];
          if (tab === "LMP Tracker") {
            const validation = validateLmpTrackerHeaders(headers);
            if (validation.error) return jsonError(validation.error, 409);
            if (validation.lmpIdColumnActual != null) {
              console.warn("[delete] LMP ID column at index", validation.lmpIdColumnActual, "instead of canonical", LMP_ID_COLUMN_INDEX);
            }
            if (!lmpIdHint) return jsonError("LMP_ID_REQUIRED", 400);
            exactLmpRows = findLmpSheetRowIndexes(headers, allRows, lmpIdHint)
              .map((index) => headerRow + index);
          }
        }

        // 1) If we have a row hint, verify identity before trusting it.
        if (hintedRow > 0) {
          const rowIndex = hintedRow - headerRow; // 0 = header row
          const candidateRow = allRows[rowIndex];
          if (candidateRow) {
            if (lmpIdHint) {
              const lmpIdCol = headers.indexOf("LMP ID");
              const cellLmpId = lmpIdCol >= 0 ? (candidateRow[lmpIdCol] ?? "").toString().trim() : "";
              if (cellLmpId && cellLmpId === lmpIdHint) {
                actualSheetRow = hintedRow;
              } else {
                console.warn(
                  `[delete] rowNumber=${hintedRow} carries LMP ID="${cellLmpId}" but caller expected "${lmpIdHint}". Ignoring stale row hint, falling back to findBy lookup.`,
                );
              }
            } else if (findBy && tab !== "LMP Tracker") {
              // No LMP ID to verify against — check all findBy columns match.
              let match = true;
              for (const [k, v] of Object.entries(findBy)) {
                const c = headers.indexOf(k);
                if (c < 0 || (candidateRow[c] ?? "").toString().trim() !== (v ?? "").toString().trim()) {
                  match = false; break;
                }
              }
              if (match) actualSheetRow = hintedRow;
              else console.warn(`[delete] rowNumber=${hintedRow} did not match findBy ${JSON.stringify(findBy)}, falling back to findBy lookup.`);
            } else {
              // No findBy at all — we can't verify. Refuse rather than risk wiping the wrong row.
              console.warn(`[delete] rowNumber=${hintedRow} provided without findBy — refusing to delete unverified row.`);
              return jsonOk({ deleted: false, refused: true, reason: "unverified_row_hint", id, tab, rowNumber: hintedRow });
            }
          } else {
            console.warn(`[delete] rowNumber=${hintedRow} is beyond the current sheet length, falling back to findBy.`);
          }
        }

        // 2) Fallback: scan with findBy.
        if (actualSheetRow < 0 && findBy) {
          if (tab === "LMP Tracker") {
            if (exactLmpRows.length > 0) actualSheetRow = exactLmpRows[0];
          }
        }

        if (actualSheetRow < 0 && findBy && tab !== "LMP Tracker") {
          const colIdx: Record<string, number> = {};
          for (const k of Object.keys(findBy)) colIdx[k] = headers.indexOf(k);
          let rowIndex = -1;
          for (let i = 1; i < allRows.length; i++) {
            let match = true;
            for (const [k, v] of Object.entries(findBy)) {
              const c = colIdx[k];
              if (c < 0) { match = false; break; }
              if ((allRows[i][c] ?? "").toString().trim() !== (v ?? "").toString().trim()) {
                match = false; break;
              }
            }
            if (match) { rowIndex = i; break; }
          }
          if (rowIndex === -1) {
            logSyncEvent({
              tab_name: tab, direction: "app_to_sheet", operation: "delete",
              record_id: id || JSON.stringify(findBy),
              fields_synced: [], status: "success",
              error_message: "row_not_found_treated_as_deleted",
            });
            return jsonOk({ deleted: true, notFound: true, id, tab, message: "Row already absent in sheet" });
          }
          actualSheetRow = headerRow + rowIndex;
        }

        if (actualSheetRow < 0) {
          return jsonOk({ deleted: true, notFound: true, id, tab, message: "No sheet row to delete" });
        }


        if (tab === "LMP Tracker") {
          const deletedRows = await deleteSheetRows(tab, exactLmpRows.length > 0 ? exactLmpRows : [actualSheetRow]);
          const compactedRows = await compactLmpTrackerBlankRows(tab);
          logSyncEvent({
            tab_name: tab,
            direction: "app_to_sheet",
            operation: "delete",
            record_id: lmpIdHint,
            fields_synced: deletedRows.map((row) => `row:${row}`),
            status: "success",
          });
          return jsonOk({
            deleted: true,
            id,
            tab,
            rowNumber: actualSheetRow,
            deletedRows,
            compactedRows,
          });
        }

        // Resolve the numeric sheetId (gid) for the tab.
        let sheetIdNum: number | null = null;
        try {
          const res = await sheetsClient.rawFetch(`${baseUrl}?fields=sheets.properties`);
          if (res.ok) {
            const data = await res.json();
            const match = (data.sheets || []).find((s: any) => s.properties?.title === tab);
            if (match) sheetIdNum = match.properties?.sheetId ?? null;
          }
        } catch (e) {
          console.warn("[delete] metadata fetch failed:", e);
        }
        if (sheetIdNum === null) {
          return jsonError(`Could not resolve sheetId for tab '${tab}'`, 500);
        }

        // Hard-delete the row via spreadsheets:batchUpdate / deleteDimension.
        const reqBody = {
          requests: [{
            deleteDimension: {
              range: {
                sheetId: sheetIdNum,
                dimension: "ROWS",
                startIndex: actualSheetRow - 1, // 0-indexed, inclusive
                endIndex: actualSheetRow,        // exclusive
              },
            },
          }],
        };
        const delRes = await sheetsClient.rawFetch(`${baseUrl}:batchUpdate`, {
          method: "POST",
          body: JSON.stringify(reqBody),
        });
        if (!delRes.ok) {
          const txt = await delRes.text();
          return jsonError(`deleteDimension [${delRes.status}]: ${txt.slice(0, 300)}`, 500);
        }

        // Invalidate cached ranges so reads don't show the deleted row.
        rangeCache.clear();

        logSyncEvent({
          tab_name: tab,
          direction: "app_to_sheet",
          operation: "delete",
          record_id: id || `row:${actualSheetRow}`,
          fields_synced: [`row:${actualSheetRow}`],
          status: "success",
        });

        return jsonOk({ deleted: true, id, tab, rowNumber: actualSheetRow });
      }

      case "sync-db-to-sheet": {
        // Sync a DB record back to the sheet (bidirectional: DB→Sheet)
        const company = body.company as string;
        const role = body.role as string;
        const lmpCode = (body.lmp_code as string | null | undefined) ?? null;
        const dbPatch = body.dbPatch as Record<string, unknown>;
        if (!company || !role) return jsonError("Missing company or role", 400);
        if (!dbPatch) return jsonError("Missing dbPatch", 400);

        const range = `'${tab}'!A${headerRow}:ZZ10000`;
        const result = await batchGet([range]);
        const allRows = Object.values(result)[0] || [];
        if (allRows.length < 1) return jsonError("Sheet has no header row", 404);
        // allRows.length === 1 (headers only) is valid → falls through to append branch below.

        const headers = allRows[0];
        let lookup = findLmpSheetRow(headers, allRows, { lmpCode, company, role });

        // Auto-deduplicate: when multiple rows share the same LMP ID, keep the
        // richest row (most non-empty cells) and delete the rest before syncing.
        if (lookup.error === "DUPLICATE_LMP_ID_ROWS" && lmpCode) {
          const dupeIndexes = findLmpSheetRowIndexes(headers, allRows, lmpCode);
          if (dupeIndexes.length > 1) {
            const scoreRow = (row: unknown[]) =>
              row.filter((c) => String(c ?? "").trim() !== "" && String(c ?? "").trim().toLowerCase() !== "false").length;
            const best = dupeIndexes.reduce((a, b) =>
              scoreRow(allRows[a] ?? []) >= scoreRow(allRows[b] ?? []) ? a : b
            );
            const toDelete = dupeIndexes.filter((i) => i !== best).map((i) => headerRow + i);
            try {
              await deleteSheetRows(tab, toDelete);
              console.log(`[sync-db-to-sheet] auto-dedup deleted rows ${toDelete} for ${lmpCode}`);
              // Re-read sheet after deletions so row indices are fresh.
              rangeCache.clear();
              const freshResult = await batchGet([range]);
              const freshRows = Object.values(freshResult)[0] || [];
              lookup = findLmpSheetRow(freshRows[0] ?? [], freshRows, { lmpCode, company, role });
            } catch (e) {
              console.warn(`[sync-db-to-sheet] auto-dedup failed for ${lmpCode}:`, e);
            }
          }
        }

        if (lookup.lmpIdColumnActual != null) {
          console.warn("[sync-db-to-sheet] LMP ID column drift: found at index", lookup.lmpIdColumnActual, "instead of canonical", LMP_ID_COLUMN_INDEX, "— proceeding with actual position");
        }
        if (lookup.error) {
          console.error("[sheets-lmp] unsafe LMP Tracker headers", {
            operation: op,
            lmp_code: lmpCode,
            failure_reason: lookup.error,
            lmp_id_header_columns: lookup.matches.map((index) => colIndexToLetter(index)),
          });
          return jsonError(lookup.error, 409);
        }
        const rowIndex = lookup.rowIndex;

        // A supplied lmp_code is authoritative. If that exact ID is absent,
        // append a distinct row even when company/role matches an older LMP.
        // Without lmp_code we can't safely identify a missing record later.
        const isAppend = rowIndex === -1;
        if (isAppend && !lmpCode) {
          console.warn(`[sync-db-to-sheet] sheet row missing for ${company} / ${role} (no lmp_code) on tab "${tab}" — skipping append`);
          return jsonOk({ skipped: true, reason: "row_not_found_no_lmp_code", tab, company, role });
        }


        // DB → Sheet map (canonical, shared). Includes the previously-missing
        // behavioral_status, match_tag, allocation_path, mentor_selected and
        // lmp_code so UI edits to those fields actually reach the sheet.
        const reverseFieldMap: Record<string, string> = {
          ...DB_TO_SHEET,
          // Legacy synthetic columns not in DB_TO_SHEET:
          prep_progress: "Prep Progress",
          placement_progress: "Placement Progress",
        };

        // Resolve a mapped sheet column to the actual header in this sheet,
        // tolerating "\n" vs space differences (e.g. "Next Expected\nProgress"
        // vs "Next Expected Progress"). Returns null if no variant exists.
        const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
        const headerLookup: Record<string, string> = {};
        for (const h of headers) {
          if (typeof h === "string" && h) headerLookup[normalize(h)] = h;
        }
        const resolveHeader = (col: string): string | null => {
          if (headers.indexOf(col) !== -1) return col;
          return headerLookup[normalize(col)] ?? null;
        };

        const sheetPatch: Record<string, unknown> = {};
        for (const [dbCol, val] of Object.entries(dbPatch)) {
          const sheetCol = reverseFieldMap[dbCol];
          if (!sheetCol) continue;
          const actual = resolveHeader(sheetCol);
          if (!actual) continue;
          // Status must be written using the exact sheet dropdown label so
          // the cell keeps its data-validation color coding.
          sheetPatch[actual] = dbCol === "status" ? normalizeStatusForSheet(val) : val;
        }

        // Auto-stamp Closing Date when Status flips to a terminal value.
        if ("status" in dbPatch && isTerminalStatus(dbPatch["status"])) {
          const closingHeader = resolveHeader("Closing Date");
          if (closingHeader) sheetPatch[closingHeader] = formatClosingDateForSheet();
        }

        // Calculated DB→Sheet columns (counts + mentor rating). Pull from
        // lmp_full_view so the numbers always match what the UI shows.
        try {
          const { data: calc } = await serviceClient
            .from("lmp_full_view")
            .select("pool_count, r1_count, r2_count, r3_count, offer_count, mentor_feedback_avg, mentor_name, prep_poc_names, support_poc_names, outreach_poc_names")
            .eq("lmp_code", lmpCode)
            .maybeSingle();
          if (calc) {
            const calcMap: Record<string, unknown> = {
              "Shortlisted (Pool) - Number": calc.pool_count ?? 0,
              "Shortlisted (Pool) - Name(s)": (dbPatch as Record<string, unknown>).pool_names ?? "",
              "R1 - Numbers": calc.r1_count ?? 0,
              "R1 - Names": (dbPatch as Record<string, unknown>).r1_names ?? "",
              "R2 - Numbers": calc.r2_count ?? 0,
              "R2 - Names": (dbPatch as Record<string, unknown>).r2_names ?? "",
              "R3 - Numbers": calc.r3_count ?? 0,
              "R3 - Names": (dbPatch as Record<string, unknown>).r3_names ?? "",
              "Final Converted Numbers": (dbPatch as Record<string, unknown>).final_converted_numbers ?? "",
              "Converted Names": (dbPatch as Record<string, unknown>).final_converted_names ?? "",
              "Mentor Rating": calc.mentor_feedback_avg && Number(calc.mentor_feedback_avg) > 0
                ? Number(calc.mentor_feedback_avg).toFixed(1)
                : "",
              "Mentor Selected": calc.mentor_name ?? dbPatch.mentor_selected ?? "",
              "Prep POC": calc.prep_poc_names ?? dbPatch.prep_poc ?? "",
              "Support POC": calc.support_poc_names ?? dbPatch.support_poc ?? "",
              "Outreach POC": calc.outreach_poc_names ?? dbPatch.outreach_poc ?? "",
            };
            for (const [h, v] of Object.entries(calcMap)) {
              const actual = resolveHeader(h);
              if (actual) sheetPatch[actual] = v;
            }
          }
          const { data: overview } = await serviceClient
            .from("lmp_processes_overview")
            .select("candidate_count")
            .eq("lmp_code", lmpCode)
            .maybeSingle();
          const candidateCountHeader = resolveHeader("Candidate Count");
          if (candidateCountHeader) sheetPatch[candidateCountHeader] = overview?.candidate_count ?? 0;
        } catch (e) {
          console.warn("Failed to compute calculated columns:", e);
        }

        // For appends, make sure the identifying columns are always populated
        // so the row can be found by later sync-db-to-sheet calls.
        if (isAppend) {
          const companyHeader = resolveHeader("Company");
          const roleHeader = resolveHeader("Role");
          const lmpIdHeader = resolveHeader("LMP ID");
          if (companyHeader) sheetPatch[companyHeader] = company;
          if (roleHeader) sheetPatch[roleHeader] = role;
          if (lmpIdHeader && lmpCode) sheetPatch[lmpIdHeader] = lmpCode;
        }

        if (isAppend) {
          const compactedRows = tab === "LMP Tracker"
            ? await compactLmpTrackerBlankRows(tab)
            : [];
          const newValues = headers.map((h: string) => {
            if (h === "updatedAt") return new Date().toISOString();
            if (h in sheetPatch) return sheetPatch[h] ?? "";
            return "";
          });
          const insertedRowNumber = tab === "LMP Tracker"
            ? await insertRowAtTop(tab, newValues)
            : await appendRow(tab, newValues);

          // Post-insert concurrent-write guard: two sweeper invocations for the
          // same job can both reach isAppend=true when they both read the sheet
          // before either has inserted (TOCTOU race). After inserting, re-read
          // column AA and immediately dedup if a parallel insert snuck in.
          if (tab === "LMP Tracker" && lmpCode) {
            try {
              rangeCache.clear();
              const dedupResult = await batchGet([range]);
              const dedupRows = Object.values(dedupResult)[0] || [];
              const dedupIndexes = findLmpSheetRowIndexes(dedupRows[0] ?? [], dedupRows, lmpCode);
              if (dedupIndexes.length > 1) {
                const scoreRow = (row: unknown[]) =>
                  row.filter((c) => String(c ?? "").trim() !== "" && String(c ?? "").trim().toLowerCase() !== "false").length;
                const best = dedupIndexes.reduce((a, b) =>
                  scoreRow(dedupRows[a] ?? []) >= scoreRow(dedupRows[b] ?? []) ? a : b
                );
                const toDelete = dedupIndexes.filter((i) => i !== best).map((i) => headerRow + i);
                await deleteSheetRows(tab, toDelete);
                console.log(`[sync-db-to-sheet] post-insert dedup: removed ${toDelete.length} duplicate row(s) for ${lmpCode} (sheet rows ${toDelete})`);
              }
            } catch (e) {
              console.warn(`[sync-db-to-sheet] post-insert dedup check failed for ${lmpCode}:`, e);
            }
          }

          // Persist the new sheet row number on lmp_processes so future
          // sync-db-to-sheet calls can find the row by sheet_row_id even
          // before col AA (LMP ID) is populated.
          if (lmpCode && Number.isFinite(insertedRowNumber) && insertedRowNumber > 0) {
            try {
              await serviceClient
                .from("lmp_processes")
                .update({ sheet_row_id: String(insertedRowNumber), sync_source: "trigger_mirror" })
                .eq("lmp_code", lmpCode);
            } catch (e) {
              console.warn("[sync-db-to-sheet] failed to persist sheet_row_id:", e);
            }
          }
          logSyncEvent({
            tab_name: tab, direction: "app_to_sheet", operation: "insert",
            record_id: lmpCode ?? `${company}-${role}`,
            fields_synced: Object.keys(sheetPatch), status: "success",
          });
          console.log("[sheets-lmp] DB to Sheet insert", {
            operation: op,
            lmp_code: lmpCode,
            sheet_row_found: false,
            sheet_row: insertedRowNumber,
            columns_updated: Object.keys(sheetPatch),
          });
          return jsonOk({ inserted: true, company, role, lmp_code: lmpCode, rowNumber: insertedRowNumber, compactedRows, sheetRowFound: false, columnsUpdated: Object.keys(sheetPatch), fieldsUpdated: Object.keys(sheetPatch) });
        }

        const existingRow = allRows[rowIndex];
        const actualSheetRow = headerRow + rowIndex;

        // Per-cell updates ONLY for the columns that actually changed.
        // Rewriting the full row would re-stamp every cell with USER_ENTERED
        // parsing and risk clobbering manual edits/formatting in unrelated
        // columns. This keeps the sheet's existing formatting intact.
        const updates: { range: string; values: unknown[][] }[] = [];
        // Live sheet uses "Comments" (plural); fall back to "Comment" for older sheets.
        const commentHeaderActual = resolveHeader("Comments") ?? resolveHeader("Comment");
        for (const h of Object.keys(sheetPatch)) {
          const colIdx = headers.indexOf(h);
          if (colIdx === -1) continue;
          const newVal = sheetPatch[h] ?? "";
          const oldVal = existingRow[colIdx] ?? "";
          if (String(newVal) === String(oldVal)) continue;
          // Bidirectional Comment column: never clobber a non-empty sheet
          // comment with an empty DB value. The sheet is authoritative when
          // the DB side is blank (sheets-pull-comments will pick up the
          // sheet's value on the next sweep).
          if (commentHeaderActual && h === commentHeaderActual) {
            const newStr = String(newVal ?? "").trim();
            const oldStr = String(oldVal ?? "").trim();
            if (newStr === "" && oldStr !== "") continue;
          }
          const colLetter = colIndexToLetter(colIdx);
          updates.push({
            range: `'${tab}'!${colLetter}${actualSheetRow}`,
            values: [[newVal]],
          });
        }
        if (updates.length > 0) {
          await batchUpdate(updates);
        }

        logSyncEvent({
          tab_name: tab, direction: "app_to_sheet", operation: "sync-db-to-sheet",
          record_id: `${company}-${role}`,
          fields_synced: updates.map((u) => u.range), status: "success",
        });

        const columnsUpdated = Object.keys(sheetPatch).filter((header) =>
          updates.some((update) => update.range.includes(`${colIndexToLetter(headers.indexOf(header))}${actualSheetRow}`))
        );
        console.log("[sheets-lmp] DB to Sheet update", {
          operation: op,
          lmp_code: lmpCode,
          sheet_row_found: true,
          sheet_row: actualSheetRow,
          columns_updated: columnsUpdated,
        });
        return jsonOk({ synced: true, company, role, lmp_code: lmpCode, sheetRowFound: true, rowNumber: actualSheetRow, columnsUpdated, fieldsUpdated: updates.map((u) => u.range) });
      }


      case "lmp-reconcile": {
        // Full DB↔Sheet reconciliation for LMP Tracker:
        //   1. Dedup sheet rows by LMP ID (column AA) — keep richest
        //   2. Delete orphan sheet rows not present in DB
        //   3. Delete blank rows between LMP rows
        //   4. Insert missing DB LMPs as blank rows at top
        //   5. Sort all rows newest-first by writing sorted values
        //   6. Update lmp_processes.sheet_row_id with actual positions

        if (!internalRequest && userRole !== "admin") {
          return jsonError("ADMIN_REQUIRED: lmp-reconcile is admin-only", 403);
        }
        if (tab !== "LMP Tracker") {
          return jsonError("lmp-reconcile only works on LMP Tracker", 400);
        }

        const reconcileRange = `'${tab}'!A${headerRow}:ZZ10000`;

        // ── 0. Fetch all non-archived DB LMPs, newest-created first ────────────
        // Business ordering is creation order, not the user-editable LMP date.
        // This keeps the most recently created LMP at row 15 after reconcile.
        const { data: rawDbLmps, error: dbErr } = await serviceClient
          .from("lmp_processes")
          .select("*")
          .not("lmp_code", "is", null)
          .or("is_archived.is.null,is_archived.eq.false")
          .order("created_at", { ascending: false })
          .order("id", { ascending: false });
        if (dbErr) return jsonError(`DB read failed: ${dbErr.message}`, 500);
        const dbLmps: any[] = rawDbLmps ?? [];
        if (dbLmps.length === 0) return jsonOk({ reconciled: true, message: "No active LMPs in DB" });

        // Fetch calculated POC / mentor / shortlist counts from lmp_full_view
        const { data: calcRows } = await serviceClient
          .from("lmp_full_view")
          .select("lmp_code,pool_count,r1_count,r2_count,r3_count,offer_count,mentor_feedback_avg,mentor_name,prep_poc_names,support_poc_names,outreach_poc_names")
          .not("lmp_code", "is", null);
        const calcByCode = new Map<string, any>(
          (calcRows ?? []).map((c: any) => [String(c.lmp_code).toLowerCase(), c])
        );

        const dbCodeSet = new Set(dbLmps.map((l: any) => String(l.lmp_code).trim().toLowerCase()));

        // ── 1. Read sheet ──────────────────────────────────────────────────────
        rangeCache.clear();
        const sheetResult = await batchGet([reconcileRange]);
        const sheetRows = Object.values(sheetResult)[0] as unknown[][] || [];
        if (sheetRows.length < 1) return jsonError("Sheet has no header row", 404);
        const sheetHeaders = sheetRows[0] as string[];
        const headerValidation = validateLmpTrackerHeaders(sheetHeaders);
        if (headerValidation.error && headerValidation.error !== "MISALIGNED_LMP_TRACKER_HEADERS") {
          return jsonError(headerValidation.error, 409);
        }
        const lmpIdColIdx = headerValidation.lmpIdColumn !== -1
          ? headerValidation.lmpIdColumn
          : LMP_ID_COLUMN_INDEX;

        // Build: sheetCode → [rowIndexes in sheetRows (1-based index, sheetRows[1]=row15)]
        const sheetCodeToIndexes = new Map<string, number[]>();
        for (let i = 1; i < sheetRows.length; i++) {
          const cellVal = String(sheetRows[i]?.[lmpIdColIdx] ?? "").trim();
          if (!cellVal) continue;
          const key = cellVal.toLowerCase();
          const existing = sheetCodeToIndexes.get(key) ?? [];
          existing.push(i);
          sheetCodeToIndexes.set(key, existing);
        }

        const report: Record<string, any> = {
          db_count: dbLmps.length,
          sheet_lmp_count_before: sheetCodeToIndexes.size,
          duplicates: [] as string[],
          orphans: [] as string[],
          missing: [] as string[],
        };

        // ── 2. Mark rows to delete (dupes + orphans) ──────────────────────────
        const rowsToDelete: number[] = [];
        const scoreRow = (row: unknown[]) =>
          (row ?? []).filter((c) => {
            const v = String(c ?? "").trim();
            return v !== "" && v.toLowerCase() !== "false";
          }).length;

        for (const [code, indexes] of sheetCodeToIndexes) {
          if (indexes.length > 1) {
            report.duplicates.push(code);
            const best = indexes.reduce((a, b) =>
              scoreRow(sheetRows[a] ?? []) >= scoreRow(sheetRows[b] ?? []) ? a : b
            );
            for (const idx of indexes) {
              if (idx !== best) rowsToDelete.push(headerRow + idx);
            }
            sheetCodeToIndexes.set(code, [best]);
          }
          if (!dbCodeSet.has(code)) {
            report.orphans.push(code);
            for (const idx of (sheetCodeToIndexes.get(code) ?? [])) {
              rowsToDelete.push(headerRow + idx);
            }
          }
        }

        if (rowsToDelete.length > 0) {
          await deleteSheetRows(tab, [...new Set(rowsToDelete)]);
          console.log(`[lmp-reconcile] deleted ${rowsToDelete.length} dupe/orphan rows`);
        }
        await compactLmpTrackerBlankRows(tab);

        // ── 3. Re-read to count rows after cleanup ────────────────────────────
        rangeCache.clear();
        const cleanResult = await batchGet([reconcileRange]);
        const cleanRows = Object.values(cleanResult)[0] as unknown[][] || [];
        const cleanHeaders = cleanRows[0] as string[];

        const presentCodes = new Set<string>();
        let lastLmpRowIdx = 0; // 1-based index in cleanRows
        for (let i = 1; i < cleanRows.length; i++) {
          const cellVal = String(cleanRows[i]?.[lmpIdColIdx] ?? "").trim();
          if (cellVal) {
            presentCodes.add(cellVal.toLowerCase());
            lastLmpRowIdx = i;
          }
        }
        const currentLmpCount = presentCodes.size;
        const targetCount = dbLmps.length;
        const missingCount = Math.max(0, targetCount - currentLmpCount);
        report.missing = dbLmps
          .filter((l: any) => !presentCodes.has(String(l.lmp_code).toLowerCase()))
          .map((l: any) => l.lmp_code);

        // ── 4. Re-read after cleanup; build resolveHeader ─────────────────────
        // Do not insert temporary blank rows. Google Sheets already has writable
        // rows below the current data section, and the single values batch below
        // fills every active LMP row deterministically without a visible blank
        // intermediate state.
        rangeCache.clear();
        const preWriteResult = await batchGet([reconcileRange]);
        const preWriteRows = Object.values(preWriteResult)[0] as unknown[][] || [];
        const finalHeaders = preWriteRows[0] as string[];

        const normH = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
        const hLookup: Record<string, string> = {};
        for (const h of finalHeaders) {
          if (typeof h === "string" && h) hLookup[normH(h)] = h;
        }
        const resolveHeader = (col: string): string | null => {
          if (finalHeaders.indexOf(col) !== -1) return col;
          return hLookup[normH(col)] ?? null;
        };

        // Build reverseFieldMap once
        const rfm: Record<string, string> = {
          ...DB_TO_SHEET,
          prep_progress: "Prep Progress",
          placement_progress: "Placement Progress",
        };

        // Build row values for one LMP
        const buildRow = (lmp: any): unknown[] => {
          const calc = calcByCode.get(String(lmp.lmp_code ?? "").toLowerCase()) ?? {};
          const patch: Record<string, unknown> = {};
          for (const [dbCol, sheetCol] of Object.entries(rfm)) {
            const actual = resolveHeader(sheetCol);
            if (!actual) continue;
            const val = lmp[dbCol];
            if (val === undefined || val === null || val === "") continue;
            patch[actual] = dbCol === "status" ? normalizeStatusForSheet(val) : val;
          }
          // Calculated / aggregated columns
          const calcOverrides: Record<string, unknown> = {
            "Shortlisted (Pool) - Number": calc.pool_count ?? 0,
            "Shortlisted (Pool) - Name(s)": lmp.pool_names ?? "",
            "R1 - Numbers": calc.r1_count ?? 0,
            "R1 - Names": lmp.r1_names ?? "",
            "R2 - Numbers": calc.r2_count ?? 0,
            "R2 - Names": lmp.r2_names ?? "",
            "R3 - Numbers": calc.r3_count ?? 0,
            "R3 - Names": lmp.r3_names ?? "",
            "Final Converted Numbers": lmp.final_converted_numbers ?? "",
            "Converted Names": lmp.final_converted_names ?? "",
            "Mentor Rating": calc.mentor_feedback_avg && Number(calc.mentor_feedback_avg) > 0
              ? Number(calc.mentor_feedback_avg).toFixed(1) : (lmp.mentor_rating ?? ""),
            "Mentor Selected": calc.mentor_name ?? lmp.mentor_selected ?? "",
            "Prep POC": calc.prep_poc_names ?? lmp.prep_poc ?? "",
            "Support POC": calc.support_poc_names ?? lmp.support_poc ?? "",
            "Outreach POC": calc.outreach_poc_names ?? lmp.outreach_poc ?? "",
          };
          for (const [h, v] of Object.entries(calcOverrides)) {
            const actual = resolveHeader(h);
            if (actual) patch[actual] = v;
          }
          // Always set identity columns
          const lmpIdH = resolveHeader("LMP ID");
          if (lmpIdH) patch[lmpIdH] = lmp.lmp_code;
          const companyH = resolveHeader("Company");
          if (companyH) patch[companyH] = lmp.company ?? "";
          const roleH = resolveHeader("Role");
          if (roleH) patch[roleH] = lmp.role ?? "";

          return finalHeaders.map((h: string) => patch[h] ?? "");
        };

        // ── 5. Overwrite rows 15..14+N with sorted DB data ────────────────────
        // dbLmps is already ordered by created_at desc (newest first = row 15).
        const sortedBatch: { range: string; values: unknown[][] }[] = [];
        for (let i = 0; i < dbLmps.length; i++) {
          const targetRow = headerRow + 1 + i;  // row 15 = i=0, row 16 = i=1, ...
          sortedBatch.push({
            range: `'${tab}'!A${targetRow}`,
            values: [buildRow(dbLmps[i])],
          });
        }

        // One values.batchUpdate request avoids a partially rewritten tracker
        // becoming visible between chunks.
        await batchUpdate(sortedBatch);
        console.log(`[lmp-reconcile] wrote ${sortedBatch.length} sorted LMP rows`);

        // ── 6. Re-read and update sheet_row_id in DB ──────────────────────────
        rangeCache.clear();
        const finalResult = await batchGet([reconcileRange]);
        const finalRows = Object.values(finalResult)[0] as unknown[][] || [];

        const rowIdUpdates: Promise<any>[] = [];
        for (let i = 1; i < finalRows.length; i++) {
          const cellVal = String(finalRows[i]?.[lmpIdColIdx] ?? "").trim();
          if (!cellVal) continue;
          const actualRow = headerRow + i;
          rowIdUpdates.push(
            serviceClient
              .from("lmp_processes")
              .update({ sheet_row_id: String(actualRow), sync_source: "trigger_mirror" })
              .eq("lmp_code", cellVal)
              .then(() => {})
              .catch((e: unknown) =>
                console.warn(`[lmp-reconcile] sheet_row_id update failed for ${cellVal}:`, e)
              )
          );
        }
        await Promise.all(rowIdUpdates);

        report.sheet_lmp_count_after = dbLmps.length;
        report.rows_deleted = rowsToDelete.length;
        report.rows_inserted = 0;

        logSyncEvent({
          tab_name: tab, direction: "app_to_sheet", operation: "lmp-reconcile",
          record_id: "all", fields_synced: [], status: "success",
        });
        console.log("[lmp-reconcile] completed", report);
        return jsonOk({ reconciled: true, report });
      }

      default:
        return jsonError(`Unknown op '${op}'`, 400);
    }
  } catch (err) {
    console.error("sheets-lmp error:", err);
    
    // Log error sync event
    if (tab) {
      logSyncEvent({
        tab_name: tab,
        direction: op === "list" || op === "get" ? "sheet_to_app" : "app_to_sheet",
        operation: op,
        status: "error",
        error_message: err instanceof Error ? err.message : "Unknown error",
      });
    }

    if (isRateLimitError(err)) {
      const payload = {
        fallback: true,
        code: "SHEETS_RATE_LIMITED",
        message: "Google Sheets quota exceeded — write queued for retry.",
        retryAfterSeconds: 60,
      };

      // Stamp cooldown on the tab so subsequent writes auto-queue.
      if (tab) {
        try {
          const cooldownUntil = new Date(Date.now() + 60 * 1000).toISOString();
          await serviceClient.from("sheets_sync_log").upsert({
            tab_name: tab,
            rate_limited_until: cooldownUntil,
            last_status: "rate_limited",
            updated_at: new Date().toISOString(),
          }, { onConflict: "tab_name" });
        } catch (e) {
          console.warn("set cooldown failed:", e);
        }
      }

      if (op === "metadata") return jsonOk({ ...payload, sheets: [], spreadsheetId: SPREADSHEET_ID });
      if (op === "list") return jsonOk({ ...payload, rows: [], tab, count: 0, headers: [] });
      if (op === "get") return jsonOk({ ...payload, row: null, tab });
      if (WRITE_OPS.has(op)) {
        // Always enqueue a retry — even when the sweeper itself was the
        // caller. Without this, the in-flight payload is permanently lost
        // the moment Google Sheets returns 429.
        await enqueueWrite("rate_limited");
        return jsonOk({ ...payload, queued: true, skipped: true, tab, row: null });
      }
      return jsonError(payload.message, 429);
    }
    
    return jsonError(err instanceof Error ? err.message : "Unknown error", 500);
  }
});

function generateId(): string {
  return `LMP-${Date.now().toString(36).toUpperCase()}`;
}

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
