import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../../../supabase/functions/_shared/cors.ts";
import {
  classifyIntent,
  getGreetingResponse,
  getHelpResponse,
  buildPlainSseResponse,
} from "./intentRouter.ts";
import {
  copilotSseHeaders,
  MODEL_COMMAND_PLANE,
  MODEL_DETERMINISTIC,
  MODEL_QUERY_PATH,
} from "./copilotHeaders.ts";
import {
  GEMINI_ANALYSIS_MODEL,
  getTaskTier,
} from "./modelConfig.ts";
import { validateResponse as validateAiResponse } from "../../../supabase/functions/_shared/responseValidator.ts";
import { isConversionCountQuery, isConversionReportQuery, isCopilotPdfExportQuery, isAlumniMentorLmpQuery, isMentorCoverageQuery, isNamedPocConversionQuery, isPocWorkloadQuery, shouldPrefetchRag, extractPocNameFromConversionQuery } from "../../../supabase/functions/_shared/copilotFastPaths.ts";
import {
  fetchAlumniMentorLmpFastPath,
  fetchMentorCoverageFastPath,
  fetchNamedPocConversionFastPath,
  fetchPocWorkloadFastPath,
  formatNamedPocConversionChatSse,
  formatAlumniMentorLmpChatSse,
  formatMentorCoverageChatSse,
  formatPocWorkloadChatSse,
} from "../../../supabase/functions/_shared/fastPathHandlers.ts";
import { resolveViewAsEffectiveRole } from "../../../supabase/functions/_shared/viewAsRole.ts";
import {
  formatCancelPendingChatSse,
  formatCancelPendingErrorSse,
  formatExecutePendingChatSse,
} from "../../../supabase/functions/_shared/copilotDeterministicConfirm.ts";
import { cancelPendingAction } from "../../../supabase/functions/_shared/copilotPendingActions.ts";
import { buildConversionReport, formatConversionReportSse, tallyLmpConversionBuckets, formatLmpProcessConversionRate, type LinkRaw, type LmpRaw } from "../../../supabase/functions/_shared/conversionReport.ts";
import { requireAuth } from "../../../supabase/functions/_shared/requireAuth.ts";
import { buildProviderList, callSynthesis, callToolModel, sanitizeFailMsg, type ProviderConfig } from "./providers.ts";
import { getHealthSnapshot } from "../../../supabase/functions/_shared/circuitBreaker.ts";
import {
  requestStateStorage,
  createRequestState,
  requestState,
  aiProvider,
  resetRequestCache,
  viewAsBlocksWrites,
} from "./requestContext.ts";
import { ensureVaultLoaded, getVaultSecret } from "./secrets.ts";
import { loadSecretWithSource, normalizeSecretValue } from "../../../supabase/functions/_shared/providers/secrets.ts";
import { GEMINI_FREE_MODEL } from "../../../supabase/functions/_shared/providers/config.ts";
import { retrieveRAGContext } from "./rag.ts";
import {
  ANALYTICAL_TTL,
  ACTION_TTL,
  getCacheClient,
  isWriteTool,
  stableStringify,
  buildCacheKey,
  readCache,
  writeCache,
  replayCachedSse,
  teeSseForCache,
} from "./cache.ts";
import {
  classifyViaRouter,
  executeQueryPath,
  fetchReasoningHint,
  fetchWorkflowSteps,
  looksMultiStep,
  queryTemplateForDecision,
} from "./pathServices.ts";
import { TOOLS, executeTool } from "./tools/index.ts";
import { getLmpRecords, getMastersheetRecords } from "./tools/runtime.ts";
import { buildSystemPrompt, type ActiveContextHint } from "./systemPrompt.ts";

function sanitizeProviderDetail(msg: string): string {
  return sanitizeFailMsg(msg).slice(0, 400);
}

async function probeGeminiNativeGenerate(apiKey: string) {
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FREE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 8 },
        }),
      },
    );
    const bodyText = (await resp.text()).slice(0, 300);
    const lower = bodyText.toLowerCase();
    const blocked = lower.includes("are blocked") || lower.includes("permission_denied");
    return { ok: resp.ok, status: resp.status, blocked, error: resp.ok ? null : sanitizeFailMsg(bodyText) };
  } catch (e) {
    return { ok: false, status: 0, blocked: false, error: sanitizeFailMsg((e as Error).message) };
  }
}

async function probeCopilotProvider(
  prov: ProviderConfig,
  keyMeta?: { source: string | null; envLast4: string | null; vaultLast4: string | null; mismatch: boolean },
) {
  const keyPresent = Boolean(prov.key);
  const keyLast4 = prov.key ? prov.key.slice(-4) : null;
  if (!keyPresent) {
    return {
      name: prov.name,
      model: prov.toolModel,
      keyPresent: false,
      keyLast4: null,
      keySource: keyMeta?.source ?? null,
      keyLength: 0,
      envLast4: keyMeta?.envLast4 ?? null,
      vaultLast4: keyMeta?.vaultLast4 ?? null,
      keyMismatch: keyMeta?.mismatch ?? false,
      status: 0,
      ok: false,
      blocked: false,
      nativeGenerate: null,
      error: "key not configured",
    };
  }
  let status = 0;
  let ok = false;
  let blocked = false;
  let error: string | null = null;
  try {
    const resp = await fetch(prov.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${prov.key}`,
        "Content-Type": "application/json",
        ...prov.extraHeaders,
      },
      signal: AbortSignal.timeout(10_000),
      body: JSON.stringify({
        model: prov.toolModel,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 8,
      }),
    });
    status = resp.status;
    ok = resp.ok;
    const bodyText = await resp.text().catch(() => "");
    const lower = bodyText.toLowerCase();
    blocked = lower.includes("are blocked") || lower.includes("permission_denied");
    if (!ok) {
      error = sanitizeFailMsg(bodyText || `HTTP ${status}`);
    }
  } catch (e) {
    error = sanitizeFailMsg((e as Error).message);
  }
  const nativeGenerate = prov.name === "Gemini" && prov.key
    ? await probeGeminiNativeGenerate(prov.key)
    : null;
  return {
    name: prov.name,
    model: prov.toolModel,
    keyPresent,
    keyLast4,
    keySource: keyMeta?.source ?? null,
    keyLength: prov.key?.length ?? 0,
    envLast4: keyMeta?.envLast4 ?? null,
    vaultLast4: keyMeta?.vaultLast4 ?? null,
    keyMismatch: keyMeta?.mismatch ?? false,
    status,
    ok,
    blocked,
    nativeGenerate,
    error,
  };
}

async function loadProviderKeyMeta(name: string) {
  const envRaw = Deno.env.get(name);
  const envVal = envRaw ? normalizeSecretValue(envRaw) : null;
  await ensureVaultLoaded();
  const vaultVal = getVaultSecret(name) ?? null;
  const { value, source } = await loadSecretWithSource(name);
  const mismatch = Boolean(envVal && vaultVal && envVal !== vaultVal);
  return {
    value,
    source,
    envLast4: envVal ? envVal.slice(-4) : null,
    vaultLast4: vaultVal ? vaultVal.slice(-4) : null,
    mismatch,
  };
}

export async function handleChatRequest(req: Request) {
  const corsHeaders = buildCorsHeaders(req);
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

  // Load Vault secrets once per cold start; loadSecretWithSource checks env first then Vault.
  await ensureVaultLoaded();

  const [geminiMeta, openrouterMeta, grokMeta] = await Promise.all([
    loadProviderKeyMeta("GEMINI_API_KEY"),
    loadProviderKeyMeta("OPENROUTER_API_KEY"),
    loadProviderKeyMeta("GROK_API_KEY"),
  ]);
  const GEMINI_API_KEY = geminiMeta.value ?? undefined;
  const OPENROUTER_API_KEY = openrouterMeta.value ?? undefined;
  const GROK_API_KEY = grokMeta.value ?? undefined;

  if (geminiMeta.mismatch) {
    console.warn(
      `[copilot-ai] GEMINI_API_KEY env(…${geminiMeta.envLast4}) differs from vault(…${geminiMeta.vaultLast4}); using env`,
    );
  }

  const ai = aiProvider();
  ai.providers = buildProviderList(GEMINI_API_KEY, OPENROUTER_API_KEY, GROK_API_KEY);

  if (!ai.providers.length) {
    return jsonError("No AI API key configured. Set GEMINI_API_KEY (or OPENROUTER_API_KEY, GROK_API_KEY) in Supabase Edge Function secrets.", 503, corsHeaders);
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

  console.log(
    `[copilot-ai] providers configured: ${ai.providers.map(p => p.name).join(" → ")}`,
    `| primary=${primaryProvider.name} | toolModel=${ai.toolModel}`,
    `| geminiKey=${geminiMeta.source ?? "missing"}…${geminiMeta.value?.slice(-4) ?? "none"}`,
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
    diag?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400, corsHeaders);
  }

  if (body.diag === true) {
    if (authedUser.role !== "admin") {
      return new Response(JSON.stringify({ error: "diag is admin-only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const keyMetaByName: Record<string, Awaited<ReturnType<typeof loadProviderKeyMeta>>> = {
      Gemini: geminiMeta,
      OpenRouter: openrouterMeta,
      Grok: grokMeta,
    };
    const providerResults = await Promise.all(
      ai.providers.map((p) => probeCopilotProvider(p, {
        source: keyMetaByName[p.name]?.source ?? null,
        envLast4: keyMetaByName[p.name]?.envLast4 ?? null,
        vaultLast4: keyMetaByName[p.name]?.vaultLast4 ?? null,
        mismatch: keyMetaByName[p.name]?.mismatch ?? false,
      })),
    );
    return new Response(JSON.stringify({
      diag: true,
      providers: providerResults,
      circuit: getHealthSnapshot(),
      hint: geminiMeta.mismatch
        ? "GEMINI_API_KEY in Edge Function secrets (env) differs from vault — update both or remove the stale copy."
        : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
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
    // "deterministic" until an actual LLM call overwrites it (callToolModel /
    // callSynthesis set the real model) — fast paths and query-path answers
    // must not be logged as Gemini usage.
    model: "deterministic",
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
        const { logAiUsage } = await import("../../../supabase/functions/_shared/ai-usage.ts");
        const lastUser = [...(messages || [])].reverse().find((m) => m.role === "user")?.content || "";
        const { estimateTokens } = await import("../../../supabase/functions/_shared/ai-usage.ts");
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
  let effectiveRole: string = authedUser.role;
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
        headers: copilotSseHeaders(corsHeaders, {
          intent: telemetry.intent,
          path: "COMMAND",
          model: MODEL_COMMAND_PLANE,
        }),
      });
    }

    if (viewAsBlocksWrites()) {
      const text = formatExecutePendingChatSse({
        blocked: true,
        error: "View-as mode is read-only. Switch back to your own perspective to make changes.",
      });
      void logTurn({ status: "error", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: copilotSseHeaders(corsHeaders, {
          intent: telemetry.intent,
          path: "COMMAND",
          model: MODEL_COMMAND_PLANE,
        }),
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
      headers: copilotSseHeaders(corsHeaders, {
        intent: telemetry.intent,
        path: "COMMAND",
        model: MODEL_COMMAND_PLANE,
      }),
    });
  }

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    requestState().log.warn("missing_messages");
    return jsonError("Missing 'messages' array", 400, corsHeaders);
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

  // ─── Intent-based model override ─────────────────────────────────────────
  // Must run AFTER classifyIntent — the tier depends on the classified intent.
  const tier = getTaskTier(intent);
  if (tier === "analysis" && primaryProvider.name === "Gemini") {
    ai.toolModel = GEMINI_ANALYSIS_MODEL;
    ai.providers[0] = { ...ai.providers[0], toolModel: GEMINI_ANALYSIS_MODEL };
    console.log(`[copilot-ai] intent=${intent} tier=analysis → toolModel=${GEMINI_ANALYSIS_MODEL}`);
  }
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
      headers: copilotSseHeaders(corsHeaders, {
        intent: "greeting",
        path: "LOCAL",
        model: MODEL_DETERMINISTIC,
      }),
    });
  }
  if (intent === "help") {
    const text = getHelpResponse();
    telemetry.intent = "help";
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: copilotSseHeaders(corsHeaders, {
        intent: "help",
        path: "LOCAL",
        model: MODEL_DETERMINISTIC,
      }),
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
      headers: copilotSseHeaders(corsHeaders, {
        intent: telemetry.intent,
        path: "FAST",
        model: MODEL_DETERMINISTIC,
      }),
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
        headers: copilotSseHeaders(corsHeaders, {
          intent: "mentor_coverage_fast_path",
          path: "FAST",
          model: MODEL_DETERMINISTIC,
        }),
      });
    }
    requestState().log.warn("mentor_coverage_fast_path_failed", { error: result.error });
  }

  if (isAlumniMentorLmpQuery(lastUserMessage)) {
    const result = await fetchAlumniMentorLmpFastPath();
    if (result.ok) {
      const text = formatAlumniMentorLmpChatSse(result);
      telemetry.intent = "alumni_mentor_lmp_fast_path";
      void logTurn({ status: "ok", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: copilotSseHeaders(corsHeaders, {
          intent: "alumni_mentor_lmp_fast_path",
          path: "FAST",
          model: MODEL_DETERMINISTIC,
        }),
      });
    }
    requestState().log.warn("alumni_mentor_lmp_fast_path_failed", { error: result.error });
  }

  if (isNamedPocConversionQuery(
    lastUserMessage,
    requestedActiveContext?.entity_type === "poc" ? requestedActiveContext.display_name : null,
  )) {
    const pocName = extractPocNameFromConversionQuery(
      lastUserMessage,
      requestedActiveContext?.entity_type === "poc" ? requestedActiveContext.display_name : null,
    );
    if (pocName) {
      const result = await fetchNamedPocConversionFastPath(pocName);
      if (result.ok) {
        const text = formatNamedPocConversionChatSse(result);
        telemetry.intent = "named_poc_conversion_fast_path";
        void logTurn({ status: "ok", response_chars: text.length });
        return new Response(buildPlainSseResponse(text), {
          headers: copilotSseHeaders(corsHeaders, {
            intent: telemetry.intent,
            path: "FAST",
            model: MODEL_DETERMINISTIC,
          }),
        });
      }
      requestState().log.warn("named_poc_conversion_fast_path_failed", { error: result.error, pocName });
    }
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
        headers: copilotSseHeaders(corsHeaders, {
          intent: telemetry.intent,
          path: "FAST",
          model: MODEL_DETERMINISTIC,
        }),
      });
    }
    const { text, intent } = formatPocWorkloadChatSse(result, lastUserMessage);
    telemetry.intent = intent;
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: copilotSseHeaders(corsHeaders, {
        intent: telemetry.intent,
        path: "FAST",
        model: MODEL_DETERMINISTIC,
      }),
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
        headers: copilotSseHeaders(corsHeaders, {
          intent: telemetry.intent,
          path: "FAST",
          model: MODEL_DETERMINISTIC,
        }),
      });
    }
    const report = buildConversionReport(
      pocsRes.data ?? [],
      // supabase-js infers the to-one `lmp_processes` join as an array without
      // generated DB types; at runtime it is a single object (FK to-one).
      (linksRes.data ?? []) as unknown as LinkRaw[],
      candidatesRes.data ?? [],
      studentsRes.data ?? [],
      (lmpsRes.data ?? []) as unknown as LmpRaw[],
    );
    const text = formatConversionReportSse(report);
    telemetry.intent = "conversion_report_fast_path";
    void logTurn({ status: "ok", response_chars: text.length });
    return new Response(buildPlainSseResponse(text), {
      headers: copilotSseHeaders(corsHeaders, {
        intent: telemetry.intent,
        path: "FAST",
        model: MODEL_DETERMINISTIC,
      }),
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
      const buckets = tallyLmpConversionBuckets(all.map((r) => r.status));
      const converted = buckets.converted;
      const offers = all.filter((r) => /offer received/i.test(r.status || "")).length;
      const ongoing = all.filter((r) => /ongoing/i.test(r.status || "")).length;
      const rate = buckets.lmpProcessConversionPct ?? 0;
      const byDomain = new Map<string, number>();
      for (const row of all.filter((r) => /^converted$/i.test(r.status || "") || /offer received/i.test(r.status || ""))) {
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
            { label: "Conversion rate", value: formatLmpProcessConversionRate(buckets) },
          ] },
          ...(byDomain.size ? [{ type: "bar-chart", title: "Converted by domain", data: [...byDomain].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value) }] : []),
          { type: "follow-ups", suggestions: ["Show converted processes", "Break down conversion by POC", "Show conversion by domain"] },
        ]),
        ":::",
      ].join("\n");
      telemetry.intent = "conversion_count_fast_path";
      void logTurn({ status: "ok", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: copilotSseHeaders(corsHeaders, {
          intent: "conversion_count_fast_path",
          path: "FAST",
          model: MODEL_DETERMINISTIC,
        }),
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
      headers: copilotSseHeaders(corsHeaders, {
        intent: telemetry.intent,
        path: "FAST",
        model: MODEL_DETERMINISTIC,
      }),
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

  // ── Hybrid-mesh advisory signals ──
  // Shadow-classify via the intent-router (rules + semantic classifier) and
  // fetch path-service hints in parallel. Strictly advisory: 300ms budget,
  // silent fallback, never replaces the local classification or tool loop.
  const meshLmpId = typeof body.lmpId === "string" ? body.lmpId : null;
  const [routerDecision, reasoningGuidance, workflowSteps] = await Promise.all([
    classifyViaRouter(lastUserMessage, {
      role: authedUser.role,
      real_role: authedUser.role,
      view_as_role: requestState().context.isImpersonating ? effectiveRole : null,
      view_as_user_name: requestState().context.viewAsName,
      lmp_id: meshLmpId,
      mode: requestedMode,
      history_len: messages.length,
    }),
    tier === "analysis"
      ? fetchReasoningHint({
        utterance: lastUserMessage,
        subIntent: intent,
        role: effectiveRole,
        lmpId: meshLmpId,
        mode: requestedMode,
      })
      : Promise.resolve(null),
    looksMultiStep(lastUserMessage)
      ? fetchWorkflowSteps(lastUserMessage)
      : Promise.resolve(null),
  ]);
  if (routerDecision) {
    requestState().log.event("router_decision", {
      category: routerDecision.category,
      sub_intent: routerDecision.sub_intent,
      confidence: routerDecision.confidence,
      local_intent: intent,
    });
    // When the local regex classifier is unsure, the router's verdict may
    // still warrant the analysis-tier model upgrade.
    if (
      intent === "unknown" &&
      (routerDecision.category === "REASONING" || routerDecision.category === "WORKFLOW") &&
      ai.providers[0]?.name === "Gemini"
    ) {
      ai.toolModel = GEMINI_ANALYSIS_MODEL;
      ai.providers[0] = { ...ai.providers[0], toolModel: GEMINI_ANALYSIS_MODEL };
      console.log(`[copilot-ai] router=${routerDecision.category} (local unknown) → toolModel=${GEMINI_ANALYSIS_MODEL}`);
    }
  }

  // ── Deterministic QUERY routing (diagram: Query Path — no LLM) ──
  // When the intent-router says QUERY with decent confidence and a query-path
  // template can answer it, serve the turn from query-path templates against
  // Supabase — no Gemini call, no AI budget. Any failure falls through to the
  // tool loop below.
  if (
    routerDecision &&
    routerDecision.category === "QUERY" &&
    routerDecision.confidence >= 0.6 &&
    !ACTION_MODES.has(requestedMode)
  ) {
    const mapping = queryTemplateForDecision(routerDecision.sub_intent, lastUserMessage);
    if (mapping) {
      const qpText = await executeQueryPath({
        template: mapping.template,
        args: mapping.args,
        utterance: lastUserMessage,
        subIntent: routerDecision.sub_intent,
        role: requestState().context.effectiveRole ?? authedUser.role,
        userName: requestState().context.effectiveName ?? requestState().context.actorName,
      });
      if (qpText) {
        telemetry.intent = `query_${mapping.template}`;
        requestState().log.event("query_path_served", {
          template: mapping.template,
          sub_intent: routerDecision.sub_intent,
          confidence: routerDecision.confidence,
        });
        void logTurn({ status: "ok", response_chars: qpText.length });
        return new Response(buildPlainSseResponse(qpText), {
          headers: copilotSseHeaders(corsHeaders, {
            intent: telemetry.intent,
            path: "QUERY",
            model: MODEL_QUERY_PATH,
          }),
        });
      }
      requestState().log.warn("query_path_route_failed", { template: mapping.template });
    }
  }

  // ── AI budget — reserved only for turns that actually reach the LLM loop.
  // Greetings, fast paths, cached replays, and query-path answers above cost
  // nothing and must not decrement the daily budget or log Gemini usage.
  const { reserveAiRequest } = await import("../../../supabase/functions/_shared/ai-usage.ts");
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
        const buckets = tallyLmpConversionBuckets(records.map((r) => r["Status"]));
        const convDisplay = formatLmpProcessConversionRate(buckets);
        const recent = records.slice(-10).reverse().map((r) =>
          `${r["Company"]} - ${r["Role"]} [${r["Status"]}] (${r["Domain"]}, ${r["Type"]}, POC: ${r["Prep POC"] || "?"})`
        );

        sheetSummary += `\n\n### LMP Tracker: ${total} total records`;
        if (lmpHeaders.length) sheetSummary += `\nColumns: ${lmpHeaders.filter(Boolean).join(", ")}`;
        sheetSummary += `\nStatus: ${Object.entries(statusDist).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nDomains: ${Object.entries(domainDist).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nTypes: ${Object.entries(typeDist).map(([k, v]) => `${k}=${v}`).join(", ")}`;
        sheetSummary += `\nConversion rate: ${convDisplay}`;
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

    // Path-service hints (advisory context from the reasoning/workflow paths).
    if (reasoningGuidance) {
      aiMessages.push({ role: "system", content: `Reasoning-path hint: ${reasoningGuidance}` });
    }
    if (workflowSteps) {
      aiMessages.push({
        role: "system",
        content: `Workflow-path decomposition suggestion — consider these steps in order: ${workflowSteps.join(" → ")}`,
      });
    }

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
        const errMsg = sanitizeProviderDetail((toolModelErr as Error).message);
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

      if (!choice) return jsonError("No AI response", 500, corsHeaders);

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
            headers: copilotSseHeaders(corsHeaders, {
              intent: telemetry.intent,
              path: "AGENT",
              model: telemetry.model,
              extra: {
                "X-Copilot-Tier": "analysis",
                ...(wasRepaired ? { "X-Copilot-Repaired": "1" } : {}),
                ...(wasFallback ? { "X-Copilot-Fallback": "validation-fallback" } : {}),
              },
            }),
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
        const errMsg = sanitizeProviderDetail((e as Error).message);
        if (errMsg.includes("AI gateway unavailable")) {
          void logTurn({ status: "ai_gateway_error", error_message: errMsg });
          return new Response(JSON.stringify({
            error: true,
            code: "ALL_AI_PROVIDERS_UNAVAILABLE",
            message: "AI services are temporarily unavailable. Please retry in a moment.",
            detail: errMsg,
          }), { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json", "X-Copilot-Fallback": "synthesis-exhausted" } });
        }
        const content = msg.content?.trim() ||
          "The AI provider timed out while formatting the answer. I completed the data lookup; please retry once to render the result.";
        const sseBody = `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\ndata: [DONE]\n\n`;
        void logTurn({ status: "synthesis_fallback", response_chars: content.length, error_message: errMsg });
        return new Response(sseBody, {
          headers: copilotSseHeaders(corsHeaders, {
            intent: telemetry.intent,
            path: "AGENT",
            model: telemetry.model,
            extra: { "X-Copilot-Fallback": "synthesis-timeout" },
          }),
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
          headers: copilotSseHeaders(corsHeaders, {
            intent: telemetry.intent,
            path: "AGENT",
            model: telemetry.model,
          }),
        });
      }

      // Tee the stream so we capture the assembled text for caching while
      // still forwarding chunks to the client in real-time.
      const upstream = streamResponse.body;
      if (!upstream) {
        void logTurn({ status: "ok_empty_stream" });
        return new Response(streamResponse.body, {
          headers: copilotSseHeaders(corsHeaders, {
            intent: telemetry.intent,
            path: "AGENT",
            model: synthModel,
          }),
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
        headers: copilotSseHeaders(corsHeaders, {
          intent: telemetry.intent,
          path: "AGENT",
          model: synthModel,
          extra: { "X-Copilot-Cache": "miss" },
        }),
      });
    }

    // If we exhausted tool rounds, ask the model to summarize what it gathered
    // (no tools allowed) and stream that back, plus a Continue follow-up.
    aiMessages.push({
      role: "system",
      content: "You have reached the tool round limit. Do NOT call any more tools. Summarize the most useful insight from the data you've already retrieved, then on a new line append exactly:\n\n:::blocks\n[{\"type\":\"follow-ups\",\"suggestions\":[\"Continue from where you left off and finish the previous task\"]}]\n:::",
    });
    try {
      const { resp: summaryResp, model: summaryModel } = await callSynthesis("", {
        messages: aiMessages,
        stream: true,
      });
      if (summaryResp.ok && summaryResp.body) {
        telemetry.model = summaryModel;
        const teed = teeSseForCache(summaryResp.body, (fullText) => {
          void logTurn({ status: "max_rounds", response_chars: fullText.length });
        });
        return new Response(teed, {
          headers: copilotSseHeaders(corsHeaders, {
            intent: "max_rounds",
            path: "AGENT",
            model: summaryModel,
            extra: { "X-Copilot-Cap": "max_rounds" },
          }),
        });
      }
    } catch (e) {
      console.warn("max_rounds summary stream failed", e);
    }
    const fallback = "I've gathered partial data but couldn't finish in one turn. Click Continue to pick up where I left off.\n\n:::blocks\n[{\"type\":\"follow-ups\",\"suggestions\":[\"Continue from where you left off and finish the previous task\"]}]\n:::";
    const sseBody = `data: ${JSON.stringify({ choices: [{ delta: { content: fallback } }] })}\n\ndata: [DONE]\n\n`;
    void logTurn({ status: "max_rounds", response_chars: fallback.length });
    return new Response(sseBody, {
      headers: copilotSseHeaders(corsHeaders, {
        intent: "max_rounds",
        path: "AGENT",
        model: telemetry.model,
      }),
    });

  } catch (err) {
    requestState().log.error("turn_failed", err, { ms: Math.round(performance.now() - tStart) });
    console.error("copilot-ai error:", err);
    void logTurn({ status: "error", error_message: err instanceof Error ? err.message : "Unknown error" });
    return jsonError(err instanceof Error ? err.message : "Unknown error", 500, corsHeaders);
  }
}

function jsonError(message: string, status: number, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
