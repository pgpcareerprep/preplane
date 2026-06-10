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
    const copilot = read("supabase/functions/copilot-ai/index.ts");
    const voice = read("supabase/functions/voice-copilot/index.ts");
    expect(copilot).toContain("new AsyncLocalStorage<CopilotRequestState>()");
    expect(copilot).not.toContain("CURRENT_REQUEST");
    expect(copilot).not.toMatch(/\blet _reqCache\b/);
    expect(voice).toContain("new AsyncLocalStorage<VoiceRequestState>()");
    expect(voice).not.toContain("CURRENT_VIEW_AS");
    expect(voice).not.toContain("CURRENT_VOICE_USER_ID");
  });

  it("enforces one server-side daily AI budget across Copilot and voice", () => {
    const usage = read("supabase/functions/_shared/ai-usage.ts");
    const copilot = read("supabase/functions/copilot-ai/index.ts");
    const voice = read("supabase/functions/voice-copilot/index.ts");
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
    expect(sheets).toContain("await isInternalRequest(req)");
    expect(worker).toContain("requireInternalSecret");
    expect(worker).toContain('"x-sheet-sweeper": "1"');
    expect(migration).not.toContain("net.http_post");
    expect(migration).toContain("sheet_write_queue_pending_idempotency_key");
    expect(read("src/lib/sheets/fieldMap.ts")).toContain(
      'from "../../../supabase/functions/_shared/fieldMap"',
    );
  });

  it("uses one permission contract and transactional mentor assignment", () => {
    const frontend = read("src/lib/permissions.ts");
    const edgeRbac = read("supabase/functions/_shared/rbac.ts");
    const copilot = read("supabase/functions/copilot-ai/index.ts");
    const migration = read("supabase/migrations/20260610180000_transactional_mentor_assignment.sql");
    expect(frontend).toContain('from "../../supabase/functions/_shared/permissionContract"');
    expect(edgeRbac).toContain('from "./permissionContract.ts"');
    expect(copilot).toContain('POC_WRITABLE_LMP_COLUMNS } from "../_shared/permissionContract.ts"');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.assign_mentor_session");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.resolve_or_create_mentor");
    expect(migration).toContain("MENTOR_ASSIGNMENT_FORBIDDEN");
  });
});
