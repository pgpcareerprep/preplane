import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Sheet queue Invalid JWT release", () => {
  const worker = read("supabase/functions/sheets-retry-sweeper/index.ts");
  const sheets = read("supabase/functions/sheets-lmp/index.ts");
  const auth = read("supabase/functions/_shared/requireAuth.ts");
  const migration = read("supabase/migrations/20260611020000_fix_sheet_queue_internal_auth_and_immediate_dispatch.sql");

  it("sends both service-role bearer auth and the internal worker secret", () => {
    expect(worker).toContain("Authorization: `Bearer ${SERVICE_ROLE}`");
    expect(worker).toContain('"x-internal-secret": internalSyncSecret');
    expect(worker).toContain('Deno.env.get("INTERNAL_SYNC_SECRET")');
    expect(worker).toContain('.from("_internal_cron_auth")');
    expect(worker).toContain("apikey: SERVICE_ROLE");
  });

  it("accepts a valid internal-secret worker without requiring a user JWT", () => {
    const config = read("supabase/config.toml");
    expect(config).toContain("[functions.sheets-lmp]\nverify_jwt = false");
    expect(config).toContain("[functions.sheets-retry-sweeper]\nverify_jwt = false");
    expect(sheets).toContain("const internalRequest = await hasValidInternalSecret(req)");
    expect(sheets).toContain("if (!internalRequest)");
    expect(sheets).toContain("await requireAuth(req, corsHeaders)");
    expect(auth).toContain('Deno.env.get("INTERNAL_SYNC_SECRET")');
  });

  it("rejects missing or invalid internal secrets and preserves normal user auth", () => {
    expect(auth).toContain("if (!supplied) return false");
    expect(auth).toContain("supplied === configured");
    expect(sheets).toContain("if (\"error\" in auth) return auth.error");
  });

  it("immediately dispatches durable queue work and safely retries Invalid JWT failures", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.dispatch_sheet_retry_sweeper()");
    expect(migration).toContain("PERFORM public.dispatch_sheet_retry_sweeper()");
    expect(migration).toContain("last_error ILIKE '%Invalid JWT%'");
    expect(migration).toContain("attempts = 0");
    expect(migration).toContain("last_error = NULL");
    expect(worker).toContain('requestBody?.queue_id');
    expect(worker).toContain('queueQuery.eq("id", requestedQueueId)');
  });

  it("routes LMP Tracker writes by immutable LMP ID and logs queue diagnostics", () => {
    expect(sheets).toContain('.eq("lmp_code", lmpCode)');
    expect(sheets).not.toContain("dbRow.company");
    expect(sheets).not.toContain("dbRow.role");
    expect(sheets).toContain('tab !== "LMP Tracker" && findBy && !lmpIdFromFindBy');
    expect(sheets).toContain('tab !== "LMP Tracker" && id');
    expect(worker).toContain("queue_id:");
    expect(worker).toContain("columns_updated:");
    expect(worker).toContain("failure_reason:");
  });

  it("maps requested LMP columns and calculated candidate/POC/mentor values", () => {
    const fieldMap = read("supabase/functions/_shared/fieldMap.ts");
    for (const mapping of [
      'date: "Date"',
      'company: "Company"',
      'role: "Role"',
      'domain_raw: "Domain"',
      'status: "Status"',
      'type: "Type"',
      'daily_progress: "Daily Progress"',
      'next_progress_date: "Next Progress Date"',
      'next_progress_type: "Next Progress Type"',
      'jd_url: "JD"',
      'mentor_selected: "Mentor Selected"',
      'prep_poc: "Prep POC"',
      'support_poc: "Support POC"',
      'outreach_poc: "Outreach POC"',
      'lmp_code: "LMP ID"',
    ]) expect(fieldMap).toContain(mapping);
    expect(sheets).toContain('.from("lmp_processes_overview")');
    expect(sheets).toContain('"Candidate Count"');
    expect(sheets).toContain('"Mentor Selected"');
  });

  it("uses canonical row 14 and never mutates LMP Tracker headers", () => {
    const schema = read("src/lib/sheets/schema.ts");
    const identity = read("supabase/functions/_shared/lmpSheetIdentity.ts");
    const migration = read("supabase/migrations/20260611033000_fix_lmp_tracker_identity_and_header_row.sql");
    const allMirrorMigration = read("supabase/migrations/20260611101500_fix_all_lmp_mirror_header_row.sql");
    expect(schema).toContain("[TABS.LMP_TRACKER]: 14");
    expect(identity).toContain("LMP_ID_COLUMN_INDEX = 26");
    expect(sheets).toContain("? LMP_TRACKER_HEADER_ROW");
    expect(sheets).not.toContain("Header bootstrap");
    expect(sheets).not.toContain('"JD Upload"');
    expect(migration).toContain("'headerRow', 14");
    expect(migration).toContain("jsonb_set(payload, '{headerRow}', '14'::jsonb, true)");
    expect(allMirrorMigration).toContain("CREATE OR REPLACE FUNCTION public.enqueue_all_lmp_sheet_mirrors()");
    expect(allMirrorMigration).toContain("'headerRow', 14");
    expect(allMirrorMigration).not.toContain("'headerRow', 15");
    expect(allMirrorMigration).not.toContain("attempts");
    expect(allMirrorMigration).not.toContain("status = 'pending',");
    expect(worker).toContain("unsafeSheetIdentity");
    expect(worker).toContain("MISALIGNED_LMP_TRACKER_HEADERS");
    expect(sheets).toContain("const safePayload = isLmpTracker");
    expect(sheets).toContain("payload: safePayload");
    expect(sheets).toContain("if (duplicateLookup.error) return jsonError(duplicateLookup.error, 409)");
  });

  it("retries only the retired full-header-label failure after identity-safe validation", () => {
    const migration = read("supabase/migrations/20260611110000_retry_safe_lmp_sheet_header_drift.sql");
    expect(migration).toContain("last_error = 'MISALIGNED_LMP_TRACKER_HEADERS'");
    expect(migration).toContain("DISTINCT ON (COALESCE(idempotency_key, id::text))");
    expect(migration).toContain("pending.idempotency_key = failed.idempotency_key");
    expect(migration).toContain("SELECT public.dispatch_sheet_retry_sweeper()");
    expect(migration).not.toContain("DUPLICATE_LMP_ID_ROWS");
    expect(migration).not.toContain("MISALIGNED_LMP_ID_HEADER");
  });

  it("provides an admin-only non-destructive integrity report", () => {
    expect(sheets).toContain('["lmp-integrity-report", "lmp-compact"].includes(op)');
    expect(sheets).toContain("buildLmpSheetIntegrityReport");
    expect(sheets).toContain("dryRun: true");
  });

  it("keeps LMP create and delete rows compact without deleting populated rows", () => {
    const sheets = read("supabase/functions/sheets-lmp/index.ts");
    expect(sheets).toContain('case "lmp-compact"');
    expect(sheets).toContain("compactLmpTrackerBlankRows(tab)");
    expect(sheets).toContain("findLmpSheetRowIndexes(headers, allRows, lmpIdHint)");
    expect(sheets).toContain("deleteSheetRows(tab, exactLmpRows.length > 0 ? exactLmpRows : [actualSheetRow])");
  });
});
