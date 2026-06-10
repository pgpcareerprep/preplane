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
  });
});
