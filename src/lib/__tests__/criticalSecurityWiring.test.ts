import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("critical security wiring", () => {
  it("requires internal authorization for the sheet retry sweeper", () => {
    const source = read("supabase/functions/sheets-retry-sweeper/index.ts");
    expect(source).toContain("requireInternalSecret");
    expect(source).toContain('if ("error" in auth) return auth.error');
  });

  it("requires admin or internal authorization for privileged manual jobs", () => {
    for (const path of [
      "supabase/functions/progress-reminder-cron/index.ts",
      "supabase/functions/sheets-backfill-lmp-id/index.ts",
    ]) {
      expect(read(path)).toContain("requireAdminOrInternal");
    }
  });

  it("does not allow non-admin test-email recipient overrides", () => {
    const source = read("supabase/functions/send-test-reminder-email/index.ts");
    expect(source).toContain('auth.user.role === "admin" && requestedTo');
    expect(source).toContain(": auth.user.email");
  });

  it("stores authenticated creator identity instead of a role label", () => {
    const page = read("src/pages/CreateLmpPage.tsx");
    const creator = read("src/lib/createLmpProcess.ts");
    expect(page).toContain("createdById: user.id");
    expect(page).toContain("createdByName: user.name");
    expect(page).not.toContain("createdBy: role");
    expect(creator).toContain("created_by: payload.createdById");
    expect(creator).toContain("allocator: payload.createdByName");
  });

  it("isolates Copilot and voice state per request", () => {
    const copilot = read("services/orchestrator/copilot/requestContext.ts");
    const voice = read("services/orchestrator/voice_handler.ts");
    expect(copilot).toContain("new AsyncLocalStorage<CopilotRequestState>()");
    expect(copilot).not.toContain("CURRENT_REQUEST");
    expect(read("services/orchestrator/copilot/chat_handler.ts")).not.toMatch(/\blet _reqCache\b/);
    expect(voice).toContain("new AsyncLocalStorage<VoiceRequestState>()");
    expect(voice).not.toContain("CURRENT_VIEW_AS");
    expect(voice).not.toContain("CURRENT_VOICE_USER_ID");
    expect(voice).not.toContain("voiceCopilotBridge");
    expect(voice).toContain("COPILOT_TOOL_REGISTRY");
    expect(voice).toContain("runSharedCopilotTool");
  });

  it("enforces one server-side daily AI budget across Copilot and voice", () => {
    const usage = read("supabase/functions/_shared/ai-usage.ts");
    const copilot = read("services/orchestrator/copilot/chat_handler.ts");
    const voice = read("services/orchestrator/voice_handler.ts");
    const quota = read("src/lib/hooks/useCopilotQuota.ts");
    expect(usage).toContain('rpc("reserve_ai_request"');
    expect(usage).toContain('rpc("record_ai_tokens"');
    expect(copilot).toContain("await reserveAiRequest(authedUser.id");
    expect(voice).toContain("await reserveAiRequest(auth.user.id");
    expect(quota).toContain('.from("ai_daily_budgets")');
    expect(quota).not.toContain("SHARED_USER_COUNT");
  });

  it("resolves public feedback links through hashed tokens and rate limits them", () => {
    const validate = read("supabase/functions/validate-feedback-token/index.ts");
    const submit = read("supabase/functions/submit-student-feedback/index.ts");
    for (const source of [validate, submit]) {
      expect(source).toContain("resolveFeedbackSession");
      expect(source).toContain("enforceFeedbackRateLimit");
      expect(source).not.toContain('.eq("student_feedback_token"');
    }
    const issuer = read("supabase/migrations/20260610190000_server_feedback_token_issuance.sql");
    const email = read("supabase/functions/send-student-feedback-email/index.ts");
    expect(issuer).toContain("issue_session_feedback_token");
    expect(issuer).toContain("student_feedback_token = NULL");
    expect(email).toContain("await userClient.rpc(");
    expect(email).not.toContain("body?.origin");
  });

  it("routes Sheet writes through one authenticated outbox worker", () => {
    const sheets = read("supabase/functions/sheets-lmp/index.ts");
    const worker = read("supabase/functions/sheets-retry-sweeper/index.ts");
    const migration = read("supabase/migrations/20260610170000_unify_assignment_rbac_and_sheet_outbox.sql");
    expect(sheets).toContain('await enqueueWrite("queued_for_worker")');
    expect(sheets).toContain("await hasValidInternalSecret(req)");
    expect(worker).toContain("requireInternalSecret");
    expect(worker).toContain('"x-sheet-sweeper": "1"');
    expect(worker).toContain('"x-internal-secret": internalSyncSecret');
    expect(worker).toContain("Authorization: `Bearer ${SERVICE_ROLE}`");
    expect(sheets).toContain("const internalRequest = await hasValidInternalSecret(req)");
    expect(sheets).toContain("if (!internalRequest)");
    expect(sheets).toContain("await requireAuth(req, corsHeaders)");
    expect(sheets).not.toContain("dbRow.company");
    expect(sheets).not.toContain("dbRow.role");
    expect(read("supabase/config.toml")).toContain("[functions.sheets-lmp]\nverify_jwt = false");
    expect(read("supabase/config.toml")).toContain("[functions.sheets-retry-sweeper]\nverify_jwt = false");
    expect(migration).not.toContain("net.http_post");
    expect(migration).toContain("sheet_write_queue_pending_idempotency_key");
    expect(read("src/lib/sheets/fieldMap.ts")).toContain(
      'from "../../../supabase/functions/_shared/fieldMap"',
    );
    for (const path of [
      "src/lib/hooks/useDbData.ts",
      "src/lib/hooks/useLmpComments.ts",
      "src/lib/hooks/useLmpProcessComment.ts",
    ]) {
      expect(read(path)).not.toMatch(/functions\.invoke\("(sheets-lmp|sheets-retry-sweeper|sheets-pull-comments)"/);
    }
    expect(read("src/lib/hooks/useDbData.ts")).toContain('rpc("enqueue_all_lmp_sheet_mirrors")');
    const retiredIngest = read("supabase/functions/sync-ingest/index.ts");
    expect(retiredIngest).toContain("sheet_to_db_retired");
    expect(retiredIngest).not.toContain("_legacyHandler");
    expect(retiredIngest).not.toContain("sheet_write_queue");
  });

  it("uses one permission contract and transactional mentor assignment", () => {
    const frontend = read("src/lib/permissions.ts");
    const edgeRbac = read("supabase/functions/_shared/rbac.ts");
    const copilot = read("services/orchestrator/copilot/tools/runtime.ts");
    const migration = read("supabase/migrations/20260610180000_transactional_mentor_assignment.sql");
    expect(frontend).toContain('from "../../supabase/functions/_shared/permissionContract"');
    expect(edgeRbac).toContain('from "./permissionContract.ts"');
    expect(copilot).toContain('POC_WRITABLE_LMP_COLUMNS } from "../../../../supabase/functions/_shared/permissionContract.ts"');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.assign_mentor_session");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.resolve_or_create_mentor");
    expect(migration).toContain("MENTOR_ASSIGNMENT_FORBIDDEN");
  });

  it("keeps operational configuration server-backed and centralizes app branding", () => {
    for (const path of [
      "src/lib/platformThresholds.ts",
      "src/lib/scoringWeights.ts",
      "src/lib/externalDiscoveryConfig.ts",
    ]) {
      expect(read(path)).not.toContain("localStorage");
    }
    const reminder = read("supabase/functions/progress-reminder-cron/index.ts");
    const confirmation = read("supabase/functions/send-progress-confirmation-email/index.ts");
    expect(reminder).toContain('from "../_shared/appConfig.ts"');
    expect(confirmation).toContain('from "../_shared/appConfig.ts"');
    expect(reminder).not.toContain("LMP Magic");
    expect(confirmation).not.toContain("LMP Magic");
    for (const path of [
      "supabase/functions/entity-search/index.ts",
      "supabase/functions/sheets-retry-sweeper/index.ts",
      "supabase/functions/submit-student-feedback/index.ts",
      "supabase/functions/validate-feedback-token/index.ts",
      "supabase/functions/sheets-backfill-lmp-id/index.ts",
      "supabase/functions/sync-ingest/index.ts",
      "services/orchestrator/voice_handler.ts",
      "supabase/functions/sheets-lmp/index.ts",
      "supabase/functions/parse-jd/index.ts",
      "supabase/functions/invite-user/index.ts",
      "supabase/functions/send-student-feedback-email/index.ts",
    ]) {
      expect(read(path)).not.toContain('"https://preplane.pages.dev"');
    }
    expect(read("supabase/functions/mentor-profile-enrich/index.ts")).not.toContain(
      '"https://ai.gateway.lovable.dev',
    );
    expect(read("supabase/functions/mentor-profile-enrich/index.ts")).toContain("GEMINI_API_KEY");
    expect(read("supabase/functions/mentor-profile-enrich/index.ts")).not.toContain("LOVABLE_API_KEY");
  });

  it("keeps view-as as a data perspective while preserving backend RLS", () => {
    const client = read("src/integrations/supabase/client.ts");
    const roles = read("src/lib/rolesContext.tsx");
    const migration = read("supabase/migrations/20260611010000_view_as_guard_and_sheet_queue_rpc.sql");
    const removal = read("supabase/migrations/20260611210000_remove_poc_lmp_delete_policy.sql");
    expect(client).not.toContain('"x-preplane-view-as-read-only"');
    expect(roles).not.toContain("VIEW_AS_READ_ONLY_STORAGE_KEY");
    expect(roles).toContain('role === "admin" || role === "allocator"');
    expect(migration).toContain("request_is_view_as_read_only");
    expect(migration).toContain("reject_view_as_mutation");
    expect(migration).toContain("VIEW_AS_READ_ONLY");
    expect(migration).toContain("enqueue_all_lmp_sheet_mirrors");
    expect(removal).toContain('DROP POLICY IF EXISTS "Assigned POCs can delete lmp_processes"');
  });
});
