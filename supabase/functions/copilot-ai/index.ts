import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import {
  classifyIntent,
  getGreetingResponse,
  getHelpResponse,
  buildPlainSseResponse,
} from "./intentRouter.ts";
import {
  GEMINI_ANALYSIS_MODEL,
  getTaskTier,
} from "./modelConfig.ts";
import { validateResponse as validateAiResponse } from "../_shared/responseValidator.ts";
import { isConversionCountQuery, isConversionReportQuery, isCopilotPdfExportQuery, isMentorCoverageQuery, isPocWorkloadQuery, shouldPrefetchRag } from "../_shared/copilotFastPaths.ts";
import {
  fetchMentorCoverageFastPath,
  fetchPocWorkloadFastPath,
  formatMentorCoverageChatSse,
  formatPocWorkloadChatSse,
} from "../_shared/fastPathHandlers.ts";
import { resolveViewAsEffectiveRole } from "../_shared/viewAsRole.ts";
import {
  formatCancelPendingChatSse,
  formatCancelPendingErrorSse,
  formatExecutePendingChatSse,
} from "../_shared/copilotDeterministicConfirm.ts";
import { cancelPendingAction } from "../_shared/copilotPendingActions.ts";
import { buildConversionReport, formatConversionReportSse } from "../_shared/conversionReport.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { buildProviderList, callSynthesis, callToolModel } from "./providers.ts";
import {
  requestStateStorage,
  createRequestState,
  requestState,
  aiProvider,
  resetRequestCache,
  viewAsBlocksWrites,
} from "./requestContext.ts";
import { ensureVaultLoaded, getEnv } from "./secrets.ts";
import { retrieveRAGContext } from "./rag.ts";
import {
  ANALYTICAL_TTL,
  ACTION_TTL,
  isWriteTool,
  stableStringify,
  buildCacheKey,
  readCache,
  writeCache,
  replayCachedSse,
  teeSseForCache,
} from "./cache.ts";
import { TOOLS, executeTool } from "./tools/index.ts";
import { getLmpRecords, getMastersheetRecords } from "./tools/runtime.ts";
import { buildSystemPrompt } from "./systemPrompt.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};

async function handleRequest(req: Request) {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const tStart = performance.now();
  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) {
    requestState().log.warn("auth_failed", { ms: Math.round(performance.now() - tStart) });
    return auth.error;
  }
  const authedUser = auth.user;
  requestState().context.authToken = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim() || null;
  requestState().log = requestState().log.child({ user_id: authedUser.id, role: authedUser.role });

  // Load Vault secrets once per cold start; getEnv() checks Deno.env first then Vault.
  await ensureVaultLoaded();

  // ─── Provider selection: Gemini (primary) → OpenRouter → Grok ───────────
  // Build an ORDERED list of all configured providers. All AI calls walk this
  // list with genuine cross-provider fallback — if Gemini fails, OpenRouter is
  // tried automatically, then Grok. The first provider in the list also sets
  // request-scoped shortcut fields on requestState().ai for telemetry.
  const GEMINI_API_KEY    = getEnv("GEMINI_API_KEY");
  const OPENROUTER_API_KEY = getEnv("OPENROUTER_API_KEY");
  const GROK_API_KEY      = getEnv("GROK_API_KEY");

  const ai = aiProvider();
  ai.providers = buildProviderList(GEMINI_API_KEY, OPENROUTER_API_KEY, GROK_API_KEY);

  if (!ai.providers.length) {
    return jsonError("No AI API key configured. Set GEMINI_API_KEY (or OPENROUTER_API_KEY, GROK_API_KEY) in Supabase Edge Function secrets.", 503);
  }

  // Initialise request-scoped shortcut vars from the primary (first) provider
  // so telemetry references stay accurate for this request.
  const primaryProvider = ai.providers[0];
  ai.keyForChat = primaryProvider.key;
  ai.gatewayUrl = primaryProvider.url;
  ai.toolModel = primaryProvider.toolModel;
  ai.toolFallbackModels = [...primaryProvider.toolFallbacks];
  ai.extraHeaders = primaryProvider.extraHeaders;
  requestState().context.activeProviderName = primaryProvider.name;

  // ─── Intent-based model override ─────────────────────────────────────────
  const intentFromReq = requestState().context.intent ?? "";
  const tier = getTaskTier(intentFromReq);
  if (tier === "analysis" && primaryProvider.name === "Gemini") {
    ai.toolModel = GEMINI_ANALYSIS_MODEL;
    ai.providers[0] = { ...ai.providers[0], toolModel: GEMINI_ANALYSIS_MODEL };
  }

  console.log(
    `[copilot-ai] providers configured: ${ai.providers.map(p => p.name).join(" → ")}`,
    `| primary=${primaryProvider.name} | intent=${intentFromReq} | tier=${tier} | toolModel=${ai.toolModel}`,
  );

  let body: {
    messages?: { role: string; content: string }[];
    confirm_action?: boolean;
    cancel_action?: boolean;
    pending_action_id?: string;
    mode?: string;
    scope?: string;
    role?: string;
    lmpId?: string;
    snapshot?: string;
    cache?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const messages = body.messages;
  const requestedMode = (body.mode as string) || "auto";
  const threadIdRaw = (body as Record<string, unknown>).threadId;
  const threadId = typeof threadIdRaw === "string" && /^[0-9a-f-]{36}$/i.test(threadIdRaw) ? threadIdRaw : null;
  const turnStartedAt = Date.now();
  const telemetry = {
    tools_used: [] as string[],
    tool_rounds: 0,
    tool_calls_count: 0,
    intent: "agent" as string,
    cache_hit: false,
    model: aiProvider().toolModel,
    scope_summary: [] as Array<{
      round: number;
      tool: string;
      scope_match: "applied" | "missing" | "broadened" | "n/a";
      filter_value: string | null;
      broadened_reason: string | null;
      memo_hit: boolean;
      fallback_used: boolean;
      fallback_reason: string | null;
    }>,
    scope_applied_count: 0,
    scope_missing_count: 0,
    scope_broadened_count: 0,
  };
  let usedWriteTool = false;
  const { reserveAiRequest } = await import("../_shared/ai-usage.ts");
  const budget = await reserveAiRequest(authedUser.id, aiProvider().toolModel);
  if (!budget.allowed) {
    return new Response(JSON.stringify({
      error: "Your daily AI budget is exhausted. It resets at midnight UTC.",
      code: "AI_DAILY_BUDGET_EXHAUSTED",
      budget,
    }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const logTurn = async (params: {
    status: string;
    response_chars?: number;
    error_message?: string | null;
  }) => {
    try {
      const sb = getCacheClient();
      const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user")?.content || "";
      await sb.from("copilot_turns").insert({
        user_id: requestState().context.userId,
        thread_id: threadId,
        started_at: new Date(turnStartedAt).toISOString(),
        finished_at: new Date().toISOString(),
        latency_ms: Date.now() - turnStartedAt,
        role: requestState().context.role,
        mode: requestedMode,
        scope: requestedScope,
        model: telemetry.model,
        intent: telemetry.intent,
        prompt_chars: lastUser.length,
        response_chars: params.response_chars ?? 0,
        tool_rounds: telemetry.tool_rounds,
        tool_calls_count: telemetry.tool_calls_count,
        tools_used: telemetry.tools_used,
        used_write_tool: usedWriteTool,
        cache_hit: telemetry.cache_hit,
        status: params.status,
        error_message: params.error_message ?? null,
        scope_summary: telemetry.scope_summary.slice(0, 20),
        scope_applied_count: telemetry.scope_applied_count,
        scope_missing_count: telemetry.scope_missing_count,
        scope_broadened_count: telemetry.scope_broadened_count,
      });
      // Mirror to ai_usage_events for the AI Usage dashboard.
      try {
        const { logAiUsage } = await import("../_shared/ai-usage.ts");
        const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user")?.content || "";
        const { estimateTokens } = await import("../_shared/ai-usage.ts");
        const pt = estimateTokens(lastUser);
        const rt = estimateTokens(String(params.response_chars ? "x".repeat(params.response_chars) : ""));
        await logAiUsage({
          userId: requestState().context.userId,
          feature: "copilot",
          model: telemetry.model,
          promptTokens: pt,
          responseTokens: rt,
          totalTokens: pt + rt,
          latencyMs: Date.now() - turnStartedAt,
          status: params.status,
          errorMessage: params.error_message ?? null,
          metadata: {
            thread_id: threadId,
            mode: requestedMode,
            scope: requestedScope,
            intent: telemetry.intent,
            tool_rounds: telemetry.tool_rounds,
            tool_calls_count: telemetry.tool_calls_count,
            cache_hit: telemetry.cache_hit,
          },
        });
      } catch (e) {
        console.warn("[ai-usage] copilot mirror failed:", (e as Error).message);
      }
    } catch (e) {
      console.warn("[copilot-turns] log failed:", e);


    }
  };
  const requestedScope = (body.scope as string) || "auto";
  const requestedActiveContext = ((body as Record<string, unknown>).activeContext ?? null) as ActiveContextHint;
  const requestedRole = (body.role as string) || "poc";
  // SECURITY: derive role/userId from validated JWT, ignore client-supplied values
  requestState().context.role = authedUser.role;
  requestState().context.userId = authedUser.id;
  requestState().context.actorName = (typeof (body as Record<string, unknown>).userName === "string" ? (body as Record<string, unknown>).userName : null) as string | null;
  // View-As: server-side hard read-only when the client signals impersonation.
  // The real JWT user remains the actor; we never elevate to the viewed user.
  const _viewAsName = ((body as Record<string, unknown>).viewAsUserName as string | null | undefined)?.toString().trim() || null;
  const _realName = (requestState().context.actorName || "").trim().toLowerCase();
  requestState().context.viewAsName = _viewAsName;
  requestState().context.isImpersonating = !!_viewAsName && _viewAsName.toLowerCase() !== _realName;
  let effectiveName = requestState().context.actorName;
  let effectiveRole = authedUser.role;
  if (requestState().context.isImpersonating && _viewAsName) {
    const claimedViewAsRole = (
      (body as Record<string, unknown>).viewAsRole as string | undefined
      || requestedRole
    ).trim();
    const resolved = await resolveViewAsEffectiveRole(_viewAsName, claimedViewAsRole, authedUser.role);
    effectiveRole = resolved.effectiveRole;
    effectiveName = _viewAsName;
    if (resolved.downgraded) {
      requestState().log.warn("view_as_role_downgraded", {
        claimed: claimedViewAsRole,
        resolved: resolved.resolvedRole,
        effective: effectiveRole,
        real_role: authedUser.role,
      });
    }
  }
  requestState().context.effectiveRole = effectiveRole;
  requestState().context.effectiveName = effectiveName;

  const pendingActionId = String((body as Record<string, unknown>).pending_action_id || "").trim();
  const isConfirmAction = body.confirm_action === true;
  const isCancelAction = body.cancel_action === true;
  if (pendingActionId && (isConfirmAction || isCancelAction)) {
    telemetry.intent = isCancelAction ? "deterministic_cancel" : "deterministic_confirm";
    requestState().log.event("deterministic_pending", {
      pending_action_id: pendingActionId,
      action: isCancelAction ? "cancel" : "confirm",
    });

    if (isCancelAction) {
      const cancelled = await cancelPendingAction(pendingActionId, authedUser.id);
      const text = cancelled.ok
        ? formatCancelPendingChatSse()
        : formatCancelPendingErrorSse(cancelled.error || "Unknown error");
      void logTurn({ status: cancelled.ok ? "ok" : "error", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
      });
    }

    if (viewAsBlocksWrites()) {
      const text = formatExecutePendingChatSse({
        blocked: true,
        error: "View-as mode is read-only. Switch back to your own perspective to make changes.",
      });
      void logTurn({ status: "error", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
      });
    }

    let parsed: Record<string, unknown> = {};
    try {
      const raw = await executeTool("execute_pending", { pending_action_id: pendingActionId });
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch (e) {
      parsed = { error: (e as Error).message };
    }
    usedWriteTool = true;
    const text = formatExecutePendingChatSse(parsed);
    void logTurn({
      status: parsed.error || parsed.blocked ? "error" : "ok",
      response_chars: text.length,
      error_message: parsed.error ? String(parsed.error) : null,
    });
    return new Response(buildPlainSseResponse(text), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    requestState().log.warn("missing_messages");
    return jsonError("Missing 'messages' array", 400);
  }

  requestState().log.event("turn_start", {
    thread_id: threadId,
    mode: requestedMode,
    scope: requestedScope,
    messages_in: messages.length,
    active_context_type: requestedActiveContext?.entity_type ?? null,
    active_context_name: requestedActiveContext?.display_name ?? null,
  });

  // ── Step 0: Pre-LLM intent router ──
  // Greetings, "what can you do", and other small talk skip the system prompt,
  // Sheets fetch, and tool loop entirely. This avoids both 429s and the
  // "every message returns an executive summary" bug.
  const lastUserMessage =
    [...messages].reverse().find(m => m?.role === "user")?.content ?? "";
  const intent = classifyIntent(lastUserMessage);
  requestState().context.intent = intent; // used for model tier selection below
  const userName =
    typeof (body as Record<string, unknown>).userName === "string"
      ? ((body as Record<string, unknown>).userName as string)
      : "there";

  // Track whether the tool loop invoked any write tool. Declared before fast
  // paths because logTurn records it for every response, including direct ones.

  if (intent === "greeting") {
    const text = getGreetingResponse(userName.split(/\s+/)[0] || "there");
    telemetry.intent = "greeting";
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }
  if (intent === "help") {
    const text = getHelpResponse();
    telemetry.intent = "help";
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }

  if (isCopilotPdfExportQuery(lastUserMessage)) {
    const priorAssistant = [...messages]
      .filter((m) => m?.role === "assistant" && typeof m.content === "string" && m.content.trim())
      .pop();
    const hasSource = !!priorAssistant?.content?.trim();
    const text = hasSource
      ? [
        "Your report is ready to download as a PDF.",
        "",
        ":::blocks",
        JSON.stringify([
          { type: "executive-summary", content: "Export runs locally in your browser — instant download, no AI wait." },
          {
            type: "action-buttons",
            title: "Export",
            buttons: [
              { label: "Download PDF", action: "__COPILOT_DOWNLOAD_PDF__", variant: "primary", icon: "file" },
            ],
            layout: "row",
          },
        ]),
        ":::",
      ].join("\n")
      : [
        "There is nothing to export yet.",
        "",
        "Ask for a report first (for example POC workload or conversion metrics), then say **download as PDF** or use the **Download PDF** button on any answer.",
      ].join("\n");
    telemetry.intent = hasSource ? "pdf_export_fast_path" : "pdf_export_fast_path_empty";
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
    });
  }

  if (isMentorCoverageQuery(lastUserMessage)) {
    const scope = {
      effectiveRole: requestState().context.effectiveRole ?? authedUser.role,
      effectiveName: requestState().context.effectiveName,
    };
    const result = await fetchMentorCoverageFastPath(scope);
    if (result.ok) {
      const text = formatMentorCoverageChatSse(result);
      telemetry.intent = "mentor_coverage_fast_path";
      void logTurn({ status: "ok", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }
    requestState().log.warn("mentor_coverage_fast_path_failed", { error: result.error });
  }

  if (isPocWorkloadQuery(lastUserMessage)) {
    const scope = {
      effectiveRole: requestState().context.effectiveRole ?? authedUser.role,
      effectiveName: requestState().context.effectiveName,
    };
    const result = await fetchPocWorkloadFastPath(scope);
    if (!result.ok) {
      requestState().log.warn("poc_workload_fast_path_failed", { error: result.error });
      const errText = [
        "I couldn't load the live POC progress data right now.",
        "",
        ":::blocks",
        JSON.stringify([{ type: "alert-cards", alerts: [{ severity: "error", title: "Data fetch failed", message: result.error }] }]),
        ":::",
      ].join("\n");
      telemetry.intent = "poc_workload_fast_path_error";
      void logTurn({ status: "error", error_message: result.error, response_chars: errText.length });
      return new Response(buildPlainSseResponse(errText), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
      });
    }
    const { text, intent } = formatPocWorkloadChatSse(result, lastUserMessage);
    telemetry.intent = intent;
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Model": aiProvider().toolModel, "X-Copilot-Intent": telemetry.intent },
    });
  }

  if (isConversionReportQuery(lastUserMessage)) {
    const fastSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const [pocsRes, linksRes, candidatesRes, studentsRes, lmpsRes] = await Promise.all([
      fastSb.from("poc_profiles").select("id, name, primary_domain, domain_tags, role_type, status").order("name"),
      fastSb.from("lmp_poc_links").select("poc_id, role, lmp_id, lmp_processes(id, status, domain_raw, domains(name))").in("role", ["prep", "support"]),
      fastSb.from("lmp_candidates").select("lmp_id, student_id").not("student_id", "is", null),
      fastSb.from("students").select("id, name, primary_domain, secondary_domain, placement_status"),
      fastSb.from("lmp_processes").select("id, status, domain_raw, domains(name)").limit(5000),
    ]);
    const queryError = pocsRes.error || linksRes.error || candidatesRes.error || studentsRes.error || lmpsRes.error;
    if (queryError) {
      requestState().log.warn("conversion_report_fast_path_failed", {
        error: queryError.message,
        pocs: pocsRes.error?.message,
        links: linksRes.error?.message,
        candidates: candidatesRes.error?.message,
        students: studentsRes.error?.message,
        lmps: lmpsRes.error?.message,
      });
      const errText = [
        "I couldn't load the live conversion data right now.",
        "",
        ":::blocks",
        JSON.stringify([{ type: "alert-cards", alerts: [{ severity: "error", title: "Data fetch failed", message: queryError.message }] }]),
        ":::",
      ].join("\n");
      telemetry.intent = "conversion_report_fast_path_error";
      void logTurn({ status: "error", error_message: queryError.message, response_chars: errText.length });
      return new Response(buildPlainSseResponse(errText), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
      });
    }
    const report = buildConversionReport(
      pocsRes.data ?? [],
      linksRes.data ?? [],
      candidatesRes.data ?? [],
      studentsRes.data ?? [],
      lmpsRes.data ?? [],
    );
    const text = formatConversionReportSse(report);
    telemetry.intent = "conversion_report_fast_path";
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Model": aiProvider().toolModel, "X-Copilot-Intent": telemetry.intent },
    });
  }

  if (isConversionCountQuery(lastUserMessage)) {
    const fastSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await fastSb.from("lmp_processes").select("status,domain_raw").limit(3000);
    if (!error) {
      const all = data || [];
      const convertedRows = all.filter((r) => /^converted$/i.test(r.status || ""));
      const converted = convertedRows.length;
      const offers = all.filter((r) => /offer received/i.test(r.status || "")).length;
      const ongoing = all.filter((r) => /ongoing/i.test(r.status || "")).length;
      const rate = all.length ? Math.round((converted / all.length) * 1000) / 10 : 0;
      const byDomain = new Map<string, number>();
      for (const row of convertedRows) {
        const domain = row.domain_raw || "Unspecified";
        byDomain.set(domain, (byDomain.get(domain) || 0) + 1);
      }
      const text = [
        converted === 0
          ? "There are no converted processes right now."
          : `There ${converted === 1 ? "is" : "are"} ${converted} converted process${converted === 1 ? "" : "es"} right now.`,
        "",
        ":::blocks",
        JSON.stringify([
          { type: "executive-summary", content: converted === 0 ? "No LMP processes are currently marked **Converted**." : `**${converted}** LMP processes are currently marked Converted.` },
          { type: "kpi-row", items: [
            { label: "Converted", value: converted, color: "green" },
            { label: "Offer received", value: offers, color: "blue" },
            { label: "Ongoing", value: ongoing, color: "orange" },
            { label: "Conversion rate", value: `${rate}%` },
          ] },
          ...(byDomain.size ? [{ type: "bar-chart", title: "Converted by domain", data: [...byDomain].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }] : []),
          { type: "follow-ups", suggestions: ["Show converted processes", "Break down conversion by POC", "Show conversion by domain"] },
        ]),
        ":::",
      ].join("\n");
      telemetry.intent = "conversion_count_fast_path";
      void logTurn({ status: "ok", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Model": aiProvider().toolModel, "X-Copilot-Intent": "conversion_count_fast_path" },
      });
    }
    requestState().log.warn("conversion_count_fast_path_failed", { error: error.message });
    const errText = [
      "I couldn't load conversion counts right now.",
      "",
      ":::blocks",
      JSON.stringify([{ type: "alert-cards", alerts: [{ severity: "error", title: "Data fetch failed", message: error.message }] }]),
      ":::",
    ].join("\n");
    telemetry.intent = "conversion_count_fast_path_error";
    void logTurn({ status: "error", error_message: error.message, response_chars: errText.length });
    return new Response(buildPlainSseResponse(errText), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Intent": telemetry.intent },
    });
  }

  const ACTION_MODES = new Set(["update", "assign"]);
  const cacheable =
    body.cache !== false &&
    !body.confirm_action &&
    !body.cancel_action &&
    !ACTION_MODES.has(requestedMode);
  let cKey: string | null = null;
  if (cacheable) {
    cKey = await buildCacheKey(messages, requestedMode, body.lmpId, body.snapshot);
    const hit = await readCache(cKey);
    if (hit) {
      console.log("copilot-ai cache HIT", cKey.slice(0, 12));
      telemetry.cache_hit = true;
      void logTurn({ status: "ok", response_chars: hit.text.length });
      return replayCachedSse(hit.text, corsHeaders);
    }
  }

  // Reset request-scoped data cache so this turn fetches sheets at most once
  // (snapshot + every tool call share one fetch + one Supabase fallback).
  resetRequestCache();

  try {
    // ── Step 1: Build rich data snapshot for system prompt context ──
    // Phase 5c: snapshot is built from DB-only data (no Sheets metadata fetch).
    let sheetSummary = "";
    try {

      const [{ headers: lmpHeaders, records }, students] = await Promise.all([
        getLmpRecords(),
        getMastersheetRecords(),
      ]);

      if (records.length > 0) {
        const total = records.length;
        const statusDist: Record<string, number> = {};
        records.forEach((r) => { const s = r["Status"] || "Unknown"; statusDist[s] = (statusDist[s] || 0) + 1; });
        const domainDist: Record<string, number> = {};
        records.forEach((r) => { const d = r["Domain"] || "Unknown"; domainDist[d] = (domainDist[d] || 0) + 1; });
        const pocCount: Record<string, number> = {};
        records.forEach((r) => {
          for (const col of ["Prep POC", "Outreach POC"]) {
            const p = r[col]; if (p) pocCount[p] = (pocCount[p] || 0) + 1;
          }
        });
        const topPocs = Object.entries(pocCount).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([name, count]) => `${name}(${count})`).join(", ");
        const typeDist: Record<string, number> = {};
        records.forEach((r) => { const t = r["Type"] || "Unknown"; typeDist[t] = (typeDist[t] || 0) + 1; });
        const converted = statusDist["Converted"] || 0;
        const convRate = total > 0 ? ((converted / total) * 100).toFixed(1) + "%" : "N/A";
        const recent = records.slice(-10).reverse().map((r) =>
          `${r["Company"]} - ${r["Role"]} [${r["Status"]}] (${r["Domain"]}, ${r["Type"]}, POC: ${r["Prep POC"] || "?"})`
        );

        sheetSummary += `\n\n### LMP Tracker: ${total} total records`;
        if (lmpHeaders.length) sheetSummary += `\nColumns: ${lmpHeaders.filter(Boolean).join(", ")}`;
        sheetSummary += `\nStatus: ${Object.entries(statusDist).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nDomains: ${Object.entries(domainDist).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nTypes: ${Object.entries(typeDist).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nConversion rate: ${convRate} (${converted}/${total})`;
        sheetSummary += `\nPOC workload (top 10): ${topPocs}`;
        sheetSummary += `\nRecent records:\n${recent.map(r => `  - ${r}`).join("\n")}`;
      }

      if (students.length > 0) {
        const totalStudents = students.length;
        const sDomains: Record<string, number> = {};
        students.forEach((s) => { const d = s["Primary Domain"] || "Unknown"; sDomains[d] = (sDomains[d] || 0) + 1; });
        const placement: Record<string, number> = {};
        students.forEach((s) => { const p = s["Final Placement Status"] || "Unknown"; placement[p] = (placement[p] || 0) + 1; });
        const riskCount = students.filter((s) => s["Interview Risk Flag"] && s["Interview Risk Flag"].trim() !== "").length;
        const composites = students.map((s) => parseFloat(s["Composite (Primary)"] || "0")).filter((v) => v > 0);
        const avgComposite = composites.length > 0 ? (composites.reduce((a, b) => a + b, 0) / composites.length).toFixed(2) : "N/A";

        sheetSummary += `\n\n### Mastersheet: ${totalStudents} students`;
        sheetSummary += `\nDomains: ${Object.entries(sDomains).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nPlacement: ${Object.entries(placement).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nInterview risk flags: ${riskCount} students`;
        sheetSummary += `\nAvg composite (primary): ${avgComposite}`;
      }

    } catch (e) {
      console.warn("Sheet summary fetch error:", e);
      sheetSummary = "\n- Sheet metadata unavailable";
    }


    // Hydrate active context from ?lmp= scope when the client opened copilot from an LMP page.
    let activeContextForPrompt = requestedActiveContext;
    const scopedLmpId = typeof body.lmpId === "string" && /^[0-9a-f-]{36}$/i.test(body.lmpId) ? body.lmpId : null;
    if (!activeContextForPrompt && scopedLmpId) {
      try {
        const scopeSb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const { data: scopedLmp } = await scopeSb
          .from("lmp_processes")
          .select("id,company,role,domain_raw,status")
          .eq("id", scopedLmpId)
          .maybeSingle();
        if (scopedLmp?.id) {
          activeContextForPrompt = {
            entity_type: "lmp",
            entity_id: scopedLmp.id as string,
            display_name: `${scopedLmp.company} · ${scopedLmp.role}`,
            sub: [scopedLmp.domain_raw, scopedLmp.status].filter(Boolean).join(", "),
            pinned: true,
          };
        }
      } catch { /* non-fatal */ }
    }

    // ── Step 2: AI call with tool-calling loop ──
    const baseSystemPrompt = buildSystemPrompt(sheetSummary, requestedMode, requestedScope, activeContextForPrompt);
    const ragContext = shouldPrefetchRag(lastUserMessage)
      ? await retrieveRAGContext(lastUserMessage, createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      ), null, { userId: requestState().context.userId })
      : "";
    const systemPrompt = baseSystemPrompt + ragContext;
    let aiMessages: { role: string; content?: string; tool_calls?: any[]; tool_call_id?: string; name?: string }[] = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const MAX_TOOL_ROUNDS = 8;
    const SOFT_WARN_AT = 6;
    // Tools that invoke another edge function — count double toward soft-warn budget.
    const NESTED_EDGE_FUNCTION_TOOLS = new Set(["create_case_study", "analyze_cv", "parse_jd"]);
    let round = 0;
    let softWarned = false;
    let roundBudgetUsed = 0;
    const maybeSoftWarn = () => {
      if (!softWarned && roundBudgetUsed >= SOFT_WARN_AT) {
        softWarned = true;
        aiMessages.push({
          role: "system",
          content: `You have ${MAX_TOOL_ROUNDS - round + 1} tool round(s) remaining. Stop calling tools and answer the user with the data you've already gathered. Prefer batched search_* tools over per-row get_* calls.`,
        });
      }
    };
    // Per-turn tool-result memo so identical (name,args) calls don't repeat work
    // even if the model re-issues them across rounds.
    const toolMemo = new Map<string, string>();

    while (round < MAX_TOOL_ROUNDS) {
      round++;
      roundBudgetUsed++;
      maybeSoftWarn();
      const roundWallStart = performance.now();
      const logRoundTiming = (outcome: string) => {
        console.warn(
          `[tool-round] round=${round} budget_used=${roundBudgetUsed} outcome=${outcome} wall_ms=${Math.round(performance.now() - roundWallStart)}`,
        );
      };

      // Tool-call rounds: try all providers in order via callToolModel.
      // Gemini → OpenRouter → Grok with per-model retries on retryable errors.
      let aiResponse: Response;
      try {
        const toolResult = await callToolModel({
          messages: aiMessages,
          tools: TOOLS,
          stream: false,
        });
        aiResponse = toolResult.resp;
        telemetry.model = toolResult.model;
        requestState().context.activeProviderName = toolResult.provider;
      } catch (toolModelErr) {
        const errMsg = (toolModelErr as Error).message;
        requestState().log.error("ai_gateway_exhausted", toolModelErr, { round });
        void logTurn({ status: "ai_gateway_error", error_message: errMsg });
        return new Response(JSON.stringify({
          error: true,
          code: "ALL_AI_PROVIDERS_UNAVAILABLE",
          message: "AI services are temporarily unavailable. Please retry in a moment.",
          detail: errMsg,
        }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Copilot-Intent": "ai_gateway_error" } });
      }

      const aiResult = await aiResponse.json();
      const choice = aiResult.choices?.[0];

      if (!choice) return jsonError("No AI response", 500);

      const msg = choice.message;

      // ── Stall guard ──
      // The model sometimes returns an executive-summary that *promises* to
      // search/fetch/retrieve data but issues no tool_calls — the loop then
      // streams that promise back as the final answer and the user never gets
      // real data ("I will now fetch your last daily progress." with nothing
      // following). Detect that pattern once per turn and nudge the model to
      // actually call the appropriate tool before finalizing.
      const STALL_RE = /\b(i will (now |)(search|fetch|look|retrieve|pull|check|query|get|find|gather)|let me (search|fetch|look|retrieve|pull|check|query|get|find)|searching (for |now)|fetching (your |the |now)|retrieving (the |your |now)|looking (up|into|for) (your |the )|one moment|hold on while|stand by|please wait while)\b/i;
      const noToolCalls = !msg.tool_calls || msg.tool_calls.length === 0;
      const content = typeof msg.content === "string" ? msg.content : "";
      if (noToolCalls && STALL_RE.test(content) && !(aiMessages[aiMessages.length - 1] as { __stall_nudged?: boolean }).__stall_nudged) {
        requestState().log.event("stall_guard_fired", { round, sample: content.slice(0, 160) });
        console.warn("stall_guard_fired:", content.slice(0, 160));
        const nudge = {
          role: "system" as const,
          content:
            "STOP. Your previous reply promised to search/fetch/retrieve data but you did NOT call any tool, so the user will never see that data. " +
            "You MUST issue the appropriate tool call now (search_lmp_records / get_analytics / smart_search / get_lmp_record / list_stale_records / etc.) and then return the answer with the real data already retrieved. " +
            "Do NOT emit another executive-summary that promises future work. Either call a tool this round, or, if no tool fits, answer directly without any 'I will…' / 'Let me…' / 'Searching now…' phrasing.",
          __stall_nudged: true,
        };
        aiMessages.push(nudge);
        logRoundTiming("stall_nudge");
        continue;
      }

      // If the AI wants to call tools
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        telemetry.tool_rounds++;
        aiMessages.push({
          role: "assistant",
          content: msg.content || "",
          tool_calls: msg.tool_calls,
        });

        // Execute each tool call and add results
        for (const tc of msg.tool_calls) {
          const fnName = tc.function.name;
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(tc.function.arguments || "{}");
          } catch {
            fnArgs = {};
          }

          // ── Scope-application evaluation (debug logging) ──
          // Decide whether the tool call respects the active context / scope chip
          // so mismatches like "kriti pinned but search returned org-wide rows"
          // are visible in edge-function logs and copilot_turns.scope_summary.
          const scopeFilterByEntityType: Record<string, string[]> = {
            poc: ["poc", "prep_poc", "support_poc", "outreach_poc"],
            student: ["student", "candidate", "candidate_name", "student_name"],
            mentor: ["mentor", "mentor_name"],
            company: ["company"],
            domain: ["domain"],
            lmp: ["lmp_id", "id"],
          };
          const filterTools = new Set([
            "search_lmp_records", "get_analytics", "get_pipeline_summary",
            "get_age_tracking", "list_stale_records", "smart_search",
            "search_students", "search_mentors", "find_mentors_for_jd", "find_mentors_for_lmp",
            "check_lmp_context", "assign_poc", "assign_mentor",
          ]);
          const broadenRe = /\b(all|everyone|globally|org[- ]wide|team[- ]wide|whole pipeline|across the team|ignore scope)\b/i;
          const broadenMatch = lastUserMessage.match(broadenRe);
          let scopeMatch: "applied" | "missing" | "broadened" | "n/a" = "n/a";
          let filterValue: string | null = null;
          let broadenedReason: string | null = null;
          const ctx = activeContextForPrompt;
          if (filterTools.has(fnName) && ctx?.display_name) {
            const expected = (ctx.display_name || "").toLowerCase();
            const candidateFields = scopeFilterByEntityType[ctx.entity_type] || [];
            const hit = candidateFields
              .map((f) => fnArgs[f])
              .find((v) => typeof v === "string" && v.toLowerCase().includes(expected.split(/\s+/)[0]));
            if (hit) {
              scopeMatch = "applied";
              filterValue = String(hit);
            } else if (broadenMatch) {
              scopeMatch = "broadened";
              broadenedReason = `user said "${broadenMatch[0]}"`;
            } else {
              scopeMatch = "missing";
            }
          }
          const scopeEntry = {
            round,
            tool: fnName,
            scope_match: scopeMatch,
            filter_value: filterValue,
            broadened_reason: broadenedReason,
            memo_hit: false,
            fallback_used: false,
            fallback_reason: null,
          };
          if (scopeMatch === "applied") telemetry.scope_applied_count++;
          else if (scopeMatch === "missing") telemetry.scope_missing_count++;
          else if (scopeMatch === "broadened") telemetry.scope_broadened_count++;

          requestState().log.event("tool_exec", { round, tool: fnName, args: fnArgs, scope_match: scopeMatch });
          console.log(`Executing tool: ${fnName}`, JSON.stringify(fnArgs));
          console.log(JSON.stringify({
            tag: "scope_apply",
            tool: fnName,
            active_context: ctx ? { entity_type: ctx.entity_type, display_name: ctx.display_name, entity_id: ctx.entity_id } : null,
            scope_chip: requestedScope,
            scope_match: scopeMatch,
            filter_value: filterValue,
            broadened_reason: broadenedReason,
            fallback_used: scopeEntry.fallback_used,
            fallback_reason: scopeEntry.fallback_reason,
            round,
          }));
          telemetry.tool_calls_count++;
          if (!telemetry.tools_used.includes(fnName)) telemetry.tools_used.push(fnName);
          if (isWriteTool(fnName)) usedWriteTool = true;

          // Per-turn memo: skip duplicate read-tool work within a single request.
          const memoKey = isWriteTool(fnName) ? null : `${fnName}:${stableStringify(fnArgs)}`;
          let rawResult: string;
          if (memoKey && toolMemo.has(memoKey)) {
            rawResult = toolMemo.get(memoKey)!;
            scopeEntry.memo_hit = true;
            console.log(`Tool memo hit (${fnName})`);
          } else {
            rawResult = await executeTool(fnName, fnArgs);
            if (memoKey && typeof rawResult === "string" && rawResult.length > 0) {
              toolMemo.set(memoKey, rawResult);
            }
          }
          const result = typeof rawResult === "string" && rawResult.length > 0
            ? rawResult
            : JSON.stringify({ error: `Tool ${fnName} returned no result` });
          requestState().log.event("tool_done", { round, tool: fnName, ok: !result.startsWith('{"error"'), result_chars: result.length });
          console.log(`Tool result (${fnName}): ${result.slice(0, 200)}...`);
          telemetry.scope_summary.push(scopeEntry);

          aiMessages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });

          if (NESTED_EDGE_FUNCTION_TOOLS.has(fnName)) {
            roundBudgetUsed++;
          }
        }

        maybeSoftWarn();

        // Continue the loop — the AI will process tool results
        logRoundTiming("tools_done");
        continue;
      }

      logRoundTiming("final_synthesis");

      // No tool calls — final synthesis. Use best available model (hybrid fallback).
      // Analysis-tier intents: use non-streaming so we can validate and repair the output.
      const _finalIntent = requestState().context.intent ?? "";
      const _finalTier = getTaskTier(_finalIntent);
      if (_finalTier === "analysis") {
        let analysisText = "";
        try {
          const { resp: nonStreamResp, model: nsModel } = await callSynthesis("", {
            messages: aiMessages,
            stream: false,
          });
          telemetry.model = nsModel;
          if (nonStreamResp.ok) {
            const nsJson = await nonStreamResp.json().catch(() => null);
            analysisText = nsJson?.choices?.[0]?.message?.content ?? nsJson?.choices?.[0]?.text ?? "";
          }
        } catch (e) {
          console.warn("[copilot-ai] analysis non-stream synthesis failed:", (e as Error).message);
        }

        if (analysisText) {
          // Validate and optionally repair the structured response
          const { data: _validData, wasRepaired, wasFallback } = await validateAiResponse({
            rawText: analysisText,
            intent: _finalIntent,
            callRepair: async (repairPrompt) => {
              const repairMessages = [...aiMessages, { role: "user" as const, content: repairPrompt }];
              const { resp: rResp } = await callSynthesis("", { messages: repairMessages, stream: false });
              if (!rResp.ok) throw new Error(`repair call failed: ${rResp.status}`);
              const rJson = await rResp.json();
              return rJson?.choices?.[0]?.message?.content ?? "";
            },
          });

          if (wasRepaired) console.log(`[copilot-ai] analysis response was repaired for intent: ${_finalIntent}`);
          if (wasFallback)  console.warn(`[copilot-ai] analysis validation fell back for intent: ${_finalIntent}`);

          const sseBody = `data: ${JSON.stringify({ choices: [{ delta: { content: analysisText } }] })}\n\ndata: [DONE]\n\n`;
          if (cacheable && cKey && !usedWriteTool && analysisText.trim()) {
            void writeCache(cKey, analysisText, ANALYTICAL_TTL);
          }
          void logTurn({ status: "ok_analysis", response_chars: analysisText.length });
          return new Response(sseBody, {
            headers: {
              ...corsHeaders, "Content-Type": "text/event-stream",
              "X-Copilot-Tier": "analysis",
              ...(wasRepaired ? { "X-Copilot-Repaired": "1" } : {}),
              ...(wasFallback  ? { "X-Copilot-Fallback": "validation-fallback" } : {}),
            },
          });
        }
        // Fall through to streaming if non-streaming synthesis failed
      }

      let streamResponse: Response;
      let synthModel = aiProvider().toolModel;
      try {
        const { resp, model } = await callSynthesis("", {
          messages: aiMessages,
          stream: true,
        });
        streamResponse = resp;
        synthModel = model;
        telemetry.model = model;
      } catch (e) {
        const content = msg.content?.trim() ||
          "The AI provider timed out while formatting the answer. I completed the data lookup; please retry once to render the result.";
        const sseBody = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        void logTurn({ status: "synthesis_fallback", response_chars: content.length, error_message: (e as Error).message });
        return new Response(sseBody, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Fallback": "synthesis-timeout" },
        });
      }

      if (!streamResponse.ok) {
        // Fallback: return the non-streamed content
        const content = msg.content || "I processed your request but couldn't generate a streamed response.";
        // Wrap in SSE format for consistent client parsing
        const sseBody = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        if (cacheable && cKey && !usedWriteTool && content) {
          void writeCache(cKey, content, ANALYTICAL_TTL);
        }
        void logTurn({ status: "ok_nostream", response_chars: content.length });
        return new Response(sseBody, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }

      // Tee the stream so we capture the assembled text for caching while
      // still forwarding chunks to the client in real-time.
      const upstream = streamResponse.body;
      if (!upstream) {
        void logTurn({ status: "ok_empty_stream" });
        return new Response(streamResponse.body, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
        });
      }
      const ttl = usedWriteTool ? ACTION_TTL : ANALYTICAL_TTL;
      const teed = teeSseForCache(upstream, (fullText) => {
        if (cacheable && cKey && !usedWriteTool && fullText.trim()) {
          void writeCache(cKey, fullText, ttl);
        }
        void logTurn({ status: "ok", response_chars: fullText.length });
      });
      return new Response(teed, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/event-stream",
          "X-Copilot-Cache": "miss",
        },
      });
    }

    // If we exhausted tool rounds, ask the model to summarize what it gathered
    // (no tools allowed) and stream that back, plus a Continue follow-up.
    aiMessages.push({
      role: "system",
      content: "You have reached the tool round limit. Do NOT call any more tools. Summarize the most useful insight from the data you've already retrieved, then on a new line append exactly:\n\n:::blocks\n[{\"type\":\"follow-ups\",\"suggestions\":[\"Continue from where you left off and finish the previous task\"]}]\n:::",
    });
    try {
      const { resp: summaryResp } = await callSynthesis("", {
        messages: aiMessages,
        stream: true,
      });
      if (summaryResp.ok && summaryResp.body) {
        const teed = teeSseForCache(summaryResp.body, (fullText) => {
          void logTurn({ status: "max_rounds", response_chars: fullText.length });
        });
        return new Response(teed, {
          headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Cap": "max_rounds" },
        });
      }
    } catch (e) {
      console.warn("max_rounds summary stream failed", e);
    }
    const fallback = "I've gathered partial data but couldn't finish in one turn. Click Continue to pick up where I left off.\n\n:::blocks\n[{\"type\":\"follow-ups\",\"suggestions\":[\"Continue from where you left off and finish the previous task\"]}]\n:::";
    const sseBody = `data: ${JSON.stringify({ choices: [{ delta: { content: fallback } }] })}\n\ndata: [DONE]\n\n`;
    void logTurn({ status: "max_rounds", response_chars: fallback.length });
    return new Response(sseBody, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });

  } catch (err) {
    requestState().log.error("turn_failed", err, { ms: Math.round(performance.now() - tStart) });
    console.error("copilot-ai error:", err);
    void logTurn({ status: "error", error_message: err instanceof Error ? err.message : "Unknown error" });
    return jsonError(err instanceof Error ? err.message : "Unknown error", 500);
  }
}

Deno.serve((req: Request) =>
  requestStateStorage.run(createRequestState(req), () => handleRequest(req))
);

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
