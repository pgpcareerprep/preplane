// Conversational, agentic voice copilot.
// - Phonetic glossary normalises STT mishears ("poses" -> POCs, "elemental" -> LMP)
// - Multi-round tool loop (up to 4 rounds)
// - Reads + staged writes against the same Supabase tables the chat copilot uses
// - All writes go through prepare -> verbal confirm -> execute
import { createClient } from "npm:@supabase/supabase-js@2";
import { AsyncLocalStorage } from "node:async_hooks";
import { logAiUsage, estimateTokens, reserveAiRequest } from "../_shared/ai-usage.ts";
import { isMentorCoverageQuery, isPocWorkloadQuery } from "../_shared/copilotFastPaths.ts";
import {
  fetchMentorCoverageFastPath,
  fetchPocWorkloadFastPath,
  formatMentorCoverageVoice,
  formatPocWorkloadVoice,
} from "../_shared/fastPathHandlers.ts";
import { GEMINI_TOOL_FALLBACK_MODELS } from "../copilot-ai/modelConfig.ts";
import { TOOLS as COPILOT_TOOL_REGISTRY, executeTool as copilotExecuteTool } from "../copilot-ai/tools/index.ts";
import { createRequestState, requestStateStorage, type CopilotRequestState } from "../copilot-ai/requestContext.ts";
import { buildProviderList, callToolModel } from "../copilot-ai/providers.ts";
import { validateLogSubmissionArgs } from "../_shared/logSubmissionWrite.ts";
import { formatLmpLabel, trimStr, validateVoicePrepareWrite } from "../_shared/lmpWriteValidation.ts";
import { stagePendingAction } from "../_shared/copilotPendingActions.ts";
import { resolveViewAsEffectiveRole } from "../_shared/viewAsRole.ts";
import {
  buildVoiceNameNormalizationBlock,
  buildVoicePocRosterBlock,
} from "../_shared/voicePhoneticGlossary.ts";


import { buildCorsHeaders } from "../_shared/cors.ts";

const MAX_ROUNDS = 4;

// Vault secrets cache (per cold start) — delegates to copilot-ai secrets module.
import { ensureVaultLoaded, getEnv } from "../copilot-ai/secrets.ts";

async function loadVoiceVault(): Promise<void> {
  await ensureVaultLoaded();
}
function voiceEnv(name: string): string | undefined {
  return getEnv(name);
}

type VoiceRequestState = {
  viewAs: { impersonating: boolean; name: string | null };
  userId: string | null;
  effectiveName: string;
  effectiveRole: string;
  authToken: string;
  role: string;
  actorName: string;
  isImpersonating: boolean;
};

const voiceRequestStateStorage = new AsyncLocalStorage<VoiceRequestState>();

function voiceRequestState(): VoiceRequestState {
  const state = voiceRequestStateStorage.getStore();
  if (!state) throw new Error("Voice request context is unavailable");
  return state;
}

const SYSTEM_PROMPT = `You are a CONVERSATIONAL VOICE assistant for the LMP placement platform. Your replies are spoken aloud.

OUTPUT RULES
- 1 short spoken sentence (max 30 words). Plain spoken English. NO markdown, NO bullets, NO emojis, NO lists.
- Exception: after web_search, up to 3 spoken sentences (max ~60 words).
- Be warm and natural. Speak numbers and names as a human would.
- Never say "I'll call the tool" — just do it and speak the result.

DOMAIN GLOSSARY
- LMP process = a placement process (company + role). "LMP" alone means LMP process.
- POC = Point of Contact (a placement team member). Roles: prep_poc, support_poc, outreach_poc.
- Domain = a career domain (Finance, PM, Data, Marketing, Sales, Consulting, FOCOS, HR, Supply Chain).
- Student = a candidate attached to an LMP process. Mentor = external/alumni mentor.

VOICE TRANSCRIPT NORMALISATION (CRITICAL)
The user is speaking, so transcripts often contain mishearings. Silently treat these as
synonyms unless context clearly says otherwise:
  poses, posts, pause, pose, push, posters, possess, pauses, opposes -> POCs
  poke, poker, pog, peewee see -> POC
  elemental, element, MVP, MMP, NMP, lump, lamp, ramp, ramps, RAM piece -> LMP
  elementals, lamps, lumps, ramps -> LMPs
  mentos, mentor's, men toes, mintos -> mentors
  dome, domes -> domain
  studens, studios, studence, students' -> students
  alumnae, alumni a, all umni -> alumni
  recoo, recco, recoo's, reckos -> recommendations
  one to one, 121, one-to-one mock -> 1:1 mock
  prep poke, prep poker -> prep POC
  out reach, out-reach -> outreach
Person-specific name mappings are listed in POC NAME NORMALISATION below (from poc_profiles.aliases).
ALWAYS prefer matching against the CURRENT USER or POC ROSTER names below when an
utterance contains a token that fuzzily resembles one of those names.
Always interpret ambiguous voice input in the placement / LMP context first.

CONTEXT DISAMBIGUATION (BUG-V4)
- Apply the glossary above ONLY when surrounding words suggest the placement domain
  (e.g. count, list, assign, status, domain, mentor, student, prep, outreach, company, role, conversion).
- If the user clearly used a normal English word in a non-placement sentence
  (e.g. "post this to slack", "ramp up hiring next quarter", "the lamp on my desk"),
  do NOT silently rewrite it. Treat it literally and, if the request falls outside
  this assistant's scope, ask one short clarifying question.

TOOLS — YOU MUST USE THEM
- NEVER answer counting, listing, lookup, or analytics questions from memory. ALWAYS call a tool.
- "How many POCs / LMPs / students / mentors" -> list_entities (entity_type accordingly).
- "How many poses / pauses / posts / pose / push" -> ALWAYS list_entities(poc). Do NOT refuse — these are voice mishears for "POCs".
- "How many elementals / lamps / lumps / ramps / MVPs" -> ALWAYS list_entities(lmp). These are mishears for "LMPs".
- "Tell me about <name>" / "find <name>" -> resolve_entity.
- "Progress / performance / workload / how is X doing / update on X / what is X working on" for a POC ->
  call get_analytics with metric="poc_workload" and poc=<name>. If unsure the POC exists,
  call resolve_entity(<name>, preferred_scope="poc") FIRST, then get_analytics.
- Analytics ("ongoing count", "conversion rate", "POC workload") -> get_analytics.
- "Filter LMPs by X" -> search_lmp_records.
- "Search students" / "find student" -> search_students.
- "Find mentors for LMP" / "match mentors" -> find_mentors_for_lmp.
- "Recommend POCs" / "who should be POC" -> recommend_pocs.
- "Log submission" / "log interview round" -> log_submission (then verbal confirm via prepare_write staging).
- "How many submissions" -> search_lmp_records or get_analytics.
- External / current real-world facts about a company, industry, or public news
  (e.g. "what does Stripe do", "who is the CEO of Google") -> web_search.
  NEVER use search_lmp_records / list_entities for these — those are PrepLane DB only.
- After web_search returns: speak a 2-3 sentence synthesis only (max ~60 words).
  Do NOT read URLs or the sources list aloud. Mention "I found this from [source]"
  only if the user explicitly asks where you got it.
- Greetings / chitchat / clarifying questions -> respond directly with no tool.
- If you are unsure what the user means, prefer calling resolve_entity or get_analytics over refusing.
- NEVER reply with "Sorry I didn't catch that" — if you can't parse the request, call resolve_entity
  with the most likely name token from the user's utterance.

WRITES (prepare -> confirm -> execute)
- For ANY write (create LMP, assign POC, change status, update field, delete, log submission) — call prepare_write OR the dedicated write tool (update_lmp_status, assign_poc, log_submission) which stages via prepare_write internally.
  Staged actions return a one-line summary. Speak that summary ending with
  "Should I go ahead?" Do NOT speak "Done" until the user confirms.
- If a write needs more info (e.g. user said "create LMP for Google" with no role) — ask one short
  clarifying question. Don't stage incomplete writes.

Be decisive. Use tools. Stay in the placement domain.`;

// ─── Tool Schemas (shared chat registry + voice-specific prepare_write) ─────
const VOICE_EXCLUDED_TOOLS = new Set([
  "prepare_write", "execute_pending", "check_permission",
  "update_lmp_status", "update_lmp_field", "assign_poc",
  "add_lmp_record", "delete_lmp_record", "bulk_update", "log_activity",
  "make_plan", "update_plan_step", "analyze_cv", "create_case_study",
]);

const VOICE_PREPARE_WRITE_TOOL = {
  type: "function",
  function: {
    name: "prepare_write",
    description: "Stage a write. Returns a summary to speak with 'Should I go ahead?'. Does NOT execute.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: [
            "create_lmp",
            "update_lmp_status",
            "update_lmp_field",
            "assign_poc",
            "delete_lmp",
            "update_student_field",
            "log_submission",
          ],
        },
        company: { type: "string" },
        role: { type: "string" },
        domain: { type: "string" },
        type: { type: "string", description: "Full Time, Internship, Live Project, Case Competition" },
        status: { type: "string" },
        prep_poc: { type: "string" },
        support_poc: { type: "string" },
        outreach_poc: { type: "string" },
        poc_name: { type: "string" },
        poc_type: { type: "string", enum: ["primary", "secondary", "support", "outreach"] },
        field: { type: "string" },
        value: { type: "string" },
        student_name: { type: "string" },
        candidate: { type: "string" },
        candidate_name: { type: "string" },
        round: { type: "string", enum: ["Submitted", "R1", "R2", "R3", "Offer"] },
        outcome: { type: "string", enum: ["Submitted", "Cleared", "Rejected", "Selected", "Pending"] },
        date: { type: "string" },
      },
      required: ["action"],
    },
  },
};

const tools = [
  ...COPILOT_TOOL_REGISTRY.filter((t) => !VOICE_EXCLUDED_TOOLS.has(t.function.name)),
  VOICE_PREPARE_WRITE_TOOL,
];

function voiceActionToChatKindPayload(p: PendingAction): { kind: string; payload: Record<string, unknown> } {
  switch (p.action) {
    case "create_lmp":
      return {
        kind: "add_lmp_record",
        payload: {
          company: p.company,
          role: p.role,
          domain: p.domain,
          type: p.type,
          status: p.status,
          prep_poc: p.prep_poc,
          support_poc: p.support_poc,
          outreach_poc: p.outreach_poc,
        },
      };
    case "update_lmp_status":
      return { kind: "update_lmp_status", payload: { company: p.company, role: p.role, status: p.status } };
    case "update_lmp_field":
      return {
        kind: "update_lmp_field",
        payload: { company: p.company, role: p.role, fields: { [String(p.field)]: p.value } },
      };
    case "assign_poc":
      return {
        kind: "assign_poc",
        payload: {
          company: p.company,
          role: p.role,
          poc_name: p.poc_name,
          poc_type: p.poc_type === "support" || p.poc_type === "secondary"
            ? "secondary"
            : p.poc_type === "outreach"
            ? "outreach"
            : "primary",
        },
      };
    case "delete_lmp":
      return { kind: "delete_lmp_record", payload: { company: p.company, role: p.role } };
    case "log_submission":
      return { kind: "log_submission", payload: { ...p } };
    default:
      return { kind: String(p.action), payload: { ...p } };
  }
}

function buildVoiceCopilotState(): CopilotRequestState {
  const vs = voiceRequestState();
  const state = createRequestState(new Request("http://voice-internal"));
  state.context.role = vs.role;
  state.context.userId = vs.userId;
  state.context.actorName = vs.actorName;
  state.context.isImpersonating = vs.isImpersonating;
  state.context.viewAsName = vs.viewAs.name;
  state.context.effectiveRole = vs.effectiveRole;
  state.context.effectiveName = vs.effectiveName;
  state.context.authToken = vs.authToken;
  state.ai.providers = buildProviderList(
    voiceEnv("GEMINI_API_KEY"),
    voiceEnv("OPENROUTER_API_KEY"),
    voiceEnv("GROK_API_KEY"),
  );
  return state;
}

async function withCopilotRequestState<T>(fn: () => Promise<T>): Promise<T> {
  return requestStateStorage.run(buildVoiceCopilotState(), fn);
}

async function runSharedCopilotTool(name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const raw = await withCopilotRequestState(() => copilotExecuteTool(name, args));
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { raw };
  }
}

async function voiceCallModel(messages: unknown[], forceTool = false) {
  const t0 = Date.now();
  const promptText = (messages as { content?: string }[]).map((m) =>
    typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? ""),
  ).join("\n");

  return withCopilotRequestState(async () => {
    const { resp, model, provider } = await callToolModel({
      messages,
      tools,
      tool_choice: forceTool ? "required" : "auto",
      temperature: 0.3,
      max_tokens: 600,
    }, 15_000);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      logAiUsage({
        userId: voiceRequestState().userId,
        feature: `voice-${provider.toLowerCase()}`,
        model,
        promptTokens: estimateTokens(promptText),
        latencyMs: Date.now() - t0,
        status: resp.status === 429 ? "rate_limited" : "error",
        errorMessage: errText.slice(0, 200),
      });
      throw new Error(`Voice AI unavailable: ${provider}/${model} HTTP ${resp.status}. Please try again.`);
    }

    const data = await resp.json();
    const usage = data?.usage ?? {};
    const pt = Number(usage.prompt_tokens) || estimateTokens(promptText);
    const rt = Number(usage.completion_tokens) || estimateTokens(JSON.stringify(data?.choices?.[0]?.message ?? ""));
    logAiUsage({
      userId: voiceRequestState().userId,
      feature: `voice-${provider.toLowerCase()}`,
      model,
      promptTokens: pt,
      responseTokens: rt,
      totalTokens: Number(usage.total_tokens) || (pt + rt),
      latencyMs: Date.now() - t0,
      status: "ok",
    });
    return data;
  });
}

function voiceBlockForTool(name: string, result: Record<string, unknown>, args: Record<string, unknown>): unknown {
  if (result.error) return undefined;
  switch (name) {
    case "list_entities":
      return { type: "count", entity: args.entity_type, count: result.count, sample: result.sample ?? result.pocs ?? result.entities };
    case "resolve_entity":
      return { type: "entity_lookup", query: args.query, result };
    case "search_lmp_records": {
      const total = Number(result.total_count ?? result.returned_count ?? 0);
      const rows = (result.records as unknown[]) ?? [];
      return total > 0 ? { type: "lmp_list", rows, total } : undefined;
    }
    case "get_student_profile":
    case "search_students":
      return !result.error ? { type: "student_profile", data: result } : undefined;
    case "get_analytics":
      return { type: "analytics", metric: args.metric, data: result };
    case "recommend_pocs":
      return { type: "poc_recommendations", data: result };
    case "find_mentors_for_lmp":
    case "find_mentors_for_jd":
      return { type: "mentor_shortlist", data: result };
    default:
      return undefined;
  }
}

// ─── Supabase (read-only helpers for prepare_write snapshots) ───────────────
function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function voiceBlocksWrites(): boolean {
  return voiceRequestState().viewAs.impersonating;
}

/** Exact company+role match — avoids partial ilike hitting the wrong LMP. */
async function findLmpByCompanyRole(company: string, role: string) {
  const c = sb();
  const co = trimStr(company);
  const ro = trimStr(role);
  if (!co || !ro) return null;
  const { data } = await c
    .from("lmp_processes")
    .select("id,company,role,status,domain_raw,type,prep_poc,support_poc,outreach_poc,prep_progress,placement_progress,daily_progress,remarks,prep_doc,closing_date,r1_names,r2_names,r3_names,final_converted_numbers,final_converted_names")
    .ilike("company", co)
    .ilike("role", ro)
    .maybeSingle();
  return data;
}

type PendingAction = Record<string, any> & { action: string; _current?: Record<string, any> };

async function snapshotForPending(p: PendingAction): Promise<Record<string, any> | null> {
  const company = trimStr(p.company);
  const role = trimStr(p.role);
  if (!company || !role) return null;
  return await findLmpByCompanyRole(company, role);
}

function summarisePending(p: PendingAction): string {
  const cur = p._current || {};
  const fmtChange = (label: string, was: unknown, to: unknown) =>
    was && String(was) !== String(to)
      ? `${label} from "${was}" to "${to}"`
      : `${label} to "${to}"`;
  const lmp = formatLmpLabel(p.company, p.role);
  switch (p.action) {
    case "create_lmp":
      return `Create new LMP for ${lmp}${p.domain ? ` in ${p.domain}` : ""}${p.prep_poc ? `, prep POC ${p.prep_poc}` : ""}${p.outreach_poc ? `, outreach POC ${p.outreach_poc}` : ""}`;
    case "update_lmp_status":
      return `${fmtChange(`Set ${lmp} status`, cur.status, p.status)}`;
    case "update_lmp_field":
      return `${fmtChange(`Set ${trimStr(p.field)} on ${lmp}`, cur[p.field], p.value)}`;
    case "assign_poc": {
      const isSupport = p.poc_type === "support" || p.poc_type === "secondary";
      const col = isSupport ? "support POC" : p.poc_type === "outreach" ? "outreach POC (display tag)" : "prep POC";
      const colKey = isSupport ? "support_poc" : p.poc_type === "outreach" ? "outreach_poc" : "prep_poc";
      return fmtChange(`Assign ${col} for ${lmp}`, cur[colKey], p.poc_name);
    }
    case "delete_lmp":
      return `Delete LMP ${lmp}`;
    case "update_student_field":
      return `Set ${trimStr(p.field)} to "${p.value}" for student ${trimStr(p.student_name)}`;
    case "log_submission":
      return `Log ${p.candidate || p.candidate_name}'s ${p.round} submission (${p.outcome}) for ${p.company} – ${p.role} on ${p.date || "today"}`;
    default:
      return `Run ${p.action}`;
  }
}

async function runTool(name: string, args: any): Promise<{ result: any; pendingRef?: { pending_action_id: string; summary: string }; block?: any }> {
  if (name === "update_lmp_status") {
    return runTool("prepare_write", {
      action: "update_lmp_status",
      company: args.company,
      role: args.role,
      status: args.status || args.new_status,
    });
  }
  if (name === "assign_poc") {
    return runTool("prepare_write", {
      action: "assign_poc",
      company: args.company,
      role: args.role,
      poc_name: args.poc_name,
      poc_type: args.poc_type || "primary",
    });
  }
  if (name === "log_submission") {
    const validated = validateLogSubmissionArgs(args);
    if (!validated.ok) {
      return { result: { error: validated.error, missing: validated.missing, ask: "Need candidate, company, role, round, outcome, and date." } };
    }
    return runTool("prepare_write", { action: "log_submission", ...validated.normalized, candidate_name: validated.normalized.candidate });
  }
  if (name === "prepare_write") {
    if (voiceBlocksWrites()) {
      return {
        result: { blocked: true, reason: "View-as mode is read-only." },
      };
    }
    const validated = validateVoicePrepareWrite(args as Record<string, unknown>);
    if (!validated.ok) {
      return {
        result: {
          error: validated.error,
          missing: validated.missing,
          ask: validated.ask,
          clarification_needed: true,
        },
      };
    }
    const pending = validated.normalized as PendingAction;
    try {
      const snap = await snapshotForPending(pending);
      if (snap) pending._current = snap;
    } catch (_e) { /* non-fatal */ }
    const summary = summarisePending(pending);
    const vs = voiceRequestState();
    if (!vs.userId) return { result: { error: "Not authenticated" } };
    const { kind, payload } = voiceActionToChatKindPayload(pending);
    const staged = await stagePendingAction({
      userId: vs.userId,
      actorName: vs.actorName,
      role: vs.role,
      kind,
      payload,
      currentSnapshot: pending._current || null,
      proposedSnapshot: payload,
      source: "voice",
    });
    if ("error" in staged) {
      return { result: { error: staged.error } };
    }
    return {
      result: {
        staged: true,
        pending_action_id: staged.id,
        current: pending._current || null,
        summary: summary + ". Should I go ahead?",
      },
      pendingRef: { pending_action_id: staged.id, summary },
      block: { type: "pending_action", action: pending.action, summary },
    };
  }

  const result = await runSharedCopilotTool(name, args);
  return { result, block: voiceBlockForTool(name, result, args) };
}

// ─── HTTP ──────────────────────────────────────────────────────────────────
import { requireAuth } from "../_shared/requireAuth.ts";
import { createLogger } from "../_shared/logger.ts";

async function handleVoiceRequest(req: Request) {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  // Load vault secrets once per cold start so all providers can use them
  await loadVoiceVault();
  const log = createLogger("voice-copilot", req);
  const t0 = performance.now();
  const auth = await requireAuth(req, corsHeaders);
  if ("error" in auth) {
    log.warn("auth_failed", { ms: Math.round(performance.now() - t0) });
    return auth.error;
  }
  const userLog = log.child({ user_id: auth.user.id, role: auth.user.role });
  voiceRequestState().userId = auth.user.id;
  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  try {
    const budget = await reserveAiRequest(auth.user.id, GEMINI_TOOL_FALLBACK_MODELS[0]);
    if (!budget.allowed) {
      return new Response(JSON.stringify({
        spoken: "Your daily AI budget is exhausted. It resets at midnight UTC.",
        error: "AI_DAILY_BUDGET_EXHAUSTED",
        budget,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const body = await req.json();
    const {
      messages = [],
      confirm = null,
      userName: bodyUserName,
      userEmail: bodyUserEmail,
      role: bodyRole,
      viewAsUserName: bodyViewAsUserName,
      viewAsRole: bodyViewAsRole,
    } = body as {
      messages: { role: string; content: string }[];
      confirm?: { pending_action_id?: string } | PendingAction | null;
      userName?: string;
      userEmail?: string;
      role?: string;
      viewAsUserName?: string | null;
      viewAsRole?: string | null;
    };

    const realRole = auth.user.role;
    const realName = bodyUserName?.trim() || "User";
    const realEmail = bodyUserEmail?.trim() || "";
    const viewAsName = (bodyViewAsUserName || "").trim();
    const claimedViewAsRole = (bodyViewAsRole || bodyRole || realRole).trim();
    const isImpersonating = !!viewAsName && viewAsName.toLowerCase() !== realName.toLowerCase();

    const authToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    voiceRequestState().userId = auth.user.id;
    voiceRequestState().authToken = authToken;
    voiceRequestState().role = realRole;
    voiceRequestState().actorName = realName;
    voiceRequestState().isImpersonating = isImpersonating;
    voiceRequestState().viewAs = { impersonating: isImpersonating, name: isImpersonating ? viewAsName : null };

    let effectiveName = realName;
    let effectiveRole = realRole;
    if (isImpersonating) {
      const resolved = await resolveViewAsEffectiveRole(viewAsName, claimedViewAsRole, realRole);
      effectiveRole = resolved.effectiveRole;
      effectiveName = viewAsName;
      if (resolved.downgraded) {
        userLog.warn("view_as_role_downgraded", {
          claimed: claimedViewAsRole,
          resolved: resolved.resolvedRole,
          effective: effectiveRole,
          real_role: realRole,
        });
      }
    }
    voiceRequestState().effectiveName = effectiveName;
    voiceRequestState().effectiveRole = effectiveRole;

    const confirmId = confirm && typeof confirm === "object"
      ? String((confirm as { pending_action_id?: string }).pending_action_id || "").trim()
      : "";
    if (confirmId) {
      if (voiceBlocksWrites()) {
        return new Response(JSON.stringify({
          spoken: "View-as mode is read-only. Switch back to your own perspective to make changes.",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      userLog.event("confirm_execute", { pending_action_id: confirmId });
      const raw = await runSharedCopilotTool("execute_pending", { pending_action_id: confirmId });
      const parsed = raw as { error?: string; executed?: boolean; result?: Record<string, unknown> };
      const ok = parsed.executed !== false && !parsed.error && parsed.result?.error == null;
      userLog.event("confirm_result", { ok, error: parsed.error, ms: Math.round(performance.now() - t0) });
      const spoken = ok
        ? "Done."
        : `Couldn't do that — ${parsed.error || (parsed.result as { error?: string })?.error || "unknown error"}.`;
      return new Response(JSON.stringify({ spoken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (confirm && typeof confirm === "object" && (confirm as PendingAction).action) {
      return new Response(JSON.stringify({
        spoken: "That confirmation expired. Please ask me to make the change again.",
        error: true,
        code: "LEGACY_CONFIRM_REJECTED",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Load POC roster + aliases for STT name normalisation (no hardcoded people).
    let rosterBlock = "";
    let nameNormBlock = "";
    try {
      const sbc = sb();
      const { data: pocs } = await sbc
        .from("poc_profiles")
        .select("name,role_type,primary_domain,aliases")
        .neq("role_type", "outreach_poc")
        .eq("status", "active")
        .limit(40);
      if (pocs && pocs.length > 0) {
        rosterBlock = buildVoicePocRosterBlock(pocs as { name: string | null; aliases: string[] | null; primary_domain: string | null; role_type?: string | null }[]);
        nameNormBlock = buildVoiceNameNormalizationBlock(pocs as { name: string | null; aliases: string[] | null; primary_domain: string | null; role_type?: string | null }[]);
      }
    } catch { /* non-fatal */ }

    const identityBlock = `\n\nCURRENT USER\n- Name: ${realName}\n- Email: ${realEmail || "(unknown)"}\n- Real role: ${realRole}\n${
      isImpersonating
        ? `- Viewing as: ${viewAsName} (${effectiveRole})\n- When the user says "me", "my", "I", "mine", "today's", resolve reads to ${viewAsName}. Scope reads to ${viewAsName}'s LMPs/candidates. Writes still use the authenticated user's real role (${realRole}) and backend ownership rules.`
        : `- The user is acting as themselves. "me", "my", "I" resolve to ${realName}.`
    }${effectiveRole === "poc" ? `\n- Effective role is POC — scope LMP listings, search, and workload to ${effectiveName}'s assignments unless the user explicitly says "all" / "everyone" / "org-wide" / another named POC.` : ""}`;

    const sysPrompt = SYSTEM_PROMPT + identityBlock + nameNormBlock + rosterBlock;

    // Multi-round agent loop
    const convo: any[] = [{ role: "system", content: sysPrompt }, ...messages];
    let pendingRef: { pending_action_id: string; summary: string } | null = null;
    let lastSpoken = "";
    const responseBlocks: any[] = [];

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    if (isMentorCoverageQuery(lastUser)) {
      const scope = { effectiveRole, effectiveName };
      const result = await fetchMentorCoverageFastPath(scope);
      if (result.ok) {
        const { spoken, blocks } = formatMentorCoverageVoice(result);
        return new Response(JSON.stringify({ spoken, blocks }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userLog.warn("mentor_coverage_fast_path_failed", { error: result.error });
    }
    if (isPocWorkloadQuery(lastUser)) {
      const scope = { effectiveRole, effectiveName };
      const result = await fetchPocWorkloadFastPath(scope);
      if (result.ok) {
        const { spoken, blocks } = formatPocWorkloadVoice(result);
        return new Response(JSON.stringify({ spoken, blocks }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userLog.warn("poc_workload_fast_path_failed", { error: result.error });
    }
    const FORCE = /\b(how many|count|list|show|all|total|create|add|assign|update|change|set|delete|remove|status|conversion|workload|domain|ongoing|tell me|find|who|what|recommend|progress|performance|how is|how's|how are|update on|status of|doing|load|active|working on|my|me|mine|today)\b/i;
    let forceFirst = FORCE.test(lastUser);
    userLog.event("turn_start", {
      utterance: lastUser.slice(0, 200),
      messages_in: messages.length,
      force_first: forceFirst,
      real_role: realRole,
      effective_role: effectiveRole,
      view_as: isImpersonating ? viewAsName : null,
    });

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const forced = round === 0 && forceFirst;
      const tRound = performance.now();
      const resp = await voiceCallModel(convo, forced);
      const choice = resp.choices?.[0]?.message;
      const toolCalls = choice?.tool_calls || [];
      const content = (choice?.content || "").trim();
      userLog.event("ai_round", {
        round,
        forced,
        tool_calls: toolCalls.length,
        tool_names: toolCalls.map((t: any) => t.function?.name),
        content_len: content.length,
        ms: Math.round(performance.now() - tRound),
      });

      if (!toolCalls.length) {
        if (!content && round === 0 && !forceFirst) {
          userLog.warn("empty_response_retry", { round });
          forceFirst = true;
          continue;
        }
        lastSpoken = content;
        break;
      }

      convo.push(choice);

      for (const tc of toolCalls) {
        const name = tc.function?.name;
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* noop */ }
        const tTool = performance.now();
        try {
          const { result, pendingRef: stagedRef, block } = await runTool(name, args);
          if (stagedRef) pendingRef = stagedRef;
          if (block) responseBlocks.push(block);
          userLog.event("tool_result", {
            round,
            tool: name,
            args,
            ms: Math.round(performance.now() - tTool),
            ok: !(result as any)?.error,
            error: (result as any)?.error,
          });
          convo.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        } catch (e) {
          userLog.error("tool_failed", e, { tool: name, args, round });
          convo.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ error: (e as Error).message }),
          });
        }
      }

      if (pendingRef) continue;
    }

    if (!lastSpoken) {
      lastSpoken = pendingRef
        ? pendingRef.summary + ". Should I go ahead?"
        : "I couldn't find an answer for that — try asking about a specific POC, LMP, or domain.";
    }

    userLog.event("turn_done", {
      spoken_len: lastSpoken.length,
      pending: !!pendingRef,
      pending_action_id: pendingRef?.pending_action_id,
      ms: Math.round(performance.now() - t0),
    });

    return new Response(JSON.stringify({
      spoken: lastSpoken,
      pendingAction: pendingRef ? { pending_action_id: pendingRef.pending_action_id } : null,
      blocks: responseBlocks,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const errMsg = (err as Error).message ?? "unknown error";
    userLog.error("turn_failed", err, { ms: Math.round(performance.now() - t0) });
    const isProviderErr = /unavailable|provider|timeout|network|quota|exhausted/i.test(errMsg);
    return new Response(
      JSON.stringify({
        spoken: isProviderErr
          ? "AI services are temporarily unavailable. Please try again in a moment."
          : "Sorry, something went wrong. Please try again.",
        error: true,
        code: isProviderErr ? "ALL_AI_PROVIDERS_UNAVAILABLE" : "VOICE_INTERNAL_ERROR",
        message: errMsg,
      }),
      { status: isProviderErr ? 503 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

Deno.serve((req: Request) =>
  voiceRequestStateStorage.run(
    {
      viewAs: { impersonating: false, name: null },
      userId: null,
      effectiveName: "User",
      effectiveRole: "poc",
      authToken: "",
      role: "poc",
      actorName: "User",
      isImpersonating: false,
    },
    () => handleVoiceRequest(req),
  )
);
