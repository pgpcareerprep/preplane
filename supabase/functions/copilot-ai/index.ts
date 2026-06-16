import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AsyncLocalStorage } from "node:async_hooks";
import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import {
  classifyIntent,
  getGreetingResponse,
  getHelpResponse,
  buildPlainSseResponse,
} from "./intentRouter.ts";
import {
  GEMINI_TOOL_MODEL,
  GEMINI_ANALYSIS_MODEL,
  GEMINI_TOOL_FALLBACK_MODELS,
  GEMINI_SYNTHESIS_MODELS,
  OPENROUTER_TOOL_MODEL,
  OPENROUTER_SYNTHESIS_MODELS,
  GROK_TOOL_MODEL,
  GROK_SYNTHESIS_MODELS,
  getTaskTier,
} from "./modelConfig.ts";
import { isCircuitOpen, recordSuccess, recordFailure } from "../_shared/circuitBreaker.ts";
import { validateResponse as validateAiResponse } from "../_shared/responseValidator.ts";
import { checkPermission } from "../_shared/rbac.ts";
import { POC_WRITABLE_LMP_COLUMNS } from "../_shared/permissionContract.ts";
import { isConversionCountQuery, isMentorCoverageQuery, isPocWorkloadQuery, shouldPrefetchRag } from "../_shared/copilotFastPaths.ts";
import { DEFAULT_APP_ORIGIN, getAppOrigin } from "../_shared/appConfig.ts";

// corsHeaders is set dynamically per-request via buildCorsHeaders(req) at handler entry.
// This module-level object is mutated in-place so all existing response sites keep working.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Vary": "Origin",
};

const GEMINI_DIRECT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent";

// Grok/xAI — middle fallback (api.x.ai, GROK_API_KEY)
const GROK_URL = "https://api.x.ai/v1/chat/completions";

// Resolved per-request in the handler; module-load defaults are overwritten each request.
let AI_GATEWAY_URL = GEMINI_DIRECT_URL;
let TOOL_MODEL = GEMINI_TOOL_MODEL;
let TOOL_FALLBACK_MODELS: string[] = [...GEMINI_TOOL_FALLBACK_MODELS];
const SYNTHESIS_MODELS: string[] = [...GEMINI_SYNTHESIS_MODELS];
let AI_EXTRA_HEADERS: Record<string, string> = {};
let AI_KEY_FOR_CHAT = ""; // set in handler after env is available

/** Try each model in SYNTHESIS_MODELS until one succeeds.
 *  Logs provider/model/status/body for every failure.
 *  Retries same model once on 429; all other errors immediately try next model. */
// Retryable status codes — try next model/provider on these
const RETRYABLE_HTTP = new Set([408, 429, 500, 502, 503, 504]);

async function callSynthesis(
  _key: string, // kept for signature compat; actual key comes from AI_KEY_FOR_CHAT
  body: Record<string, unknown>,
  timeoutMs = 20_000,
): Promise<{ resp: Response; model: string }> {
  const key = AI_KEY_FOR_CHAT;
  const provider = AI_GATEWAY_URL.includes("openrouter") ? "OpenRouter"
    : AI_GATEWAY_URL.includes("x.ai") ? "Grok" : "Gemini";

  // Skip if circuit is open for this provider
  if (isCircuitOpen(provider)) {
    throw new Error(`${provider} circuit is open (too many recent failures). Automatic fallback in progress.`);
  }

  let lastFailMsg = `${provider}: all synthesis models exhausted`;

  for (const model of SYNTHESIS_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let resp: Response;
      try {
        resp = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...AI_EXTRA_HEADERS },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({ ...body, model }),
        });
      } catch (e) {
        const n = (e as { name?: string })?.name ?? "";
        if (n === "TimeoutError" || n === "AbortError") throw e;
        lastFailMsg = `${provider}/${model} network error: ${(e as Error).message}`;
        console.warn(`[synthesis] ${lastFailMsg}`);
        recordFailure(provider);
        break; // network error → try next model
      }

      if (resp.ok) {
        recordSuccess(provider);
        return { resp, model };
      }

      // Log exact failure: provider, model, HTTP status, body excerpt (no key)
      const errBody = await resp.text().catch(() => "");
      lastFailMsg = `${provider}/${model} ${resp.status}: ${errBody.slice(0, 300)}`;
      console.warn(`[synthesis] ${lastFailMsg}`);

      if (RETRYABLE_HTTP.has(resp.status)) {
        recordFailure(provider);
        if (resp.status === 429 && attempt === 0) {
          console.warn(`[synthesis] ${provider}/${model} 429 — waiting 2s then retrying once`);
          await new Promise((r) => setTimeout(r, 2000));
          continue; // retry same model once
        }
      }
      break; // non-retryable or second attempt → try next model
    }
  }
  console.error(`[synthesis] exhausted all configured models: ${lastFailMsg}`);
  throw new Error("AI gateway is temporarily unavailable after trying all configured models. Please retry in a moment.");
}

type SupabaseLike = ReturnType<typeof createClient>;

// ─── Vault / Edge-Function secret reader ─────────────────────────────────────
// Deno.env.get() reads Edge Function secrets (set via `supabase secrets set`).
// If a secret lives in Supabase Vault (set via Dashboard > Vault) it is NOT
// accessible via Deno.env.get(). ensureVaultLoaded() fetches Vault secrets once
// per cold start so getEnv() covers both paths transparently.
const _vault: Map<string, string> = new Map();
let _vaultLoaded = false;

async function ensureVaultLoaded(): Promise<void> {
  if (_vaultLoaded) return;
  _vaultLoaded = true;
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vaultSb = createClient(sbUrl, sbKey, {
      db: { schema: "vault" },
      auth: { persistSession: false },
    });
    const { data, error } = await (vaultSb as SupabaseLike)
      .from("decrypted_secrets")
      .select("name,decrypted_secret");
    if (error) {
      console.warn("[copilot-ai] vault query error (non-fatal):", error.message);
      return;
    }
    for (const row of (data ?? []) as Array<{ name: string; decrypted_secret: string }>) {
      if (row.name && row.decrypted_secret) {
        _vault.set(row.name, row.decrypted_secret.trim());
      }
    }
    console.log(`[copilot-ai] vault loaded ${_vault.size} secrets`);
  } catch (e) {
    console.warn("[copilot-ai] vault load skipped (non-fatal):", (e as Error).message);
  }
}

function getEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || _vault.get(name) || undefined;
}
// ─────────────────────────────────────────────────────────────────────────────

// Embed user query with Gemini text-embedding-004 then call rag_search RPC.
// Returns a system-prompt-ready block; empty string on any failure (non-fatal).
async function retrieveRAGContext(
  userMessage: string,
  sb: SupabaseLike,
  filterTables?: string[] | null,
  opts?: { limit?: number; threshold?: number; userId?: string | null },
): Promise<string> {
  try {
    const key = getEnv("GEMINI_API_KEY");
    if (!key || !userMessage || !userMessage.trim()) return "";
    const limit = opts?.limit ?? 6;
    const threshold = opts?.threshold ?? 0.68;
    // ACL: pass requesting_user_id so copilot_messages are scoped to the caller.
    const requestingUserId = opts?.userId ?? null;

    const embedRes = await fetch(`${EMBED_URL}?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        content: { parts: [{ text: userMessage.slice(0, 2000) }] },
        taskType: "RETRIEVAL_QUERY",
      }),
    });
    if (!embedRes.ok) return "";
    const embedData = await embedRes.json();
    const queryEmbedding = embedData?.embedding?.values as number[] | undefined;
    if (!queryEmbedding) return "";

    const { data: results } = await sb.rpc("rag_search", {
      query_embedding: JSON.stringify(queryEmbedding),
      match_threshold: threshold,
      match_count: limit,
      filter_tables: filterTables ?? null,
      requesting_user_id: requestingUserId,
    });

    const rows = (results ?? []) as Array<{ source_table: string; content: string; similarity: number }>;
    if (!rows.length) return "";

    const contextBlocks = rows
      .map((r, i) => `[${i + 1}] Source: ${r.source_table} (similarity: ${(r.similarity * 100).toFixed(0)}%)\n${r.content}`)
      .join("\n\n---\n\n");

    return `\n\n## SEMANTICALLY RELEVANT RECORDS FROM DATABASE\nThe following records were retrieved by vector similarity to the user's message. Use them as grounding context — cite specifics, do NOT invent details not present here.\n\n${contextBlocks}\n\n---\n`;
  } catch (e) {
    console.warn("RAG retrieval failed (non-fatal):", e);
    return "";
  }
}

// ─── Response cache helpers ────────────────────────────────────────────
// Backed by the public.copilot_cache table. Only non-write, non-streaming-
// tool-call responses are cached. The cache key is a sha256 of the last user
// message + mode + lmpId + snapshot so identical questions on identical data
// reuse the previous answer.

const ANALYTICAL_TTL = 300;            // 5 min
const ACTION_TTL = 60;                 // 1 min for borderline cases
const WRITE_TOOL_PREFIXES = ["update_", "assign_", "create_", "delete_", "remove_", "set_", "prepare_", "execute_"];

function isWriteTool(name: string): boolean {
  // Planner bookkeeping tools are not real writes.
  if (name === "make_plan" || name === "update_plan_step") return false;
  return WRITE_TOOL_PREFIXES.some((p) => name.startsWith(p));
}

// Deterministic JSON stringify (sorted keys) so per-turn tool memo keys
// match across re-issued calls regardless of property order.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function buildCacheKey(
  messages: { role: string; content?: string }[],
  mode: string,
  lmpId: string | undefined,
  snapshot: string | undefined,
): Promise<string> {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const payload = JSON.stringify({
    q: (lastUser?.content || "").trim(),
    mode,
    lmpId: lmpId || "",
    snapshot: snapshot || "",
  });
  return await sha256Hex(payload);
}

function getCacheClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function readCache(key: string): Promise<{ text: string } | null> {
  try {
    const sb = getCacheClient();
    const { data, error } = await sb
      .from("copilot_cache")
      .select("response, created_at, ttl_seconds")
      .eq("cache_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const ageSec = (Date.now() - new Date(data.created_at).getTime()) / 1000;
    if (ageSec > (data.ttl_seconds ?? ANALYTICAL_TTL)) {
      // Lazy prune.
      void sb.from("copilot_cache").delete().eq("cache_key", key);
      return null;
    }
    const resp = data.response as { text?: string } | null;
    if (!resp?.text) return null;
    return { text: resp.text };
  } catch (err) {
    console.warn("cache read error", err);
    return null;
  }
}

async function writeCache(key: string, text: string, ttl: number): Promise<void> {
  try {
    const sb = getCacheClient();
    await sb.from("copilot_cache").upsert({
      cache_key: key,
      response: { text },
      created_at: new Date().toISOString(),
      ttl_seconds: ttl,
    });
  } catch (err) {
    console.warn("cache write error", err);
  }
}

function replayCachedSse(text: string): Response {
  const sseBody =
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }], cached: true })}\n\n` +
    `data: [DONE]\n\n`;
  return new Response(sseBody, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "X-Copilot-Cache": "hit",
    },
  });
}

/**
 * Wraps an SSE response body, copies it through to the client, and resolves
 * the assembled assistant text once the stream finishes — for caching.
 */
function teeSseForCache(
  upstream: ReadableStream<Uint8Array>,
  onComplete: (fullText: string) => void,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let assembled = "";
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by blank lines.
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const ev of events) {
            const line = ev.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const data = line.slice(5).trim();
            if (!data || data === "[DONE]") continue;
            try {
              const json = JSON.parse(data);
              const delta = json?.choices?.[0]?.delta?.content;
              if (typeof delta === "string") assembled += delta;
            } catch {
              /* swallow; not all chunks are JSON */
            }
          }
        }
        controller.close();
        onComplete(assembled);
      } catch (err) {
        controller.error(err);
      }
    },
  });
}


// ── Tool Definitions ──

const TOOLS = [
  {
    type: "function",
    function: {
      name: "rag_search",
      description: "Semantic vector search across all embedded database records using natural language. Use when (1) user asks for 'similar' processes/students/mentors, (2) looking for precedents or past examples, (3) the query is descriptive rather than exact (e.g. 'finance roles needing strong modeling'), (4) recalling past copilot conversations, (5) you cannot locate records via exact SQL filters. Returns top matches ranked by semantic similarity. Prefer SQL tools when the user gives exact field values.",
      parameters: {
        type: "object",
        required: ["query"],
        properties: {
          query: { type: "string", description: "Natural language description of what to find. Be specific and descriptive." },
          tables: {
            type: "array",
            items: { type: "string" },
            description: "Optional table filter. One or more of: lmp_processes, students, poc_profiles, mentors, alumni_records, lmp_daily_logs, copilot_messages. Omit to search all.",
          },
          limit: { type: "integer", description: "Max results to return. Default 6, max 12.", default: 6 },
          threshold: { type: "number", description: "Cosine similarity threshold 0–1. Default 0.68. Lower = more results but less relevant.", default: 0.68 },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lmp_records",
      description: "Search and filter LMP processes by company, role, domain, status, POC name, type, OR recency of updates. Returns matching records with all fields including 'Last Updated' (ISO timestamp). Use updated_within_days=7 for queries like 'processes updated in the last 7 days', or updated_since='2026-05-18' for an explicit cutoff. ALWAYS call this tool — never describe what you're going to search; just call it.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Filter by company name (partial match)" },
          role: { type: "string", description: "Filter by role title (partial match)" },
          domain: { type: "string", description: "Filter by domain (e.g. Finance, PM, Data, Marketing, Sales, Consulting, FOCOS, HR, Supply Chain)" },
          status: { type: "string", description: "Filter by status: Ongoing, Dormant, On Hold, Converted, Not Converted, Offer Received, Closed" },
          mentor_aligned: { type: "boolean", description: "Filter by whether a mentor is aligned. Use false for ongoing processes missing mentor alignment." },
          poc: { type: "string", description: "Filter by POC name (Prep POC or Outreach POC, partial match)" },
          type: { type: "string", description: "Filter by type: Full Time, Internship, Live Project, Case Competition" },
          updated_within_days: { type: "number", description: "Only include records whose Last Updated timestamp is within the last N days (e.g. 7 for 'last week', 1 for 'today', 30 for 'last month')." },
          updated_since: { type: "string", description: "ISO date/timestamp — only include records updated on or after this moment. Overrides updated_within_days if both provided." },
          sort: { type: "string", enum: ["recent", "oldest_activity"], description: "Sort by Last Updated. 'recent' = most recently updated first; 'oldest_activity' = stalest first." },
          limit: { type: "number", description: "Max records to return (default 200, use a higher number or 0 to get all)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_profile",
      description: "Look up a student from the Mastersheet by name or roll number. Returns their scores (mock, resume, practicum, behavioral, composite), domains, mentors, placement status, risk flags, and all available data.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Student name (partial match)" },
          roll_no: { type: "string", description: "Roll number" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_students",
      description: "Search the Mastersheet for students matching criteria. Use to find students by domain, placement status, score ranges, mentor, or risk flag.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Student name (partial match)" },
          domain: { type: "string", description: "Primary or secondary domain" },
          placement_status: { type: "string", description: "Final placement status filter" },
          mentor: { type: "string", description: "Mentor name (partial match)" },
          risk_flag: { type: "string", description: "Interview risk flag value" },
          min_composite: { type: "number", description: "Minimum composite (primary) score" },
          limit: { type: "number", description: "Max results (default 100, use a higher number or 0 to get all)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_sessions",
      description: "Search the sessions table — mentor/POC sessions logged against an LMP. Filter by lmp_id, mentor name, attendee/student, status (scheduled/completed/cancelled/no_show), or date range. Returns sessions with scheduled_at, duration, notes, and outcome.",
      parameters: {
        type: "object",
        properties: {
          lmp_id: { type: "string", description: "LMP process UUID to scope sessions to one process" },
          mentor: { type: "string", description: "Mentor name (partial match)" },
          attendee: { type: "string", description: "Student/attendee name (partial match)" },
          status: { type: "string", enum: ["scheduled", "completed", "cancelled", "no_show"], description: "Session status" },
          since: { type: "string", description: "ISO date — only sessions scheduled on/after this date" },
          until: { type: "string", description: "ISO date — only sessions scheduled on/before this date" },
          limit: { type: "number", description: "Max sessions to return (default 50)" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lmp_status",
      description: "Update the status of an LMP process. Identifies the record by company+role. Valid statuses: Ongoing, Dormant, On Hold, Converted, Not Converted, Offer Received, Closed.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name (exact match)" },
          role: { type: "string", description: "Role title (exact match)" },
          status: { type: "string", enum: ["Ongoing", "Dormant", "On Hold", "Converted", "Not Converted", "Offer Received", "Closed"], description: "New status" },
        },
        required: ["company", "role", "status"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_lmp_field",
      description: "Update any field(s) on an LMP process record. Use for prep progress, stage, type, closing date, prep doc, daily progress, R1/R2/R3 shortlisted, final convert, convert names, etc.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name to identify the record" },
          role: { type: "string", description: "Role title to identify the record" },
          fields: {
            type: "object",
            description: "Key-value pairs of fields to update. Keys should match sheet column names like: Status, Type, Domain, Prep Progress, Placement Progress, Prep Doc, Daily Progress, R1 Shortlisted, R2 Shortlisted, R3 Shortlisted, Final Convert, Convert Name(s), Closing Date",
            additionalProperties: { type: "string" },
          },
        },
        required: ["company", "role", "fields"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "assign_poc",
      description: "Assign or reassign a POC (Point of Contact) to an LMP process. Supports Primary POC (domain prep), Secondary POC (behavioral prep), and Outreach POC (placement coordinator).",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          role: { type: "string", description: "Role title" },
          poc_name: { type: "string", description: "Name of the POC to assign" },
          poc_type: { type: "string", enum: ["primary", "secondary", "outreach"], description: "Whether this is a Primary POC (domain prep), Secondary POC (behavioral prep), or Outreach POC assignment" },
        },
        required: ["company", "role", "poc_name", "poc_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_lmp_record",
      description: "Create a new LMP process record in the tracker. Requires at minimum company and role.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          domain: { type: "string" },
          type: { type: "string", description: "Full Time, Internship, Live Project, or Case Competition" },
          status: { type: "string", description: "Initial status (default: Ongoing)" },
          prep_poc: { type: "string", description: "Prep POC name" },
          outreach_poc: { type: "string", description: "Outreach POC name" },
        },
        required: ["company", "role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_lmp_record",
      description: "Soft-delete an LMP process record (marks it as deleted, doesn't remove from sheet).",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          role: { type: "string", description: "Role title" },
        },
        required: ["company", "role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_update",
      description: "Update multiple LMP records at once. Provide a list of updates, each with company+role identifier and the fields to change. Use for batch status changes, bulk POC reassignment, etc.",
      parameters: {
        type: "object",
        properties: {
          updates: {
            type: "array",
            items: {
              type: "object",
              properties: {
                company: { type: "string" },
                role: { type: "string" },
                fields: { type: "object", additionalProperties: { type: "string" } },
              },
              required: ["company", "role", "fields"],
            },
            description: "List of records to update with their new field values",
          },
        },
        required: ["updates"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Compute analytics from the LMP data. Returns counts, breakdowns, conversion rates, POC workload, domain distribution, status distribution, age tracking, and other aggregated metrics.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: [
              "status_distribution", "domain_distribution", "poc_workload",
              "conversion_rate", "type_distribution", "age_tracking",
              "overview", "pipeline_summary",
            ],
            description: "Which metric to compute",
          },
          domain: { type: "string", description: "Optional domain filter" },
          poc: { type: "string", description: "Optional POC filter" },
        },
        required: ["metric"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "smart_search",
      description:
        "Semantic retrieval-augmented search across LMP processes and the student database. Takes a free-text query, expands it into semantically related keywords using AI, then searches across ALL fields of every LMP record and every student row. Returns the most relevant rows ranked by combined keyword + semantic similarity score. Each result includes the source ('lmp' or 'students'), the matched columns, and the full record. Use this when the user's question doesn't map neatly to structured filters, or when you need to find rows matching a natural-language phrase across multiple fields. After calling smart_search, ALWAYS present the top results in a table block with sortable columns.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Free-text search query (e.g. 'finance internship with Radhika that got converted')",
          },
          sources: {
            type: "array",
            items: { type: "string", enum: ["lmp", "students"] },
            description:
              "Which datasets to search. Defaults to ['lmp', 'students'].",
          },
          limit: {
            type: "number",
            description: "Max results to return (default 15)",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recommend_pocs",
      description: "Run the AI-powered POC allocation engine to recommend the best Primary, Secondary, and Outreach POCs for an LMP process. Returns scored recommendations with breakdowns.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string", description: "Company name" },
          role: { type: "string", description: "Role title" },
          domain: { type: "string", description: "Process domain (e.g. Finance, PM, Data, Engineering)" },
        },
        required: ["company", "role", "domain"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_activity",
      description: "Log an operational action to the activity audit trail. Call this after every write operation (status update, POC assignment, bulk update, etc.).",
      parameters: {
        type: "object",
        properties: {
          actor_name: { type: "string", description: "Who performed the action" },
          poc_role_type: { type: "string", enum: ["primary", "secondary", "outreach", "system", "admin"], description: "Role type of the actor" },
          entity_type: { type: "string", description: "Type of entity affected (lmp, student, poc)" },
          entity_id: { type: "string", description: "Identifier of the entity" },
          action: { type: "string", description: "What was done" },
          previous_value: { type: "string", description: "Value before change" },
          new_value: { type: "string", description: "Value after change" },
        },
        required: ["actor_name", "action", "entity_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_lmp_context",
      description: "Before running mentor matching for an LMP process, verify whether a Job Description (JD) or sufficient skill context is attached. Use this whenever the user asks to find/match/recommend mentors for a specific LMP. Optionally pass `use_last_jd: true` (with company) to reuse the JD/prep_doc from the most recent process for that company. Returns { hasJd, jdSummary, missingFields, lmp }.",
      parameters: {
        type: "object",
        properties: {
          lmp_id: { type: "string", description: "UUID of the LMP process to check" },
          company: { type: "string", description: "Company name (used when lmp_id is unknown, or with use_last_jd)" },
          role: { type: "string", description: "Role title (helps narrow down when company has multiple processes)" },
          use_last_jd: { type: "boolean", description: "If true, reuse the most recent prior LMP process's JD/prep_doc for the same company" },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_entities",
      description: "List ALL entities of a given type from the database. Use this when the user asks to 'show all POCs', 'list all mentors', 'how many students', 'show all alumni', or any similar enumeration query. Do NOT use resolve_entity for these — resolve_entity is for name lookup only and is capped at 6–20 results. list_entities returns the complete set with no artificial limit. Supported types: poc, student, mentor, alumni.",
      parameters: {
        type: "object",
        properties: {
          entity_type: {
            type: "string",
            enum: ["poc", "student", "mentor", "alumni"],
            description: "Which entity type to list",
          },
          domain: { type: "string", description: "Optional domain filter" },
          limit: { type: "number", description: "Max rows to return (default 200, use 0 for all)" },
        },
        required: ["entity_type"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_entity",
      description: "Resolve an ambiguous name (e.g. 'Sonali', 'Google PM', 'Radhika') to a concrete entity in the platform. Always call this FIRST when the user mentions a person, company, or LMP process by name and you need to act on or describe it. Returns { resolution_status: 'single_match' | 'multiple_matches' | 'no_match', selected_entity?, matches[], reasoning }. Use preferred_scope to bias the search when the user has selected a scope (student, poc, mentor, alumni, lmp, company, domain).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The name or phrase to resolve" },
          preferred_scope: {
            type: "string",
            enum: ["global", "student", "poc", "mentor", "alumni", "lmp", "company", "domain", "status"],
            description: "Bias the resolver toward this entity type. Use 'global' (or omit) when the user has not chosen a scope.",
          },
          limit: { type: "number", description: "Max matches to return (default 6)" },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_permission",
      description: "Check whether the CURRENT user (their role is server-side) is allowed to perform a given write action BEFORE you call any state-changing tool or render a confirmation-card. If allowed=false, you MUST emit a `permission-denied-card` block (using the returned reason + safe_alternative) and STOP — do NOT attempt the action. Read-only flows do not need this check.",
      parameters: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: [
              "create_lmp", "edit_lmp", "delete_lmp",
              "assign_poc", "reassign_poc",
              "change_status", "change_domain",
              "edit_remarks", "edit_daily_progress",
              "upload_jd", "assign_mentor", "bulk_update",
            ],
            description: "The write action you are about to perform.",
          },
          target_summary: {
            type: "string",
            description: "Short human description of the target (e.g. 'LMP Google · PM Intern'). Optional, included in the denial card.",
          },
        },
        required: ["action"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "prepare_write",
      description: "MANDATORY second step (after `check_permission` allowed=true) before EVERY write. Stages the pending change, snapshots current values from the live sheet, validates RBAC again server-side, and returns a `pending_action_id` (TTL 10 minutes). You MUST then render a `confirmation-card` block that includes the returned `pending_action_id`, `current`, `proposed`, and `sync_impact`. Do NOT call the underlying write tool directly — only `execute_pending` (after the user confirms) is allowed to mutate state.",
      parameters: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: ["update_lmp_status","update_lmp_field","assign_poc","add_lmp_record","delete_lmp_record","bulk_update"],
            description: "Which underlying write action this prepares.",
          },
          payload: {
            type: "object",
            description: "Exact arguments that would be passed to the underlying write tool. Will be replayed verbatim by execute_pending.",
            additionalProperties: true,
          },
          target_summary: { type: "string", description: "Short label for the target (e.g. 'Google · PM Intern')." },
          sync_impact: { type: "string", description: "One-line description of side-effects (sheets, activity log, downstream)." },
        },
        required: ["kind", "payload"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_pending",
      description: "Execute a previously prepared write action AFTER the user clicks Confirm on the confirmation-card. Stateless: replays the underlying write tool with the same kind+payload returned by prepare_write, re-validates RBAC, and writes an activity-log row. Call this when the most recent user message is `Execute pending action <id>`. Pass back the same `kind` and `payload` you received from prepare_write. After success, render a brief `activity-feed` block.",
      parameters: {
        type: "object",
        properties: {
          pending_action_id: { type: "string", description: "UUID returned by prepare_write (used only for activity-log correlation)." },
          kind: { type: "string", description: "Same `kind` returned by prepare_write." },
          payload: { type: "object", description: "Same `payload` returned by prepare_write — replayed verbatim." },
          current_snapshot: { type: "object", description: "Optional: `current` snapshot from prepare_write for the activity log." },
          proposed_snapshot: { type: "object", description: "Optional: `proposed` snapshot from prepare_write for the activity log." },
        },
        required: ["pending_action_id", "kind", "payload"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "parse_jd",
      description: "Parse a Job Description (raw text or URL) into structured data (role, company, domain, seniority, required/preferred skills, responsibilities, qualifications, summary, confidence). Use this whenever the user pastes a JD, shares a JD link, or asks to 'add this JD' / 'extract from this JD' / 'use this JD for matching'. AFTER calling, render a `jd-summary-card` block with the parsed data so the user can confirm. If the user wants to find mentors, set `next_action_label: \"Find mentors for this JD\"` and `next_action_command: \"Find mentors for <Company> · <Role> using parsed JD\"`. Read-only; does NOT need check_permission.",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "Raw JD text (preferred when available)." },
          url: { type: "string", description: "URL to fetch JD content from (used if text is empty)." },
          company: { type: "string", description: "Company hint (helps the parser when text is sparse)." },
          role: { type: "string", description: "Role hint (helps the parser when text is sparse)." },
          domain: { type: "string", description: "Domain hint (e.g. 'Product', 'Data', 'Marketing')." },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_mentors_for_jd",
      description: "Find and rank mentors that fit a given JD / role context. Use this AFTER `check_lmp_context` returns hasJd=true OR after `parse_jd` returns parsed JD data. Returns a ranked shortlist (top N) with score breakdown. After calling, render a `mentor-shortlist-card` block. If the user then clicks Assign on a row, follow the standard `check_permission → prepare_write (kind=assign_mentor or appropriate) → execute_pending` flow. Read-only; does NOT need check_permission.",
      parameters: {
        type: "object",
        properties: {
          role: { type: "string", description: "Target role (e.g. 'Product Manager Intern')." },
          company: { type: "string", description: "Target company." },
          domain: { type: "string", description: "Functional domain / industry hint." },
          required_skills: { type: "array", items: { type: "string" }, description: "Required skills extracted from JD." },
          preferred_skills: { type: "array", items: { type: "string" }, description: "Preferred / nice-to-have skills." },
          seniority: { type: "string", description: "JD seniority (Intern/Junior/Mid/Senior/Lead/Director/VP)." },
          sources: { type: "array", items: { type: "string", enum: ["MU","ALU","EXT"] }, description: "Mentor pools to search. Defaults to all three." },
          limit: { type: "number", description: "Max mentors to return (default 6, max 12)." },
        },
        required: ["role"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_mentors_for_lmp",
      description: "Find and rank mentors for a specific LMP process by id. Hydrates role/company/domain/skills/seniority directly from the LMP record (lmp_processes), then ranks mentors from mentors_union_view (MU + ALU mirror + EXT). Use this when the user asks 'find mentors for this LMP', 'recommend mentors for <company> · <role>' AFTER you've resolved the LMP id, or any time the JD context lives on the LMP record itself. If the LMP has no JD context, returns an error asking the user to run parse_jd first. Read-only; does NOT need check_permission. Render results as a `mentor-shortlist-card` with assign_action_template just like find_mentors_for_jd.",
      parameters: {
        type: "object",
        properties: {
          lmp_id: { type: "string", description: "UUID of the LMP process. Use resolve_entity first if you only have a name." },
          sources: { type: "array", items: { type: "string", enum: ["MU","ALU","EXT"] }, description: "Mentor pools to search. Defaults to all three." },
          limit: { type: "number", description: "Max mentors to return (default 6, max 12)." },
        },
        required: ["lmp_id"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "make_plan",
      description: "Create a multi-step execution plan for a complex user request. Call this FIRST (before other tools) when the request requires 2+ distinct operations (e.g. 'parse this JD then find mentors then assign top one', 'update status to Converted and reassign POC and notify'). Returns a plan_id and the canonical step list with status='pending'. Single-step intents (a single search, single status change, single lookup) MUST NOT call this tool — go straight to the relevant tool. After calling make_plan, execute the steps in order using their referenced tools, then call update_plan_step after each step to mark progress. The final response MUST include a single plan-card block reflecting the latest step statuses.",
      parameters: {
        type: "object",
        properties: {
          goal: { type: "string", description: "Plain-English summary of the user's goal." },
          steps: {
            type: "array",
            description: "Ordered list of steps the agent intends to execute.",
            items: {
              type: "object",
              properties: {
                id: { type: "string", description: "Stable short id (e.g. s1, s2)." },
                title: { type: "string", description: "Short imperative title (e.g. 'Resolve mentor by name')." },
                detail: { type: "string", description: "One-line description of what the step does." },
                tool: { type: "string", description: "Underlying tool name the step will call." },
                depends_on: { type: "array", items: { type: "string" }, description: "Step ids that must finish first." },
              },
              required: ["id", "title"],
              additionalProperties: false,
            },
          },
        },
        required: ["goal", "steps"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_plan_step",
      description: "Update the status of a single plan step. Call this immediately AFTER each underlying tool call so the plan-card stays in sync. Allowed statuses: in_progress (just started), done (succeeded), failed (errored — include result_summary), skipped (no longer needed).",
      parameters: {
        type: "object",
        properties: {
          plan_id: { type: "string", description: "Plan id returned by make_plan." },
          step_id: { type: "string", description: "Step id to update." },
          status: { type: "string", enum: ["in_progress", "done", "failed", "skipped"] },
          result_summary: { type: "string", description: "Optional 1-line outcome (mandatory when status=failed)." },
        },
        required: ["plan_id", "step_id", "status"],
        additionalProperties: false,
      },
    },
  },
];

// ── DB-only data layer ──
// Phase 6: Sheets fully removed from Co-Pilot. The DB (`lmp_processes` /
// `students`) is the single source of truth. Records are still mapped into
// sheet-shaped objects so downstream search/analytics tools keep working
// without a rewrite.

// ── Request-scoped data context ──
type LmpFetch = { headers: string[]; records: Record<string, string>[]; allRows: string[][] };
type ReqCache = {
  lmp?: Promise<LmpFetch>;
  master?: Promise<Record<string, string>[]>;
};

// Request-scoped context shared with executeTool (role for RBAC, etc.)
type PlanStepInternal = {
  id: string; title: string; detail?: string; tool?: string;
  depends_on?: string[]; status: "pending" | "in_progress" | "done" | "failed" | "skipped";
  result_summary?: string;
};
type PlanInternal = { plan_id: string; goal: string; steps: PlanStepInternal[]; started_at: string };
type RequestContext = {
  role: string;
  userId: string | null;
  actorName: string | null;
  plan: PlanInternal | null;
  pocId: string | null;
  isImpersonating: boolean;
  viewAsName: string | null;
  intent: string;
};

type CopilotRequestState = {
  cache: ReqCache;
  context: RequestContext;
  log: Logger;
};

const requestStateStorage = new AsyncLocalStorage<CopilotRequestState>();

function createRequestState(req: Request): CopilotRequestState {
  return {
    cache: {},
    context: {
      role: "poc", userId: null, actorName: null, plan: null, pocId: null,
      isImpersonating: false, viewAsName: null, intent: "unknown",
    },
    log: createLogger("copilot-ai", req),
  };
}

function requestState(): CopilotRequestState {
  const state = requestStateStorage.getStore();
  if (!state) throw new Error("Copilot request context is unavailable");
  return state;
}

function resetRequestCache() {
  requestState().cache = {};
}

// Per-LMP ownership check. The signed-in user must be a POC on the LMP
// (via lmp_poc_links, or as fallback an exact-token match on the denormalized
// prep_poc / support_poc / outreach_poc columns). Applies to EVERY role —
// admin/allocator no longer bypass per-LMP ownership in copilot writes.
async function assertPocOwnsLmp(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; reason: string }> {
  const company = String(payload.company || "").trim();
  const role = String(payload.role || "").trim();
  if (!company || !role) return { ok: false, reason: "Missing company/role to verify LMP ownership." };
  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    // Resolve POC id from authed user (cache on requestState().context).
    let pocId = requestState().context.pocId;
    let pocName = requestState().context.actorName || "";
    let pocAliases: string[] = [];
    if (requestState().context.userId) {
      const { data: prof } = await sb
        .from("poc_profiles")
        .select("id,name,aliases")
        .eq("approved_user_id", requestState().context.userId)
        .maybeSingle();
      if (prof?.id) {
        pocId = prof.id as string;
        requestState().context.pocId = pocId;
        if (prof.name) pocName = prof.name as string;
        if (Array.isArray(prof.aliases)) pocAliases = prof.aliases as string[];
      }
    }
    // Find LMP by company+role.
    const { data: lmp } = await sb
      .from("lmp_processes")
      .select("id, prep_poc, support_poc, outreach_poc")
      .ilike("company", company)
      .ilike("role", role)
      .maybeSingle();
    if (!lmp?.id) return { ok: false, reason: `LMP not found: ${company} · ${role}` };

    if (pocId) {
      const { data: link } = await sb
        .from("lmp_poc_links")
        .select("id")
        .eq("lmp_id", lmp.id)
        .eq("poc_id", pocId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      if (link?.id) return { ok: true };
    }
    // Fallback: exact-token name/alias match on denormalized POC columns.
    const tokens = new Set<string>();
    const pushTok = (s: string | null | undefined) => {
      if (!s) return;
      tokens.add(s.trim().toLowerCase());
    };
    pushTok(pocName);
    pocAliases.forEach(pushTok);
    if (tokens.size) {
      const cols = [lmp.prep_poc, lmp.support_poc, lmp.outreach_poc];
      const present = cols
        .flatMap((c) => String(c || "").split(/[,;/&]/))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (present.some((p) => tokens.has(p))) return { ok: true };
    }
    return { ok: false, reason: `You are not assigned as a POC on ${company} · ${role}. Only the assigned Prep / Support / Outreach POC can edit this LMP.` };
  } catch (e) {
    console.warn("assertPocOwnsLmp error:", e);
    return { ok: false, reason: "Unable to verify LMP ownership." };
  }
}

// Maps DB columns into sheet-shaped record format the rest of this function
// already understands, so executeTool / system-prompt summary logic keep
// working without a rewrite.
function dbLmpRowToRecord(r: Record<string, unknown>): Record<string, string> {
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return {
    "Company": v(r.company),
    "Role": v(r.role),
    "Domain": v(r.domain_raw),
    "Status": v(r.status),
    "Type": v(r.type),
    "Date": v(r.date),
    "Closing Date": v(r.closing_date),
    "Admin Owner": v(r.admin_owner),
    "Allocator": v(r.allocator),
    "Prep POC": v(r.prep_poc),
    "Support POC": v(r.support_poc),
    "Outreach POC": v(r.outreach_poc),
    "Mentor Aligned": v(r.mentor_aligned),
    "Daily Progress": v(r.daily_progress),
    "Prep Progress": v(r.prep_progress),
    "Placement Progress": v(r.placement_progress),
    "R1 - Names": v(r.r1_names),
    "R2 - Names": v(r.r2_names),
    "R3 - Names": v(r.r3_names),
    "Final Converted Numbers": v(r.final_converted_numbers),
    "Converted Names": v(r.final_converted_names),
    "Remarks": v(r.remarks),
    "Last Updated": v(r.updated_at),
    "Last Progress Updated": v(r.last_progress_updated_at),
    "id": v(r.id),
  };
}
function dbStudentRowToRecord(r: Record<string, unknown>): Record<string, string> {
  const v = (x: unknown) => (x === null || x === undefined ? "" : String(x));
  return {
    "Roll No": v(r.roll_no),
    "Name": v(r.name),
    "Email": v(r.email),
    "Phone": v(r.phone),
    "Cohort": v(r.cohort),
    "Primary Domain": v(r.primary_domain),
    "Secondary Domain": v(r.secondary_domain),
    "Other Domains": v(r.other_domains),
    "Keywords": v(r.keywords),
    "Mock Score": v(r.mock_score),
    "Resume Score": v(r.resume_score),
    "Practicum": v(r.practicum),
    "Behavioral": v(r.behavioral),
    "Composite (Primary)": v(r.composite_primary),
    "Composite (Secondary)": v(r.composite_secondary),
    "Final Placement Status": v(r.placement_status),
    "Internship": v(r.internship),
    "Live Project": v(r.live_project),
    "Mentor (Primary)": v(r.mentor_primary),
    "Mentor (Secondary)": v(r.mentor_secondary),
    "Interview Risk Flag": v(r.interview_risk_flag),
  };
}
function recordsToAllRows(records: Record<string, string>[]): { headers: string[]; allRows: string[][] } {
  if (records.length === 0) return { headers: [], allRows: [] };
  const headers = Object.keys(records[0]);
  const dataRows = records.map((r) => headers.map((h) => r[h] ?? ""));
  return { headers, allRows: [headers, ...dataRows] };
}
async function fetchLmpFromSupabase(): Promise<LmpFetch> {
  const sb = getCacheClient();
  // Lean column selection: only what the AI context actually summarizes.
  // Reduces token footprint by ~80% vs select("*"). See bug fix #1.
  const { data, error } = await sb
    .from("lmp_processes")
    .select(
      "id,company,role,domain_raw,status,type,date,prep_poc,support_poc,outreach_poc,lmp_code,daily_progress,final_converted_numbers,mentor_aligned,updated_at,closing_date,jd_url,jd_label,allocation_path",
    )
    .limit(2000);
  if (error) throw new Error(`DB read (lmp_processes) failed: ${error.message}`);
  const records = (data || []).map(dbLmpRowToRecord);
  const { headers, allRows } = recordsToAllRows(records);
  return { headers, records, allRows };
}
async function fetchMastersheetFromSupabase(): Promise<Record<string, string>[]> {
  const sb = getCacheClient();
  // Lean column selection — see bug fix #1.
  const { data, error } = await sb
    .from("students")
    .select("id,name,email,roll_no,cohort,placement_status,lmp_count,created_at")
    .limit(2000);
  if (error) throw new Error(`DB read (students) failed: ${error.message}`);
  return (data || []).map(dbStudentRowToRecord);
}

// DB-only reads. The sheet is no longer consulted by Co-Pilot.
async function getLmpRecords(): Promise<LmpFetch> {
  if (requestState().cache.lmp) return requestState().cache.lmp;
  requestState().cache.lmp = fetchLmpFromSupabase();
  return requestState().cache.lmp;
}

async function getMastersheetRecords(): Promise<Record<string, string>[]> {
  if (requestState().cache.master) return requestState().cache.master;
  requestState().cache.master = fetchMastersheetFromSupabase();
  return requestState().cache.master;
}

function matchesFilter(val: string, filter: string): boolean {
  return val.toLowerCase().includes(filter.toLowerCase());
}

// POC-aware match: handles the common case where prior sheet data stored a short form

// ("Sonali") but the caller passes the full name ("Sonali Awasthi"), or vice
// versa. Also matches on first word so "Sidhartha" / "Siddharth" / "Siddhartha"
// all collide on "siddh"-prefixed firstnames when the caller asks for either.
function matchesPocFilter(cellValue: string, filter: string): boolean {
  const v = (cellValue || "").toLowerCase().trim();
  const f = (filter || "").toLowerCase().trim();
  if (!v || !f) return false;
  if (v.includes(f) || f.includes(v)) return true;
  const vFirst = v.split(/\s+/)[0];
  const fFirst = f.split(/\s+/)[0];
  if (vFirst && fFirst && (vFirst === fFirst || vFirst.startsWith(fFirst) || fFirst.startsWith(vFirst))) return true;
  return false;
}

// ── DB mirror helpers ──
// Sheets is the source of truth for LMP Tracker. After each successful Sheet
// write we mirror the same change to public.lmp_processes so the app's DB-backed
// views (LMP Board, Insights, etc.) reflect the change immediately rather than
// waiting for the 5-min sync cron.

const MIRROR_FIELD_MAP: Record<string, string> = {
  "Status": "status",
  "Type": "type",
  "Domain": "domain_raw",
  "Prep POC": "prep_poc",
  "Outreach POC": "outreach_poc",
  "Secondary POC": "support_poc",
  "Support POC": "support_poc",
  "Daily Progress": "daily_progress",
  "Prep Progress": "prep_progress",
  "Placement Progress": "placement_progress",
  "Remarks": "remarks",
};

function getMirrorClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

async function mirrorLmpUpsert(payload: {
  company: string;
  role: string;
  domain_raw?: string | null;
  type?: string | null;
  status?: string | null;
  prep_poc?: string | null;
  outreach_poc?: string | null;
  support_poc?: string | null;
}) {
  try {
    const sb = getMirrorClient();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(payload)) {
      if (k === "company" || k === "role") continue;
      if (v !== undefined && v !== null && v !== "") update[k] = v;
    }
    const { data: existing } = await sb
      .from("lmp_processes")
      .select("id")
      .ilike("company", payload.company)
      .ilike("role", payload.role)
      .maybeSingle();
    if (existing?.id) {
      await sb.from("lmp_processes").update(update).eq("id", existing.id);
    } else {
      await sb.from("lmp_processes").insert({
        company: payload.company,
        role: payload.role,
        sync_source: "copilot",
        status: payload.status ?? "Ongoing",
        ...update,
      });
    }
    return { ok: true };
  } catch (err) {
    console.warn("mirrorLmpUpsert failed:", err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function mirrorLmpFields(company: string, role: string, sheetFields: Record<string, string>) {
  const dbFields: Record<string, string | null> = {};
  for (const [sheetCol, value] of Object.entries(sheetFields)) {
    const dbCol = MIRROR_FIELD_MAP[sheetCol];
    if (dbCol) dbFields[dbCol] = value;
  }
  if (Object.keys(dbFields).length === 0) return { ok: true, skipped: true };
  return mirrorLmpUpsert({ company, role, ...dbFields });
}

// ── Tool Execution ──

// Centralised write guard. Runs before ANY write tool — covers both the
// prepare_write/execute_pending confirmation path AND direct tool calls
// the model may decide to invoke (update_lmp_field, update_lmp_status,
// assign_poc, add_lmp_record, delete_lmp_record, bulk_update).
// Enforces real-role permissions and POC ownership. View-as affects read scope,
// never the authenticated actor's authority.
const WRITE_KIND_PERMS: Record<string, string> = {
  update_lmp_status: "change_status",
  update_lmp_field: "edit_lmp",
  assign_poc: "assign_poc",
  add_lmp_record: "create_lmp",
  delete_lmp_record: "delete_lmp",
  bulk_update: "bulk_update",
};
const POC_WRITABLE_FIELDS_GUARD = new Set<string>([
  "daily_progress","prep_progress","placement_progress",
  "next_progress_date","next_progress_status","next_progress_type",
  "next_progress_reminder_type","last_progress_updated_at",
  "remarks","mentor_aligned","prep_doc_shared","assignment_review",
  "one_to_one_mock","behavioral_status","status",
  "r1_names","r2_names","r3_names","final_converted_names","prep_doc",
  "Daily Progress","Prep Progress","Placement Progress","Remarks",
  "Mentor Aligned","Prep Doc Shared","Assignment Review","One-to-one Mock",
  "Status","R1 - Names","R2 - Names","R3 - Names",
]);

async function enforceWriteGuard(
  kind: string,
  args: Record<string, unknown>,
): Promise<{ ok: true } | { blocked: true; reason: string }> {
  // 1. Real-role gate.
  const perm = WRITE_KIND_PERMS[kind];
  if (!perm) return { blocked: true, reason: `Unknown write kind: ${kind}` };
  const permResult = checkPermission(requestState().context.role, perm);
  if (!permResult.allowed) {
    return { blocked: true, reason: permResult.reason || `Your role (${requestState().context.role}) cannot perform ${perm}.` };
  }
  // 2. Per-LMP ownership.
  if (kind === "update_lmp_status" || kind === "update_lmp_field" ||
      kind === "assign_poc" || kind === "delete_lmp_record") {
    const own = await assertPocOwnsLmp(args);
    if (!own.ok) return { blocked: true, reason: own.reason };
  }
  if (kind === "bulk_update") {
    const updates = Array.isArray(args.updates) ? args.updates as Record<string, unknown>[] : [];
    for (const u of updates) {
      const own = await assertPocOwnsLmp(u);
      if (!own.ok) return { blocked: true, reason: `Bulk update blocked: ${own.reason}` };
    }
  }
  // 3. POC field whitelist.
  if (requestState().context.role === "poc" && kind === "update_lmp_field") {
    const fields = (args.fields as Record<string, unknown>) || {};
    const offenders = Object.keys(fields).filter((f) => {
      const norm = f.trim();
      return !POC_WRITABLE_FIELDS_GUARD.has(norm) &&
             !POC_WRITABLE_FIELDS_GUARD.has(norm.toLowerCase().replace(/\s+/g, "_"));
    });
    if (offenders.length) {
      return { blocked: true, reason: `POC role cannot edit: ${offenders.join(", ")}. Ask an admin or allocator.` };
    }
  }
  return { ok: true };
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  options: { confirmed?: boolean } = {},
): Promise<string> {
  if (name in WRITE_KIND_PERMS && !options.confirmed) {
    return JSON.stringify({
      blocked: true,
      confirmation_required: true,
      reason: "Prepare this change for user review before executing it.",
    });
  }

  try {
    // Hard write guard — applies regardless of how the model reached us.
    if (name in WRITE_KIND_PERMS) {
      const guard = await enforceWriteGuard(name, args);
      if ("blocked" in guard) {
        return JSON.stringify({
          blocked: true,
          allowed: false,
          success: false,
          reason: guard.reason,
        });
      }
    }
    switch (name) {
      case "rag_search": {
        const query = String(args.query ?? "").trim();
        if (!query) return JSON.stringify({ error: "query required" });
        const tables = Array.isArray(args.tables) ? (args.tables as string[]) : null;
        const limit = Math.min(typeof args.limit === "number" ? args.limit : 6, 12);
        const threshold = typeof args.threshold === "number" ? args.threshold : 0.68;
        const supa = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const block = await retrieveRAGContext(query, supa, tables, { limit, threshold, userId: requestState().context.userId });
        return JSON.stringify({
          query,
          searched_tables: tables ?? "all",
          threshold,
          results: block || "No semantically similar records found above threshold.",
        });
      }
      case "list_entities": {
        const entityType = String(args.entity_type || "poc");
        const limitVal = (args.limit as number) === 0 ? 10000 : ((args.limit as number) || 200);
        const supa = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );

        if (entityType === "poc") {
          let q = supa.from("poc_profiles").select("*").order("name").limit(limitVal);
          if (args.domain) q = q.ilike("primary_domain", `%${args.domain}%`);
          const { data, error } = await q;
          if (error) return JSON.stringify({ error: error.message });
          return JSON.stringify({ count: data?.length ?? 0, pocs: data ?? [] });
        }

        const { searchEntities: _se } = await import("../_shared/entitySearch.ts");
        let regData = await _se({ query: "", types: [entityType], limit: limitVal, perTypeLimit: limitVal });
        if (args.domain) {
          const dq = String(args.domain).toLowerCase();
          regData = regData.filter((r) => (r.domain || "").toLowerCase().includes(dq));
        }
        const trimmed = regData.map((r) => ({
          entity_type: r.entity_type, entity_id: r.entity_id, display_name: r.display_name,
          email: r.email, domain: r.domain, metadata: r.metadata,
        }));
        return JSON.stringify({ count: trimmed.length, entities: trimmed });
      }
      case "make_plan": {
        const goal = String(args.goal || "").trim();
        const rawSteps = Array.isArray(args.steps) ? (args.steps as Record<string, unknown>[]) : [];
        if (!goal || rawSteps.length === 0) {
          return JSON.stringify({ error: "make_plan requires goal and at least one step" });
        }
        const steps: PlanStepInternal[] = rawSteps.slice(0, 12).map((s, i) => ({
          id: typeof s.id === "string" && s.id ? s.id : `s${i + 1}`,
          title: typeof s.title === "string" ? s.title : `Step ${i + 1}`,
          detail: typeof s.detail === "string" ? s.detail : undefined,
          tool: typeof s.tool === "string" ? s.tool : undefined,
          depends_on: Array.isArray(s.depends_on) ? (s.depends_on as string[]) : undefined,
          status: "pending",
        }));
        const plan: PlanInternal = {
          plan_id: `pl_${crypto.randomUUID().slice(0, 8)}`,
          goal,
          steps,
          started_at: new Date().toISOString(),
        };
        requestState().context.plan = plan;
        return JSON.stringify({
          plan_id: plan.plan_id,
          goal: plan.goal,
          started_at: plan.started_at,
          steps: plan.steps,
          render_hint: "Include exactly one plan-card block in your final response with type='plan-card' and these step ids.",
        });
      }
      case "update_plan_step": {
        const plan = requestState().context.plan;
        if (!plan) return JSON.stringify({ error: "No active plan. Call make_plan first." });
        const planId = String(args.plan_id || "");
        if (planId !== plan.plan_id) return JSON.stringify({ error: `Unknown plan_id ${planId}` });
        const stepId = String(args.step_id || "");
        const step = plan.steps.find((s) => s.id === stepId);
        if (!step) return JSON.stringify({ error: `Unknown step_id ${stepId}` });
        const status = String(args.status || "");
        if (!["in_progress", "done", "failed", "skipped"].includes(status)) {
          return JSON.stringify({ error: `Invalid status ${status}` });
        }
        step.status = status as PlanStepInternal["status"];
        if (typeof args.result_summary === "string") step.result_summary = args.result_summary;
        return JSON.stringify({ ok: true, plan_id: plan.plan_id, step });
      }
      case "check_permission": {
        const action = String(args.action || "");
        const targetSummary = typeof args.target_summary === "string" ? args.target_summary : undefined;
        const result = checkPermission(requestState().context.role, action);
        return JSON.stringify({ ...result, target_summary: targetSummary });
      }
      case "prepare_write": {
        const kind = String(args.kind || "");
        const payload = (args.payload as Record<string, unknown>) || {};
        const targetSummary = typeof args.target_summary === "string" ? args.target_summary : undefined;
        const SYNC_IMPACT_BY_KIND: Record<string, string> = {
          add_lmp_record: "Adds a row to LMP Tracker (sheet) and inserts into the LMP database (mirrored).",
          update_lmp_status: "Updates the LMP Tracker sheet and mirrors the new status to the LMP database; activity-log entry recorded.",
          update_lmp_field: "Updates the LMP Tracker sheet and mirrors changed fields to the LMP database.",
          assign_poc: "Updates the POC column in LMP Tracker (sheet) and mirrors the assignment to the LMP database.",
          delete_lmp_record: "Soft-closes this LMP in the sheet and database; activity-log entry recorded.",
          bulk_update: "Applies all updates to LMP Tracker (sheet) and mirrors each row to the LMP database.",
        };
        const syncImpact = typeof args.sync_impact === "string" && args.sync_impact.trim()
          ? args.sync_impact
          : (SYNC_IMPACT_BY_KIND[String(args.kind || "")] ?? "Updates LMP Tracker (sheet) and writes an activity-log entry.");

        // Re-validate RBAC server-side. Map kind → permission action.
        const PERM_MAP: Record<string,string> = {
          update_lmp_status: "change_status",
          update_lmp_field: "edit_lmp",
          assign_poc: "assign_poc",
          add_lmp_record: "create_lmp",
          delete_lmp_record: "delete_lmp",
          bulk_update: "bulk_update",
        };
        const perm = PERM_MAP[kind];
        if (!perm) return JSON.stringify({ error: `Unknown write kind: ${kind}` });
        const permResult = checkPermission(requestState().context.role, perm);
        if (!permResult.allowed) {
          return JSON.stringify({ blocked: true, ...permResult, target_summary: targetSummary });
        }

        // POCs may only mutate LMPs they are assigned to. Privileged role
        // scope is enforced by the canonical permission contract.
        if (requestState().context.role === "poc" &&
            (kind === "update_lmp_status" || kind === "update_lmp_field" ||
            kind === "assign_poc" || kind === "delete_lmp_record")) {
          const own = await assertPocOwnsLmp(payload);
          if (!own.ok) {
            return JSON.stringify({
              blocked: true, allowed: false,
              reason: own.reason,
              target_summary: targetSummary,
            });
          }
        }
        if (requestState().context.role === "poc" && kind === "bulk_update") {
          const updates = Array.isArray(payload.updates) ? payload.updates as Record<string, unknown>[] : [];
          for (const u of updates) {
            const own = await assertPocOwnsLmp(u);
            if (!own.ok) {
              return JSON.stringify({
                blocked: true, allowed: false,
                reason: `Bulk update blocked: ${own.reason}`,
                target_summary: targetSummary,
              });
            }
          }
        }
        // Field-level RBAC for POCs uses the canonical shared contract.
        const POC_ALLOWED_FIELDS = new Set<string>([
          ...POC_WRITABLE_LMP_COLUMNS,
          // sheet-column aliases (case-insensitive match below)
          "Daily Progress","Prep Progress","Placement Progress","Remarks",
          "Mentor Aligned","Prep Doc Shared","Assignment Review","One-to-one Mock",
          "Status","R1 Shortlisted","R2 Shortlisted","R3 Shortlisted",
        ]);
        if (requestState().context.role === "poc" && kind === "update_lmp_field") {
          const fields = (payload.fields as Record<string, unknown>) || {};
          const offenders = Object.keys(fields).filter((f) => {
            const norm = f.trim();
            return !POC_ALLOWED_FIELDS.has(norm) && !POC_ALLOWED_FIELDS.has(norm.toLowerCase().replace(/\s+/g, "_"));
          });
          if (offenders.length) {
            return JSON.stringify({
              blocked: true,
              allowed: false,
              reason: `POC role cannot edit: ${offenders.join(", ")}. Ask an admin or allocator.`,
              target_summary: targetSummary,
            });
          }
        }

        // Snapshot current values for diffable confirmation.
        const currentSnapshot: Record<string, unknown> = {};
        const proposedSnapshot: Record<string, unknown> = {};
        try {
          if (kind === "update_lmp_status" || kind === "update_lmp_field" || kind === "assign_poc" || kind === "delete_lmp_record") {
            const { headers, allRows } = await getLmpRecords();
            const companyCol = headers.indexOf("Company");
            const roleCol = headers.indexOf("Role");
            const company = String(payload.company || "").trim().toLowerCase();
            const role = String(payload.role || "").trim().toLowerCase();
            const rowIndex = allRows.findIndex((r, i) => i > 0 && (r[companyCol] || "").trim().toLowerCase() === company && (r[roleCol] || "").trim().toLowerCase() === role);
            if (rowIndex > 0) {
              const row = allRows[rowIndex];
              if (kind === "update_lmp_status") {
                const sCol = headers.indexOf("Status");
                currentSnapshot.Status = row[sCol] || "";
                proposedSnapshot.Status = payload.status;
              } else if (kind === "update_lmp_field") {
                const fields = (payload.fields as Record<string,string>) || {};
                for (const f of Object.keys(fields)) {
                  const c = headers.indexOf(f);
                  currentSnapshot[f] = c !== -1 ? (row[c] || "") : "";
                  proposedSnapshot[f] = fields[f];
                }
              } else if (kind === "assign_poc") {
                const map: Record<string,string> = { primary: "Prep POC", secondary: "Secondary POC", outreach: "Outreach POC" };
                const col = map[String(payload.poc_type || "primary")] || "Prep POC";
                const c = headers.indexOf(col);
                currentSnapshot[col] = c !== -1 ? (row[c] || "") : "";
                proposedSnapshot[col] = payload.poc_name;
              } else if (kind === "delete_lmp_record") {
                currentSnapshot.exists = true;
                proposedSnapshot.deleted = true;
              }
            }
          } else if (kind === "add_lmp_record") {
            proposedSnapshot.Company = payload.company;
            proposedSnapshot.Role = payload.role;
            if (payload.domain) proposedSnapshot.Domain = payload.domain;
            if (payload.status) proposedSnapshot.Status = payload.status;
          } else if (kind === "bulk_update") {
            proposedSnapshot.updates_count = Array.isArray(payload.updates) ? (payload.updates as unknown[]).length : 0;
          }
        } catch (snapErr) {
          console.warn("prepare_write snapshot warn:", snapErr);
        }

        // STATELESS confirmation flow (copilot_pending_actions table dropped in Phase 5).
        // We mint a UUID, echo back kind+payload, and the AI passes them back into
        // execute_pending. No DB hop required.
        const pendingId = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

        return JSON.stringify({
          pending_action_id: pendingId,
          expires_at: expiresAt,
          kind,
          payload,
          target_summary: targetSummary,
          current: currentSnapshot,
          proposed: proposedSnapshot,
          sync_impact: syncImpact,
          role: requestState().context.role,
          permission: perm,
        });
      }
      case "execute_pending": {
        const id = String(args.pending_action_id || "").trim();
        const kind = String(args.kind || "").trim();
        const payload = (args.payload as Record<string, unknown>) || {};
        if (!id || !kind) return JSON.stringify({ error: "Missing pending_action_id or kind (stateless flow requires both)" });
        const currentSnapshot = (args.current_snapshot as Record<string, unknown>) || {};
        const proposedSnapshot = (args.proposed_snapshot as Record<string, unknown>) || {};

        // Re-validate RBAC at execute time.
        const PERM_MAP: Record<string,string> = {
          update_lmp_status: "change_status", update_lmp_field: "edit_lmp",
          assign_poc: "assign_poc", add_lmp_record: "create_lmp",
          delete_lmp_record: "delete_lmp", bulk_update: "bulk_update",
        };
        const permResult = checkPermission(requestState().context.role, PERM_MAP[kind] || "edit_lmp");
        if (!permResult.allowed) {
          return JSON.stringify({ blocked: true, ...permResult });
        }
        // BUG-P4: re-check field-level RBAC at execute time.
        if (requestState().context.role === "poc" && kind === "update_lmp_field") {
          const POC_ALLOWED_FIELDS = new Set<string>([
            "daily_progress","prep_progress","placement_progress",
            "next_progress_date","next_progress_status","next_progress_type",
            "next_progress_reminder_type","last_progress_updated_at",
            "remarks","mentor_aligned","prep_doc_shared","assignment_review",
            "one_to_one_mock","behavioral_status","status",
            "r1_names","r2_names","r3_names","final_converted_names","prep_doc",
            "Daily Progress","Prep Progress","Placement Progress","Remarks",
            "Mentor Aligned","Prep Doc Shared","Assignment Review","One-to-one Mock",
            "Status","R1 - Names","R2 - Names","R3 - Names",
          ]);
          const fields = (payload.fields as Record<string, unknown>) || {};
          const offenders = Object.keys(fields).filter((f) => {
            const norm = f.trim();
            return !POC_ALLOWED_FIELDS.has(norm) && !POC_ALLOWED_FIELDS.has(norm.toLowerCase().replace(/\s+/g, "_"));
          });
          if (offenders.length) {
            return JSON.stringify({
              blocked: true,
              allowed: false,
              reason: `POC role cannot edit: ${offenders.join(", ")}.`,
            });
          }
        }

        // Per-LMP POC ownership re-check at execute time — enforced for EVERY role.
        if (kind === "update_lmp_status" || kind === "update_lmp_field" ||
            kind === "assign_poc" || kind === "delete_lmp_record") {
          const own = await assertPocOwnsLmp(payload);
          if (!own.ok) {
            return JSON.stringify({ blocked: true, allowed: false, reason: own.reason });
          }
        }
        if (kind === "bulk_update") {
          const updates = Array.isArray(payload.updates) ? payload.updates as Record<string, unknown>[] : [];
          for (const u of updates) {
            const own = await assertPocOwnsLmp(u);
            if (!own.ok) {
              return JSON.stringify({ blocked: true, allowed: false, reason: `Bulk update blocked: ${own.reason}` });
            }
          }
        }

        // Replay the underlying write tool.
        const writeResult = await executeTool(kind, payload, { confirmed: true });
        let parsed: Record<string, unknown> = {};
        try { parsed = JSON.parse(writeResult); } catch { /* ignore */ }
        const succeeded = !parsed.error && !parsed.blocked && parsed.success !== false;

        // Activity log row (best-effort).
        try {
          const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
          const entityKey = `${payload.company || ""} · ${payload.role || ""}`;
          await sb.from("activity_log").insert({
            actor_name: requestState().context.actorName || "Copilot user",
            poc_role_type: requestState().context.role === "admin" ? "admin" : (requestState().context.role === "allocator" ? "system" : "primary"),
            entity_type: kind === "bulk_update" ? "lmp_bulk" : "lmp",
            entity_id: entityKey.trim() || null,
            action: `copilot:${kind}`,
            previous_value: JSON.stringify(currentSnapshot),
            new_value: JSON.stringify(proposedSnapshot),
            metadata: { pending_action_id: id, payload, result: parsed, viewed_as: requestState().context.viewAsName ?? null },
            source: "copilot",
          });
        } catch (logErr) {
          console.warn("activity_log insert failed:", logErr);
        }

        return JSON.stringify({
          pending_action_id: id,
          kind,
          executed: succeeded,
          result: parsed,
          target: { company: payload.company, role: payload.role },
          previous: currentSnapshot,
          new: proposedSnapshot,
        });
      }
      case "resolve_entity": {
        const query = String(args.query || "").trim();
        if (!query) return JSON.stringify({ resolution_status: "no_match", matches: [], reasoning: "Empty query" });
        const preferredScope = (args.preferred_scope as string) || "global";
        const limit = Math.max(1, Math.min(20, (args.limit as number) || 6));

        const { searchEntities: _se2 } = await import("../_shared/entitySearch.ts");
        const candidates = await _se2({ query, limit: 50, perTypeLimit: 30 });

        const q = query.toLowerCase();
        const scored = candidates.map((row) => {
          const name = (row.display_name || "").toLowerCase();
          let score = 0;
          if (name === q) score = 1.0;
          else if (name.startsWith(q)) score = 0.92;
          else if (name.includes(q)) score = 0.78;
          else {
            const wq = q.split(/\s+/).filter(Boolean);
            const wn = name.split(/\s+/).filter(Boolean);
            const overlap = wq.filter((w) => wn.some((x) => x.includes(w) || w.includes(x))).length;
            score = overlap / Math.max(wq.length, wn.length, 1) * 0.7;
          }
          if (row.aliases.some((a) => String(a).toLowerCase() === q)) score = Math.max(score, 0.95);
          if (row.email && row.email.toLowerCase() === q) score = 1.0;
          if (preferredScope !== "global" && row.entity_type === preferredScope) score += 0.15;
          score += (row.source_priority || 50) / 10000;
          return { row, score };
        }).filter((x) => x.score > 0.35)
          .sort((a, b) => b.score - a.score);

        const top = scored.slice(0, limit).map(({ row, score }) => ({
          entity_type: row.entity_type,
          entity_id: row.entity_id,
          display_name: row.display_name,
          domain: row.domain,
          email: row.email,
          metadata: row.metadata,
          confidence: Number(score.toFixed(3)),
        }));

        if (top.length === 0) {
          return JSON.stringify({ resolution_status: "no_match", matches: [], reasoning: `No registry entry matched "${query}"` });
        }

        // ── Cross-scope ambiguity guard ──
        // A common failure: query "Kriti" → student "Kritika Agarwal" wins because
        // it has a higher trigram score, but the user actually meant the POC named
        // "Kriti". If the top result is NOT a POC and a POC candidate also exists
        // with a strong first-token match, return both as multiple_matches so the
        // model surfaces a disambiguation card instead of silently picking the wrong one.
        const firstTok = q.split(/\s+/)[0] || q;
        const pocCandidate = top.find((m) => m.entity_type === "poc" && (
          m.display_name.toLowerCase() === q ||
          m.display_name.toLowerCase().startsWith(firstTok)
        ));
        const topIsPoc = top[0].entity_type === "poc";
        const ambiguousAcrossScopes = !!pocCandidate && !topIsPoc && pocCandidate !== top[0];

        // Single match if top score clearly dominates AND no cross-scope POC ambiguity
        const isSingle = !ambiguousAcrossScopes && (top.length === 1 || top[0].confidence - top[1].confidence > 0.2 || top[0].confidence >= 0.95);
        if (isSingle) {
          return JSON.stringify({
            resolution_status: "single_match",
            selected_entity: top[0],
            matches: top,
            reasoning: `Top match ${top[0].entity_type}:${top[0].display_name} (conf ${top[0].confidence})${preferredScope !== "global" ? ` with ${preferredScope} scope boost` : ""}`,
          });
        }

        // Reorder so the POC candidate is first if cross-scope ambiguity was detected
        const matches = ambiguousAcrossScopes
          ? [pocCandidate!, ...top.filter((m) => m !== pocCandidate)]
          : top;

        return JSON.stringify({
          resolution_status: "multiple_matches",
          matches,
          reasoning: ambiguousAcrossScopes
            ? `Found a POC named "${pocCandidate!.display_name}" and a ${top[0].entity_type} named "${top[0].display_name}" — ask the user which one they meant.`
            : `${top.length} candidates within close range; ask user to pick`,
        });
      }


      case "search_lmp_records": {
        const { records } = await getLmpRecords();
        let filtered = records;
        if (args.company) filtered = filtered.filter(r => matchesFilter(r["Company"] || "", args.company as string));
        if (args.role) filtered = filtered.filter(r => matchesFilter(r["Role"] || "", args.role as string));
        if (args.domain) filtered = filtered.filter(r => matchesFilter(r["Domain"] || "", args.domain as string));
        if (args.status) filtered = filtered.filter(r => matchesFilter(r["Status"] || "", args.status as string));
        if (typeof args.mentor_aligned === "boolean") {
          filtered = filtered.filter(r => /^(true|yes|1)$/i.test(r["Mentor Aligned"] || "") === args.mentor_aligned);
        }
        if (args.poc) filtered = filtered.filter(r =>
          matchesPocFilter(r["Prep POC"] || "", args.poc as string) ||
          matchesPocFilter(r["Outreach POC"] || "", args.poc as string) ||
          matchesPocFilter(r["Support POC"] || "", args.poc as string) ||
          matchesPocFilter(r["Secondary POC"] || "", args.poc as string)
        );
        if (args.type) filtered = filtered.filter(r => matchesFilter(r["Type"] || "", args.type as string));

        // Recency filters using the Last Updated timestamp from lmp_processes.updated_at
        let cutoffMs: number | null = null;
        if (typeof args.updated_since === "string" && args.updated_since) {
          const t = Date.parse(args.updated_since as string);
          if (!Number.isNaN(t)) cutoffMs = t;
        } else if (typeof args.updated_within_days === "number" && args.updated_within_days > 0) {
          cutoffMs = Date.now() - (args.updated_within_days as number) * 86400000;
        }
        if (cutoffMs !== null) {
          filtered = filtered.filter(r => {
            const raw = r["Last Updated"] || r["Last Progress Updated"] || "";
            if (!raw) return false;
            const t = Date.parse(raw);
            return !Number.isNaN(t) && t >= cutoffMs!;
          });
        }

        if (args.sort === "recent" || args.sort === "oldest_activity") {
          const dir = args.sort === "recent" ? -1 : 1;
          filtered = [...filtered].sort((a, b) => {
            const ta = Date.parse(a["Last Updated"] || "") || 0;
            const tb = Date.parse(b["Last Updated"] || "") || 0;
            return (ta - tb) * dir;
          });
        }

        const limitRaw = args.limit as number;
        const limit = limitRaw === 0 ? filtered.length : (limitRaw || 200);
        return JSON.stringify({
          total_count: filtered.length,
          returned_count: Math.min(filtered.length, limit),
          truncated: filtered.length > limit,
          truncation_note: filtered.length > limit ? `Showing ${limit} of ${filtered.length} records. Pass limit=${filtered.length} (or 0) to get all.` : null,
          records: filtered.slice(0, limit),
        });
      }

      case "get_student_profile": {
        const students = await getMastersheetRecords();
        const match = students.find(s =>
          (args.name && matchesFilter(s["Name"] || "", args.name as string)) ||
          (args.roll_no && s["Roll No."] === args.roll_no)
        );
        if (!match) return JSON.stringify({ error: "Student not found", searched: { name: args.name, roll_no: args.roll_no } });
        return JSON.stringify(match);
      }

      case "search_sessions": {
        let q = supabase.from("sessions")
          .select("id, lmp_id, mentor_id, student_id, session_type, status, scheduled_at, completed_at, duration_min, poc_name, notes, student_rating, mentor_rating, lmp_processes(company, role), mentors(name), students(name)")
          .order("scheduled_at", { ascending: false, nullsFirst: false })
          .limit(Math.min(Number(args.limit) || 50, 200));
        if (args.lmp_id) q = q.eq("lmp_id", args.lmp_id as string);
        if (args.status) q = q.eq("status", args.status as string);
        if (args.since) q = q.gte("scheduled_at", args.since as string);
        if (args.until) q = q.lte("scheduled_at", args.until as string);
        const { data, error } = await q;
        if (error) return JSON.stringify({ error: error.message });
        let rows = data || [];
        if (args.mentor) {
          const m = String(args.mentor).toLowerCase();
          rows = rows.filter((r: any) => (r.mentors?.name || "").toLowerCase().includes(m));
        }
        if (args.attendee) {
          const a = String(args.attendee).toLowerCase();
          rows = rows.filter((r: any) => (r.students?.name || "").toLowerCase().includes(a));
        }
        return JSON.stringify({ count: rows.length, sessions: rows });
      }

      case "search_students": {
        const students = await getMastersheetRecords();
        let filtered = students;
        if (args.name) filtered = filtered.filter(s => matchesFilter(s["Name"] || "", args.name as string));
        if (args.domain) filtered = filtered.filter(s =>
          matchesFilter(s["Primary Domain"] || "", args.domain as string) ||
          matchesFilter(s["Secondary Domain"] || "", args.domain as string) ||
          matchesFilter(s["Actual Domain"] || "", args.domain as string)
        );
        if (args.placement_status) filtered = filtered.filter(s => matchesFilter(s["Final Placement Status"] || "", args.placement_status as string));
        if (args.mentor) filtered = filtered.filter(s =>
          matchesFilter(s["Mentor (Primary)"] || "", args.mentor as string) ||
          matchesFilter(s["Mentor (Secondary)"] || "", args.mentor as string)
        );
        if (args.risk_flag) filtered = filtered.filter(s => matchesFilter(s["Interview Risk Flag"] || "", args.risk_flag as string));
        if (args.min_composite) filtered = filtered.filter(s => parseFloat(s["Composite (Primary)"] || "0") >= (args.min_composite as number));
        const limitRaw = args.limit as number;
        const limit = limitRaw === 0 ? filtered.length : (limitRaw || 100);
        return JSON.stringify({
          total_count: filtered.length,
          returned_count: Math.min(filtered.length, limit),
          truncated: filtered.length > limit,
          truncation_note: filtered.length > limit ? `Showing ${limit} of ${filtered.length} students. Pass limit=${filtered.length} (or 0) to get all.` : null,
          students: filtered.slice(0, limit),
        });
      }

      case "update_lmp_status": {
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        const statusCol = headers.indexOf("Status");
        if (companyCol === -1 || roleCol === -1 || statusCol === -1) return JSON.stringify({ error: "Required columns not found" });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === (args.company as string).trim().toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === (args.role as string).trim().toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${args.company} - ${args.role}` });

        const oldStatus = allRows[rowIndex][statusCol];

        // DB-only write.
        const dbResult = await mirrorLmpUpsert({ company: args.company as string, role: args.role as string, status: args.status as string });

        return JSON.stringify({
          success: dbResult.ok,
          company: args.company,
          role: args.role,
          old_status: oldStatus,
          new_status: args.status,
          message: `Status updated from "${oldStatus}" to "${args.status}"`,
          db_result: dbResult,
        });
      }

      case "update_lmp_field": {
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        if (companyCol === -1 || roleCol === -1) return JSON.stringify({ error: "Required columns not found" });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === (args.company as string).trim().toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === (args.role as string).trim().toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${args.company} - ${args.role}` });

        const fields = args.fields as Record<string, string>;
        const newRow = [...allRows[rowIndex]];
        const changes: Record<string, { old: string; new: string }> = {};
        for (const [field, value] of Object.entries(fields)) {
          const colIdx = headers.indexOf(field);
          if (colIdx !== -1) {
            changes[field] = { old: newRow[colIdx] || "", new: value };
            newRow[colIdx] = value;
          }
        }
        const updatedAtCol = headers.indexOf("updatedAt");
        if (updatedAtCol !== -1) newRow[updatedAtCol] = new Date().toISOString();

        const dbResult = await mirrorLmpFields(args.company as string, args.role as string, fields);

        return JSON.stringify({ success: dbResult.ok, company: args.company, role: args.role, changes, db_result: dbResult });
      }

      case "assign_poc": {
        const pocTypeMap: Record<string, string> = { primary: "Prep POC", secondary: "Secondary POC", outreach: "Outreach POC" };
        const pocCol = pocTypeMap[(args.poc_type as string)] || "Prep POC";
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        let targetCol = headers.indexOf(pocCol);
        if (targetCol === -1 && pocCol === "Prep POC") targetCol = headers.indexOf("POC");
        if (targetCol === -1) return JSON.stringify({ error: `Column not found: ${pocCol}` });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === (args.company as string).trim().toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === (args.role as string).trim().toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${args.company} - ${args.role}` });

        const oldPoc = allRows[rowIndex][targetCol] || "";
        const newRow = [...allRows[rowIndex]];
        newRow[targetCol] = args.poc_name as string;
        const updatedAtCol = headers.indexOf("updatedAt");
        if (updatedAtCol !== -1) newRow[updatedAtCol] = new Date().toISOString();

        const dbResult = await mirrorLmpFields(args.company as string, args.role as string, { [pocCol]: args.poc_name as string });

        return JSON.stringify({
          success: dbResult.ok,
          company: args.company,
          role: args.role,
          poc_type: args.poc_type,
          poc_column: pocCol,
          old_poc: oldPoc,
          new_poc: args.poc_name,
          message: `${pocCol} changed from "${oldPoc}" to "${args.poc_name}"`,
          db_result: dbResult,
        });
      }

      case "add_lmp_record": {
        const dbResult = await mirrorLmpUpsert({
          company: args.company as string,
          role: args.role as string,
          domain_raw: (args.domain as string) || null,
          type: (args.type as string) || "Full Time",
          status: (args.status as string) || "Ongoing",
          prep_poc: (args.prep_poc as string) || null,
          outreach_poc: (args.outreach_poc as string) || null,
        });

        return JSON.stringify({
          success: dbResult.ok,
          message: `New LMP record created: ${args.company} - ${args.role}`,
          record: { company: args.company, role: args.role, domain: args.domain, type: args.type || "Full Time", status: args.status || "Ongoing" },
          db_result: dbResult,
        });
      }

      case "delete_lmp_record": {
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        if (companyCol === -1 || roleCol === -1) return JSON.stringify({ error: "Required columns not found" });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === (args.company as string).trim().toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === (args.role as string).trim().toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${args.company} - ${args.role}` });

        // Soft-close in DB (no hard-delete column today).
        const dbResult = await mirrorLmpUpsert({ company: args.company as string, role: args.role as string, status: "Closed" });

        return JSON.stringify({ success: dbResult.ok, message: `Record soft-deleted: ${args.company} - ${args.role}`, db_result: dbResult });
      }

      case "bulk_update": {
        const updates = args.updates as { company: string; role: string; fields: Record<string, string> }[];
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        if (companyCol === -1 || roleCol === -1) return JSON.stringify({ error: "Required columns not found" });

        const results: { company: string; role: string; success: boolean; error?: string }[] = [];

        for (const upd of updates) {
          let rowIndex = -1;
          for (let i = 1; i < allRows.length; i++) {
            if ((allRows[i][companyCol] || "").trim().toLowerCase() === upd.company.trim().toLowerCase() &&
                (allRows[i][roleCol] || "").trim().toLowerCase() === upd.role.trim().toLowerCase()) {
              rowIndex = i;
              break;
            }
          }
          if (rowIndex === -1) {
            results.push({ company: upd.company, role: upd.role, success: false, error: "Not found" });
            continue;
          }
          results.push({ company: upd.company, role: upd.role, success: true });
        }

        // DB-only writes.
        const dbResults: { company: string; role: string; ok: boolean }[] = [];
        for (const upd of updates) {
          const r = results.find((x) => x.company === upd.company && x.role === upd.role);
          if (!r?.success) continue;
          const m = await mirrorLmpFields(upd.company, upd.role, upd.fields);
          dbResults.push({ company: upd.company, role: upd.role, ok: m.ok });
        }

        return JSON.stringify({
          total: updates.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
          results,
          db_results: dbResults,
        });
      }

      case "get_analytics": {
        const { records } = await getLmpRecords();
        const metric = args.metric as string;
        let filtered = records;
        if (args.domain) filtered = filtered.filter(r => matchesFilter(r["Domain"] || "", args.domain as string));
        if (args.poc) filtered = filtered.filter(r =>
          matchesFilter(r["Prep POC"] || "", args.poc as string) ||
          matchesFilter(r["Outreach POC"] || "", args.poc as string)
        );

        switch (metric) {
          case "status_distribution": {
            const dist: Record<string, number> = {};
            filtered.forEach(r => { const s = r["Status"] || "Unknown"; dist[s] = (dist[s] || 0) + 1; });
            return JSON.stringify({ total: filtered.length, distribution: dist });
          }
          case "domain_distribution": {
            const dist: Record<string, number> = {};
            filtered.forEach(r => { const d = r["Domain"] || "Unknown"; dist[d] = (dist[d] || 0) + 1; });
            return JSON.stringify({ total: filtered.length, distribution: dist });
          }
          case "poc_workload": {
            const pocMap: Record<string, { total: number; ongoing: number; converted: number; domains: Set<string> }> = {};
            filtered.forEach(r => {
              for (const pocCol of ["Prep POC", "Outreach POC"]) {
                const poc = r[pocCol];
                if (!poc) continue;
                if (!pocMap[poc]) pocMap[poc] = { total: 0, ongoing: 0, converted: 0, domains: new Set() };
                pocMap[poc].total++;
                if ((r["Status"] || "").toLowerCase() === "ongoing") pocMap[poc].ongoing++;
                if ((r["Status"] || "").toLowerCase() === "converted") pocMap[poc].converted++;
                if (r["Domain"]) pocMap[poc].domains.add(r["Domain"]);
              }
            });
            const supa2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
            const { data: allPocProfiles } = await supa2.from("poc_profiles").select("name, role_type, primary_domain, active_load, conversion_rate").order("name");
            for (const p of allPocProfiles ?? []) {
              if (!p.name) continue;
              if (!pocMap[p.name]) pocMap[p.name] = { total: 0, ongoing: 0, converted: 0, domains: new Set() };
              if (p.primary_domain) pocMap[p.name].domains.add(p.primary_domain);
            }
            const workload = Object.entries(pocMap).map(([name, d]) => ({
              name, total: d.total, ongoing: d.ongoing, converted: d.converted, domains: [...d.domains],
            })).sort((a, b) => b.total - a.total);
            return JSON.stringify({
              total_pocs: workload.length,
              pocs: workload,
              note: `${workload.length} POCs total (including those with 0 active LMPs)`,
            });
          }
          case "conversion_rate": {
            const total = filtered.length;
            const converted = filtered.filter(r => (r["Status"] || "").toLowerCase() === "converted").length;
            const notConverted = filtered.filter(r => (r["Status"] || "").toLowerCase() === "not converted").length;
            const ongoing = filtered.filter(r => (r["Status"] || "").toLowerCase() === "ongoing").length;
            return JSON.stringify({ total, converted, not_converted: notConverted, ongoing, conversion_rate: total > 0 ? `${((converted / total) * 100).toFixed(1)}%` : "N/A" });
          }
          case "type_distribution": {
            const dist: Record<string, number> = {};
            filtered.forEach(r => { const t = r["Type"] || "Unknown"; dist[t] = (dist[t] || 0) + 1; });
            return JSON.stringify({ total: filtered.length, distribution: dist });
          }
          case "age_tracking": {
            const now = Date.now();
            const ages = filtered.map(r => {
              const dateStr = r["Date"] || "";
              const parsed = Date.parse(dateStr);
              const days = isNaN(parsed) ? 0 : Math.floor((now - parsed) / 86400000);
              return { company: r["Company"], role: r["Role"], status: r["Status"], age_days: Math.max(0, days) };
            }).sort((a, b) => b.age_days - a.age_days);
            return JSON.stringify({ records: ages.slice(0, 30) });
          }
          case "overview":
          case "pipeline_summary": {
            const total = filtered.length;
            const statusDist: Record<string, number> = {};
            const domainDist: Record<string, number> = {};
            filtered.forEach(r => {
              const s = r["Status"] || "Unknown";
              statusDist[s] = (statusDist[s] || 0) + 1;
              const d = r["Domain"] || "Unknown";
              domainDist[d] = (domainDist[d] || 0) + 1;
            });
            const converted = statusDist["Converted"] || 0;
            return JSON.stringify({
              total, converted, conversion_rate: total > 0 ? `${((converted / total) * 100).toFixed(1)}%` : "N/A",
              status_distribution: statusDist,
              domain_distribution: domainDist,
            });
          }
      case "smart_search": {
        const query = (args.query as string) || "";
        const sources = (args.sources as string[]) || ["lmp", "students"];
        const limit = (args.limit as number) || 15;

        const baseKeywords = [...new Set(
          query.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 1)
        )];
        if (baseKeywords.length === 0) return JSON.stringify({ error: "Query too short or empty" });

        let expandedKeywords: string[] = [...baseKeywords];
        try {
          const expandRes = await fetch(AI_GATEWAY_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${AI_KEY_FOR_CHAT}`, "Content-Type": "application/json", ...AI_EXTRA_HEADERS },
            signal: AbortSignal.timeout(90_000),
            body: JSON.stringify({
              model: TOOL_MODEL,
              messages: [
                { role: "system", content: "You are a keyword expansion engine. Given a search query about placement/recruitment data, output ONLY a JSON array of 8-15 related keywords/synonyms that would help find relevant rows. Include abbreviations, alternate spellings, related terms. Example: for 'finance internship converted' output [\"finance\",\"internship\",\"converted\",\"placed\",\"FT\",\"intern\",\"banking\",\"accounting\",\"offer received\",\"selected\",\"fin\",\"financial\"]" },
                { role: "user", content: query },
              ],
              stream: false,
            }),
          });
          if (expandRes.ok) {
            const expandData = await expandRes.json();
            const expandContent = expandData.choices?.[0]?.message?.content || "";
            const jsonMatch = expandContent.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]) as string[];
              const extras = parsed.map((k: string) => k.toLowerCase().trim()).filter((k: string) => k.length > 1);
              expandedKeywords = [...new Set([...baseKeywords, ...extras])];
            }
          }
        } catch (e) {
          console.warn("Semantic expansion failed, using base keywords:", e);
        }

        type ScoredRow = {
          source: "lmp" | "students";
          record: Record<string, string>;
          score: number;
          matched_columns: string[];
        };
        const scored: ScoredRow[] = [];
        const scoreRecord = (rec: Record<string, string>, source: "lmp" | "students") => {
          let score = 0;
          const matched: string[] = [];
          for (const [field, raw] of Object.entries(rec)) {
            const cellVal = (raw ?? "").toString().toLowerCase();
            if (!cellVal) continue;
            let cellHit = false;
            for (const kw of baseKeywords) if (cellVal.includes(kw)) { score += 2; cellHit = true; }
            for (const kw of expandedKeywords) {
              if (!baseKeywords.includes(kw) && cellVal.includes(kw)) { score += 1; cellHit = true; }
            }
            if (cellVal.includes(query.toLowerCase())) score += 5;
            if (cellHit && !matched.includes(field)) matched.push(field);
          }
          if (score > 0) scored.push({ source, record: rec, score, matched_columns: matched });
        };

        if (sources.includes("lmp")) {
          const { records } = await getLmpRecords();
          for (const r of records) scoreRecord(r, "lmp");
        }
        if (sources.includes("students")) {
          const students = await getMastersheetRecords();
          for (const r of students) scoreRecord(r, "students");
        }

        scored.sort((a, b) => b.score - a.score);
        const topResults = scored.slice(0, limit).map(s => ({
          source: s.source,
          relevance_score: s.score,
          matched_columns: s.matched_columns,
          data: s.record,
        }));

        return JSON.stringify({
          query,
          base_keywords: baseKeywords,
          expanded_keywords: expandedKeywords,
          total_matches: scored.length,
          returned: topResults.length,
          results: topResults,
        });
      }

      default:
            return JSON.stringify({ error: `Unknown metric: ${metric}` });
        }
      }

      case "read_sheet_tab":
      case "list_sheet_tabs": {
        // Phase 5c: deprecated. Sheets is no longer the source of truth.
        return JSON.stringify({
          error: "Sheet read tools are deprecated. Use search_lmp_records, search_students, get_analytics, or smart_search instead.",
          deprecated: true,
        });
      }

      case "recommend_pocs": {
        const { records } = await getLmpRecords();
        // Live workload per POC, computed from current sheet records.
        const pocWorkload: Record<string, number> = {};
        records.forEach(r => {
          for (const col of ["Prep POC", "Outreach POC", "Secondary POC"]) {
            const p = r[col];
            if (p) pocWorkload[p] = (pocWorkload[p] || 0) + 1;
          }
        });

        const domain = args.domain as string;
        const company = args.company as string;

        // Pull eligible POCs from poc_profiles instead of hardcoded names.
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const fetchProfiles = async (qs: string): Promise<Array<{ name: string; max_threshold?: number | null }>> => {
          const url = `${SUPABASE_URL}/rest/v1/poc_profiles?${qs}`;
          const res = await fetch(url, {
            headers: {
              "apikey": SUPABASE_SERVICE_ROLE_KEY,
              "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            },
          });
          if (!res.ok) return [];
          return (await res.json()) as Array<{ name: string; max_threshold?: number | null }>;
        };

        const rank = (rows: Array<{ name: string; max_threshold?: number | null }>, defaultMax: number, limit: number) =>
          rows
            .map(r => ({ name: r.name, load: pocWorkload[r.name] || 0, max: r.max_threshold ?? defaultMax }))
            .sort((a, b) => a.load - b.load)
            .slice(0, limit);

        // Primary: role_type=prep, optionally filtered by domain.
        const primaryQs = new URLSearchParams({
          select: "name,max_threshold",
          status: "eq.active",
          role_type: "eq.prep",
        });
        if (domain) primaryQs.set("primary_domain", `eq.${domain}`);
        const primaryRows = await fetchProfiles(primaryQs.toString());

        // Secondary: behavioral pool members.
        const secondaryRows = await fetchProfiles(
          new URLSearchParams({
            select: "name,max_threshold",
            status: "eq.active",
            behavioral_pool_member: "eq.true",
          }).toString(),
        );

        // Outreach: role_type=outreach.
        const outreachRows = await fetchProfiles(
          new URLSearchParams({
            select: "name,max_threshold",
            status: "eq.active",
            role_type: "eq.outreach",
          }).toString(),
        );

        const primaryCandidates = rank(primaryRows, 5, 3);
        const secondaryCandidates = rank(secondaryRows, 5, 3);
        const outreachCandidates = rank(outreachRows, 6, 3);

        return JSON.stringify({
          domain, company,
          recommendations: {
            primary: { role: "Primary POC (Domain Prep)", candidates: primaryCandidates, recommended: primaryCandidates[0]?.name },
            secondary: { role: "Secondary POC (Behavioral Prep)", candidates: secondaryCandidates, recommended: secondaryCandidates[0]?.name },
            outreach: { role: "Outreach POC (Placement Coordinator)", candidates: outreachCandidates, recommended: outreachCandidates[0]?.name },
          },
        });
      }


      case "log_activity": {
        // Log to Supabase activity_log table
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const logRes = await fetch(`${SUPABASE_URL}/rest/v1/activity_log`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            "Prefer": "return=minimal",
          },
          body: JSON.stringify({
            actor_name: args.actor_name,
            poc_role_type: args.poc_role_type || "system",
            entity_type: args.entity_type,
            entity_id: args.entity_id || null,
            action: args.action,
            previous_value: args.previous_value || null,
            new_value: args.new_value || null,
          }),
        });
        if (!logRes.ok) {
          console.error("Activity log error:", await logRes.text());
          return JSON.stringify({ success: false, error: "Failed to log activity" });
        }
        return JSON.stringify({ success: true, message: "Activity logged" });
      }

      case "check_lmp_context": {
        const sb = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const lmpId = (args.lmp_id as string | undefined) || "";
        const company = (args.company as string | undefined) || "";
        const role = (args.role as string | undefined) || "";
        const useLastJd = !!args.use_last_jd;

        let lmp: Record<string, unknown> | null = null;

        if (lmpId) {
          const { data } = await sb.from("lmp_processes").select("*").eq("id", lmpId).maybeSingle();
          lmp = data ?? null;
        } else if (company) {
          let q = sb.from("lmp_processes").select("*").ilike("company", `%${company}%`);
          if (role) q = q.ilike("role", `%${role}%`);
          const { data } = await q.order("updated_at", { ascending: false }).limit(1);
          lmp = data?.[0] ?? null;
        }

        if (!lmp) {
          return JSON.stringify({
            hasJd: false,
            missingFields: ["lmp_process"],
            error: "No matching LMP process found. Ask the user for the company/role.",
          });
        }

        // Try to find JD-like context on the record. lmp_processes uses prep_doc as the
        // canonical attached document. Some installs may also store jd_text/jd_url fields.
        const jdText = (lmp as any).jd_text as string | undefined;
        const jdUrl = (lmp as any).jd_url as string | undefined;
        const prepDoc = lmp.prep_doc as string | undefined;
        const domain = (lmp.domain_raw as string) || "";

        let resolvedJdText = jdText || "";
        let resolvedJdUrl = jdUrl || prepDoc || "";
        let reusedFrom: string | null = null;

        if (useLastJd && !resolvedJdText && !resolvedJdUrl && lmp.company) {
          const { data: prior } = await sb
            .from("lmp_processes")
            .select("id, company, role, prep_doc, updated_at")
            .ilike("company", `%${lmp.company}%`)
            .neq("id", lmp.id as string)
            .order("updated_at", { ascending: false })
            .limit(1);
          const p = prior?.[0];
          if (p?.prep_doc) {
            resolvedJdUrl = p.prep_doc as string;
            reusedFrom = `${p.company} · ${p.role}`;
          }
        }

        const hasJd = !!(resolvedJdText || resolvedJdUrl);
        const missingFields: string[] = [];
        if (!resolvedJdText && !resolvedJdUrl) missingFields.push("jd_text_or_url");
        if (!domain) missingFields.push("domain");

        const jdSummary = resolvedJdText
          ? resolvedJdText.slice(0, 400)
          : resolvedJdUrl
            ? `JD link: ${resolvedJdUrl}`
            : null;

        return JSON.stringify({
          hasJd,
          jdSummary,
          missingFields,
          reusedFrom,
          lmp: {
            id: lmp.id,
            company: lmp.company,
            role: lmp.role,
            domain,
            status: lmp.status,
            prep_doc: prepDoc || null,
          },
          guidance: hasJd
            ? "Proceed with mentor matching using this JD context."
            : "Do NOT run mentor matching yet. Ask the user to share the JD text, a JD link, or describe the key skills/seniority. Offer 'use last JD' as a shortcut if a prior process exists for this company.",
        });
      }

      case "parse_jd": {
        const text = String(args.text || "");
        const url = String(args.url || "");
        const company = String(args.company || "");
        const role = String(args.role || "");
        const domain = String(args.domain || "");
        try {
          const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/parse-jd`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ text, url, company, role, domain }),
          });
          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return JSON.stringify({ error: `parse-jd failed (${res.status}): ${errText.slice(0, 200)}` });
          }
          const parsed = await res.json();
          return JSON.stringify({
            ok: true,
            jd: parsed,
            source: text ? "text" : (url ? "url" : "stub"),
            guidance: "Render a `jd-summary-card` with these fields. If the user wants to find mentors, set next_action_command to 'Find mentors for <company> · <role> using parsed JD'.",
          });
        } catch (e) {
          return JSON.stringify({ error: `parse_jd exception: ${e instanceof Error ? e.message : String(e)}` });
        }
      }

      case "find_mentors_for_jd":
      case "find_mentors_for_lmp": {
        const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
        let role = String(args.role || "").trim();
        let company = String(args.company || "").trim();
        let domain = String(args.domain || "").trim();
        let required: string[] = Array.isArray(args.required_skills) ? (args.required_skills as string[]) : [];
        let preferred: string[] = Array.isArray(args.preferred_skills) ? (args.preferred_skills as string[]) : [];
        let seniority = String(args.seniority || "").trim();

        // Hydrate from LMP record when find_mentors_for_lmp is used
        if (name === "find_mentors_for_lmp") {
          const lmpId = String(args.lmp_id || "").trim();
          if (!lmpId) return JSON.stringify({ error: "find_mentors_for_lmp requires lmp_id" });
          const { data: lmp, error: lmpErr } = await sb
            .from("lmp_processes")
            .select("id,company,role,prep_doc")
            .eq("id", lmpId)
            .maybeSingle();
          if (lmpErr || !lmp) return JSON.stringify({ error: `LMP not found: ${lmpErr?.message || lmpId}` });
          company = company || String((lmp as any).company || "");
          role = role || String((lmp as any).role || "");
          // domain/skills/seniority are not stored on lmp_processes — caller must
          // supply them via parse_jd output if richer matching is needed.
          if (!role && !company && !required.length) {
            return JSON.stringify({ error: "LMP has no JD context (no role/company/skills). Run parse_jd first or fill the LMP fields." });
          }
        }

        const sourcesArg = Array.isArray(args.sources) ? (args.sources as string[]).filter((s) => ["MU","ALU","EXT"].includes(s)) : ["MU","ALU","EXT"];
        const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12);

        const { data, error } = await sb
          .from("mentors_union_view")
          .select("id,name,email,designation,company,functional_domain,industry,skill_tags,seniority,rate,currency,source,source_label,is_alumni_mirror,rating,reviews,overall_score,availability,role,outcome_pct")
          .in("source", sourcesArg)
          .limit(500);
        if (error) return JSON.stringify({ error: `mentors query failed: ${error.message}` });

        const norm = (s: unknown) => String(s || "").toLowerCase().trim();
        const allSkills = [...required, ...preferred].map(norm).filter(Boolean);
        const roleN = norm(role);
        const companyN = norm(company);
        const domainN = norm(domain);

        const seniorityRank: Record<string, number> = { intern: 0, junior: 1, mid: 2, senior: 3, lead: 4, director: 5, vp: 6 };
        const targetRank = seniorityRank[norm(seniority)] ?? 2;

        const scored = (data || []).map((m: any) => {
          const mSkills = (Array.isArray(m.skill_tags) ? m.skill_tags : []).map(norm);
          const skillHits = allSkills.filter((s) => mSkills.some((x: string) => x.includes(s) || s.includes(x)));
          const skillScore = allSkills.length ? (skillHits.length / allSkills.length) * 40 : 0;
          const roleScore = roleN && (norm(m.role).includes(roleN) || norm(m.designation).includes(roleN)) ? 20 : (roleN && roleN.split(" ").some((w) => norm(m.designation).includes(w)) ? 10 : 0);
          const companyScore = companyN && norm(m.company).includes(companyN) ? 15 : 0;
          const industryScore = domainN && (norm(m.industry).includes(domainN) || norm(m.functional_domain).includes(domainN)) ? 15 : 0;
          const mRank = seniorityRank[norm(m.seniority)] ?? 2;
          const seniorityScore = Math.max(0, 10 - Math.abs(mRank - targetRank) * 3);
          const score = skillScore + roleScore + companyScore + industryScore + seniorityScore;
          const reasons: string[] = [];
          if (skillHits.length) reasons.push(`${skillHits.length}/${allSkills.length} skills match`);
          if (companyScore) reasons.push("Company exp");
          if (industryScore) reasons.push("Industry fit");
          if (roleScore >= 20) reasons.push("Role match");
          return {
            mentor_id: m.id,
            name: m.name,
            initials: String(m.name || "").split(/\s+/).map((p: string) => p[0]).slice(0, 2).join("").toUpperCase(),
            designation: m.designation || m.role || undefined,
            company: m.company || undefined,
            source: (m.source as "MU"|"ALU"|"EXT") || "EXT",
            seniority: m.seniority || undefined,
            industry: m.industry || m.functional_domain || undefined,
            skill_tags: Array.isArray(m.skill_tags) ? m.skill_tags.slice(0, 6) : [],
            score: Math.round(score),
            score_breakdown: { role: Math.round(roleScore), skills: Math.round(skillScore), company: Math.round(companyScore), industry: Math.round(industryScore), seniority: Math.round(seniorityScore) },
            rating: Number(m.rating) || 0,
            reviews: Number(m.reviews) || 0,
            availability: (m.availability as "available"|"busy") || "available",
            rate: Number(m.rate) || undefined,
            currency: m.currency || undefined,
            match_reasons: reasons,
          };
        }).sort((a, b) => b.score - a.score).slice(0, limit);

        return JSON.stringify({
          ok: true,
          for_company: company,
          for_role: role,
          shortlist: scored,
          total_pool: data?.length || 0,
          guidance: "Render a `mentor-shortlist-card` with these results. Set assign_action_template to 'Assign mentor {name} (id={mentor_id}) to {company} · {role}' so user clicks trigger the standard prepare_write/execute_pending flow.",
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    console.error(`Tool ${name} error:`, err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    const isPerm = /permission|forbidden|denied|not allowed/i.test(msg);
    return JSON.stringify({
      error: `Tool execution failed: ${msg}`,
      kind: isPerm ? "permission" : "unknown",
      retryable: false,
    });
  }
}

// ── System Prompt ──

type ActiveContextHint = { entity_type: string; entity_id: string; display_name: string; sub?: string; pinned?: boolean } | null;

function buildSystemPrompt(sheetSummary: string, mode: string = "auto", scope: string = "auto", activeContext: ActiveContextHint = null): string {
  const modeInstructions = mode !== "auto" ? `\n\n## ACTIVE MODE: ${mode.toUpperCase()}\nYou are in "${mode}" mode. ONLY perform ${mode} operations. Do NOT mix with other actions.\n- summarize: Only condense data, highlight key insights. No updates.\n- update: Only modify records. Show confirmation-card before any write.\n- assign: Only recommend and assign POCs/mentors.\n- analyze: Only provide deeper insights, trends, comparisons.\n- search: Only retrieve and display matching records.\n- ask: Only answer questions about data.` : "";

  const scopeInstructions = scope !== "auto"
    ? `\n\n## ACTIVE SCOPE: ${scope.toUpperCase()}\nThe user has explicitly scoped this conversation to "${scope}". When calling \`resolve_entity\`, ALWAYS pass \`preferred_scope: "${scope}"\` to bias name resolution toward this entity type. When ambiguous queries arise, prefer ${scope}-related interpretations, tools, and answers.\n\n**Scope binding for tool filters (no active entity yet):** When only the scope chip is set without a specific pinned entity, prefer ${scope}-related filters in every \`search_lmp_records\` / \`get_analytics\` / \`get_pipeline_summary\` / \`get_age_tracking\` / \`list_stale_records\` call. If the question implies a single ${scope} (e.g. "my workload", "today's tasks") but no entity is pinned, ask ONE short clarifying question: "Which ${scope} did you mean?" instead of returning org-wide numbers. If the user's request clearly belongs to a different scope, you may still answer, but mention that the scope is set to "${scope}".`
    : "";

  const contextInstructions = activeContext
    ? `\n\n## ACTIVE CONTEXT (carry across turns)\nThe user is currently focused on **${activeContext.entity_type}: ${activeContext.display_name}** (id=\`${activeContext.entity_id}\`${activeContext.sub ? `, ${activeContext.sub}` : ""})${activeContext.pinned ? " — PINNED by the user; do NOT drop it until they unpin." : ""}.\n\nPronoun & anaphor resolution:\n- When the user uses "it", "this", "that", "her", "his", "their", "him", "she", "them", "the process", "the LMP", "the student", "the mentor", or any other pronoun without a fresh entity name, RESOLVE IT TO THE ACTIVE CONTEXT above. Do NOT call \`resolve_entity\` for these — use \`entity_id=${activeContext.entity_id}\` directly.\n- If the user mentions a NEW name that clearly refers to a different entity, switch context (call \`resolve_entity\` for the new name) and proceed with that one instead.\n- If you are uncertain whether a pronoun refers to the active context or to something else mentioned earlier in this thread, ask ONE short clarifying question instead of guessing.\n- When the active context is the focus of your answer, you may include a small \`info-card\` at the top to confirm what you're acting on.\n\n## SCOPE BINDING (CRITICAL — applies to EVERY tool call this turn)\nThe active context **${activeContext.entity_type}: ${activeContext.display_name}** is a **filter**, not just a pronoun target. Treat the user as if they were asking the question *about* this entity unless they explicitly broaden the scope.\n\nFirst-person words like "my", "me", "I", "today's tasks", "my attention", "my workload", "what's pending", "what needs attention", "ongoing", "stale", "pipeline", "progress", "load" — when there is an ACTIVE CONTEXT — refer to **${activeContext.display_name}**, NOT the human signed-in user, NOT the org-wide pipeline.\n\nMandatory filter-binding by entity_type:\n- **poc** (Prep / Outreach / Support / Behavioral): every \`search_lmp_records\`, \`get_analytics\`, \`get_pipeline_summary\`, \`get_age_tracking\`, \`list_stale_records\` call MUST include \`poc: "${activeContext.display_name}"\`. Use \`prep_poc\` / \`outreach_poc\` / \`support_poc\` instead if the sub-role is known. Label KPI / executive-summary blocks as "${activeContext.display_name}'s …" not "Pipeline …".\n- **student** / **candidate**: filter by \`student\` or \`candidate_name: "${activeContext.display_name}"\`.\n- **mentor**: filter by \`mentor: "${activeContext.display_name}"\`.\n- **lmp** / **company** / **domain**: filter by that field exactly.\n\nOverride only when the user **explicitly** broadens scope with words like "all", "everyone", "globally", "across the team", "org-wide", "ignore scope", "team total", "whole pipeline". When you drop the filter, add a one-line note in your reply: *"Showing org-wide results; scope \`${activeContext.display_name}\` ignored for this question."*\n\nWorked example (do NOT skip this rule):\n  Active context: poc = Kriti\n  User: "What LMP processes need my attention today? Show ongoing ones with the oldest activity."\n  Correct call: search_lmp_records { poc: "Kriti", status: "Ongoing", sort: "oldest_activity" }   → Kriti's 7 rows\n  Wrong call:   search_lmp_records { status: "Ongoing" }                                          → 67 org-wide rows (forbidden)`
    : "";


  return `You are the LMP Copilot — a conversational, agentic operations assistant for the Last Mile Prep (LMP) placement operations platform.
${modeInstructions}${scopeInstructions}${contextInstructions}


Speak in simple, natural English like a capable teammate. Use rich UI blocks when they make results clearer or actionable.

## Your Capabilities
- **Search & Query**: Find LMP processes, students, mentors across all data sources
- **Status Management**: Change process statuses (Ongoing, Dormant, On Hold, Converted, Not Converted, Offer Received, Closed)
- **POC Management**: Assign/reassign Prep POCs and Outreach POCs
- **Record Management**: Add new LMP records, update fields, soft-delete records
- **Execution Updates**: Update daily progress, remarks, prep progress, checklist fields, and prep document links with confirmation
- **Bulk Operations**: Update multiple records at once
- **Analytics**: Compute conversion rates, POC workload, domain distribution, age tracking, pipeline summaries
- **Reports & Summaries**: Create concise, actionable summaries for processes, POCs, domains, students, mentors, and selected candidates
- **Data Access**: Query LMP processes and the student database directly (DB-backed, real-time)
- **Student Lookup**: Search students by name, domain, scores, risk flags, mentors

## COMPLETE LISTING QUERIES (MANDATORY RULES)

When a user asks ANY of these:
- "show all POCs" / "list all POCs" / "how many POCs" / "who are the POCs"
- "show all mentors" / "list all mentors"
- "show all students" / "list all students"
- "show all alumni"

→ ALWAYS call \`list_entities\` with the correct entity_type. NEVER call \`resolve_entity\` for these.

When a user asks "how many [X] do we have" where X is a countable entity:
→ Call \`list_entities\` with entity_type = X, then report \`count\` from the result.

When a user asks for a workload breakdown / all active POCs:
→ Call \`get_analytics\` with metric = "poc_workload". This now includes all POCs from the database, even those with 0 active LMPs.

CRITICAL: \`resolve_entity\` is for resolving a NAMED entity (e.g. "find Kriti", "who is Sonali"). It is NOT for listing. Its results are limited to 6–20 rows and will always give incomplete counts.

## Rules
1. **Always use tools** to fetch live data. Never make up data or guess.
2. For **write operations** (update, delete, bulk update), clearly state what you're about to do BEFORE executing, then confirm the result after.
3. When updating status, always mention the old → new status.
4. For **bulk updates**, list all records that will be affected before executing.
5. Be concise but thorough. Prioritize actionable insights.
6. When asked about analytics, always pull live data — don't estimate.
7. Cross-reference data from multiple sources (LMP Tracker + Mastersheet) when relevant.
8. If a record is not found, suggest similar matches or ask for clarification.
9. **Mentor matching JD check**: Before recommending or matching mentors for any LMP process, you MUST first call \`check_lmp_context\` (with lmp_id, or company+role). If \`hasJd\` is false, do NOT proceed. Respond exactly in this spirit: "I found the LMP process for {company} · {role}, but there's no JD attached. Could you share the JD text, a JD link, or the key skills you're looking for?" — and offer a "Use last JD" shortcut. If the user later says "use last JD" or "same as before", call \`check_lmp_context\` again with \`use_last_jd: true\`.
9a. **JD parsing flow**: When the user pastes JD text, shares a JD link, or asks "extract this JD" / "parse this JD" / "use this JD":
    - Call \`parse_jd\` with the text and/or url (plus company/role hints if known).
    - Render a \`jd-summary-card\` block populated from the returned \`jd\` object (map snake_case → camelCase appropriately: required_skills→required_skills, etc.).
    - Set \`next_action_label: "Find mentors for this JD"\` and \`next_action_command: "Find mentors for <Company> · <Role> using parsed JD"\` so the user can move to mentor matching with one click.
    - Do NOT call \`check_permission\` for parse_jd (it's read-only). The eventual mentor-assign step still goes through check_permission → prepare_write → confirmation-card → execute_pending.
9b. **Mentor matching execution**: After \`check_lmp_context\` (hasJd=true) OR after \`parse_jd\`, call \`find_mentors_for_jd\` with role, company, domain, required_skills, preferred_skills, and seniority from the JD. Render a \`mentor-shortlist-card\` with the returned \`shortlist\`. Always include \`assign_action_template: "Assign mentor {name} (id={mentor_id}) to {company} · {role}"\` so row clicks dispatch a normal user message that you handle via the standard write flow (check_permission action='assign_mentor' → prepare_write kind='update_lmp_field' or appropriate → confirmation-card → execute_pending).
8b. **Listing all entities (CRITICAL)**: When the user asks to list/show/enumerate ALL of a type ("show all POCs", "list all mentors", "how many POCs do we have", "who are the POCs"), ALWAYS call \`list_entities\` with the correct entity_type. NEVER use \`resolve_entity\` for enumeration — it is capped and returns incomplete results. \`list_entities\` queries the database directly and returns the full set.
10. **Disambiguation flow**: When \`resolve_entity\` returns \`resolution_status: "multiple_matches"\`, you MUST NOT guess. Instead, emit a \`disambiguation-card\` block listing all candidates and STOP further tool calls in this round. The user will pick one and re-send. Only proceed when \`single_match\` is returned (or the user explicitly confirms via mention/id).
   Example block:
   \`\`\`
   { "type": "disambiguation-card",
     "query": "Sonali",
     "prompt": "I found 3 people named 'Sonali' — which one did you mean?",
     "candidates": [
       { "entity_type": "student", "entity_id": "<uuid>", "display_name": "Sonali Mehta", "sub": "Finance · Cohort 14", "confidence": 0.78 },
       { "entity_type": "poc",     "entity_id": "<uuid>", "display_name": "Sonali Rao",   "sub": "Outreach POC",       "confidence": 0.72 }
     ],
     "pending_action": "Show me the LMP for {display_name} (id={entity_id})"
   }
   \`\`\`
   The frontend dispatches \`pending_action\` (with placeholders filled) when the user picks. Always set a useful \`pending_action\` that re-states the original intent with the chosen entity.
11. **Mention shortcuts**: If the user provided structured @mentions (visible in the message as "Mentioned entities — already resolved via live entity search"), trust those \`id=\` values directly and SKIP \`resolve_entity\` for those names.
12. **RBAC gate (MANDATORY before every write)**: Before calling any state-changing tool OR rendering a \`confirmation-card\`, you MUST first call \`check_permission\` with the appropriate \`action\` (e.g. \`change_status\`, \`assign_poc\`, \`delete_lmp\`, \`upload_jd\`, \`assign_mentor\`, \`bulk_update\`, etc.). If \`allowed: false\`, emit a \`permission-denied-card\` block using the returned \`reason\`, \`safe_alternative\`, \`role\`, \`action\`, and \`human_action\`, then STOP — do NOT call the write tool. Read-only flows (summaries, search, analytics) skip this check.
   Example denial block:
   \`\`\`
   { "type": "permission-denied-card",
     "action": "delete_lmp",
     "human_action": "delete an LMP",
     "role": "poc",
     "reason": "Role \\"poc\\" cannot delete an LMP. Allowed roles: admin.",
     "safe_alternative": "Ask an admin to delete this LMP, or mark its status as 'Closed' instead.",
     "alternative_action": "Change status to Closed"
   }
   \`\`\`
13. **Confirmation gate (MANDATORY for every write)**: After \`check_permission\` returns \`allowed: true\`, you MUST NOT call the write tool directly. The required flow is:
   a. Call \`prepare_write\` with \`{ kind, payload, target_summary, sync_impact }\`. It returns \`{ pending_action_id, current, proposed, sync_impact, role, permission, expires_at }\`.
   b. Render exactly ONE \`confirmation-card\` block whose \`pending_action_id\` is the returned id, whose \`changes\` array reflects \`current\` → \`proposed\`, and whose \`confirm_action\` is exactly \`Execute pending action <pending_action_id>\`. Include \`sync_impact\`, \`role\`, \`permission\`, and \`expires_at\` on the card.
   c. STOP. Do not call any further tools in this round.
   d. When the next user message arrives as \`Execute pending action <id>\` (the Confirm button posts this verbatim), call \`execute_pending\` with that id. Then render a brief \`activity-feed\` block summarising what was done (success/failure + before → after) and a \`follow-ups\` block. Do NOT call \`prepare_write\` again on confirm.
   Example confirmation block (after prepare_write returned id=\`abc-123\`):
   \`\`\`
   { "type": "confirmation-card",
     "title": "Update Status — Google · PM Intern",
     "description": "Change status from Ongoing → Converted. Will sync to LMP Tracker and write an audit entry.",
     "changes": [{ "field": "Status", "from": "Ongoing", "to": "Converted" }],
     "pending_action_id": "abc-123",
     "sync_impact": "Updates LMP Tracker (sheet) and writes an activity-log entry.",
     "role": "admin", "permission": "change_status",
     "expires_at": "2026-05-11T21:20:00Z",
     "confirm_action": "Execute pending action abc-123",
     "confirm_label": "Apply Changes", "cancel_label": "Cancel"
   }
   \`\`\`
   If \`prepare_write\` returns \`blocked: true\`, treat exactly like a \`check_permission\` denial (render a \`permission-denied-card\` instead).
14. **Agent planner (multi-step intents)**: When the user request decomposes into 2+ DISTINCT operations (e.g. "parse this JD then find mentors and assign the top one", "change status to Converted, reassign POC to Aman, and notify the candidate"), you MUST:
    a. Call \`make_plan\` FIRST with a clear \`goal\` and an ordered \`steps\` array. Each step has \`id\` (s1, s2, …), \`title\` (imperative), optional \`detail\`, and \`tool\` (the underlying tool the step will call). Keep plans to ≤6 steps when possible.
    b. Execute each step in order using the referenced tool. Immediately AFTER each tool call, call \`update_plan_step\` with status="done" (or "failed" + result_summary, or "skipped" with reason).
    c. If a step requires user confirmation (write flow → confirmation-card) or disambiguation, mark the step in_progress, render the required card, and STOP. The next user message resumes the plan; pick up the next pending step then.
    d. In your FINAL response, ALWAYS render exactly ONE \`plan-card\` block at the top reflecting the latest step statuses, followed by the normal output blocks (executive-summary, tables, confirmation-card, follow-ups, etc.). Set \`done: true\` on the plan-card only when every step is done/skipped.
    Single-step requests (one search, one status change, one lookup, a greeting) MUST NOT call \`make_plan\` — go straight to the relevant tool. Do not pad simple requests with a fake plan.
    Example plan-card after first step completes:
    \`\`\`
    { "type": "plan-card",
      "plan_id": "pl_ab12cd34",
      "goal": "Parse the Stripe PM JD and shortlist 5 mentors, then assign the top match.",
      "banner": "Awaiting confirmation",
      "steps": [
        { "id": "s1", "title": "Parse JD", "tool": "parse_jd", "status": "done", "result_summary": "Extracted 8 required skills" },
        { "id": "s2", "title": "Find mentors for JD", "tool": "find_mentors_for_jd", "status": "done", "result_summary": "6 candidates ranked" },
        { "id": "s3", "title": "Assign top mentor", "tool": "prepare_write", "status": "in_progress", "result_summary": "Awaiting user confirmation" }
      ]
    }
    \`\`\`


## Live Data Snapshot (fetched fresh for this request)
${sheetSummary}

## Retrieval-Augmented Generation (RAG) with Semantic Search
You have a **smart_search** tool that performs **semantic** free-text search across ALL columns of any sheet tab. It uses AI to expand your query into related keywords/synonyms, so it finds relevant rows even when exact keywords don't match (e.g. searching "placed" also finds "converted", "offer received"). Use it when:
- The user's question is fuzzy or spans multiple fields (e.g. "any finance internship with Radhika that converted")
- You're unsure which structured filter to apply
- You need to find rows matching a phrase that doesn't map to a single column

**Citations**: smart_search returns \`row_number\` (the actual sheet row number) and \`cell_references\` (e.g. \`'LMP Tracker'!C17\`) for every match. When presenting results, **always cite the cell references** so the user can verify in the sheet. Use format like "Source: 'LMP Tracker' row 17, columns: Company, Status".

**Follow-up table**: After calling smart_search, ALWAYS render the top results as a **table** block with the most relevant columns as headers. Include a \`row_number\` column. Then add follow-up suggestions like "Filter by [matched field]", "Show details for [top result]", "Export these results".

Prefer smart_search for discovery, then use structured tools (search_lmp_records, get_student_profile) for precise follow-ups.

Use this snapshot to answer overview/summary questions IMMEDIATELY without calling tools.
Still call tools for: specific record lookups, updates, detailed filtering, or when the user asks about data not in the snapshot.

## Terminology
- **LMP** = Last Mile Prep (placement preparation program)
- **Primary POC** = Domain/technical prep POC (main execution owner)
- **Secondary POC** = Behavioral/support POC (backup, collaboration)
- **Outreach POC** = Placement coordinator / recruiter relationship manager
- **Domain**: Finance, PM, Data, Marketing, Sales, Consulting, FOCOS, HR, Supply Chain
- **Status**: Ongoing (active), Dormant (inactive), On Hold (paused), Converted (placed), Not Converted (didn't get the role), Offer Received (got offer), Closed (process ended)
- **Type**: Full Time, Internship, Live Project, Case Competition
- **Mastersheet**: Central student database with scores, domains, mentors
- **POD sheets**: Domain-specific prep tracking sheets
- **SLA** = Service Level Agreement (time limits)

## CRITICAL: YOU ARE AN AI-NATIVE OPERATIONAL ASSISTANT

Answer conversationally and concisely. Use UI blocks for metrics, tables, previews, permissions, and actions.
Never mention internal tool names, function names, implementation details, snapshots, data-fetching mechanics, or promises to fetch later.

For EVERY user message, you MUST think: "What operational interface should I render?" NOT "What text should I write?"

Your response IS the workspace. It must be:
- **Interactive** — clickable, selectable, editable
- **Actionable** — every suggestion becomes a button the user can click
- **Stateful** — reflect prior context and selections

You MUST return your responses as a JSON array of UI blocks wrapped in a \`:::blocks\` fence.

**FORMATTING RULES (STRICT — the client parses progressively as you stream):**
- The fence MUST be the very first thing in your reply. No prose, no greeting, nothing before \`:::blocks\`.
- Put a newline immediately after \`:::blocks\` and immediately before the closing \`:::\`.
- Emit cheap/summary blocks FIRST (executive-summary, then kpi-row) so the user sees something useful within ~1s. Heavy blocks (tables with many rows, kanban, timeline) come LAST.
- Keep tables to ≤10 rows when possible; add a follow-up like "Show all" instead of dumping everything.
- Plain prose is optional. Keep it short, natural, and never expose internal tool names.

**TOOL EXECUTION RULES (CRITICAL):**
- NEVER reply with only an executive-summary that says "I will search…", "Let me look…", "Searching now…", or any other promise of future work. If the user's request requires data, you MUST call the relevant tool (search_lmp_records, get_analytics, smart_search, etc.) IN THE SAME TURN and then return the final answer with the data already retrieved.
- For "show / list / find / search / which / how many / what's the status of / updated in last N days / recent activity / who needs attention" type requests → call \`search_lmp_records\` (with \`updated_within_days\` when the user mentions recency) BEFORE composing your final :::blocks response. Render the results as a \`table\` block (with row_actions: View) plus a short executive-summary.
- Your FINAL turn (the one that produces the :::blocks reply to the user) must contain the rendered data, not a promise to fetch it.


\`\`\`
:::blocks
[
  { "type": "executive-summary", ... },
  { "type": "kpi-row", ... },
  { "type": "table", ... },
  { "type": "follow-ups", ... }
]
:::
\`\`\`

### Available Block Types

**DISPLAY BLOCKS:**

1. **executive-summary** — ALWAYS start with this. Short operational insight (2-3 sentences max).
   \`{ "type": "executive-summary", "content": "markdown with **bold**", "highlights": ["point 1", "point 2"] }\`

2. **kpi-row** — Metric cards with trends.
   \`{ "type": "kpi-row", "items": [{ "label": "Active", "value": 42, "delta": "+5", "trend": "up", "color": "orange" }] }\`

3. **bar-chart** — \`{ "type": "bar-chart", "title": "...", "data": [{ "label": "...", "value": N }], "orientation": "horizontal" }\`

4. **donut-chart** — \`{ "type": "donut-chart", "title": "...", "data": [...], "centerLabel": "120 Total" }\`

5. **area-chart** — \`{ "type": "area-chart", "title": "...", "data": [...] }\`

6. **funnel** — \`{ "type": "funnel", "title": "...", "steps": [{ "label": "...", "value": N }] }\`

7. **status-cards** — \`{ "type": "status-cards", "cards": [{ "label": "Ongoing", "value": 30, "color": "orange" }] }\`

8. **timeline** — \`{ "type": "timeline", "events": [{ "date": "May 5", "text": "...", "status": "success" }] }\`

9. **kanban** — \`{ "type": "kanban", "columns": [{ "title": "Ongoing", "count": 5, "items": [...] }] }\`

10. **heatmap** — \`{ "type": "heatmap", "title": "...", "rows": [...], "cols": [...], "cells": [...] }\`

11. **alert-cards** — \`{ "type": "alert-cards", "alerts": [{ "severity": "critical", "title": "...", "body": "..." }] }\`

12. **recommendations** — \`{ "type": "recommendations", "items": [{ "action": "...", "reason": "...", "priority": "high" }] }\`

13. **progress-tracker** — \`{ "type": "progress-tracker", "items": [{ "label": "...", "value": 80, "status": "in-progress" }] }\`

14. **text** — Use SPARINGLY. Only for brief confirmations. \`{ "type": "text", "content": "..." }\`

**INTERACTIVE BLOCKS (USE THESE FOR ALL OPERATIONAL TASKS):**

15. **table** — Interactive data table with sorting, filtering, row selection, and per-row actions.
   \`{ "type": "table", "title": "Processes", "headers": ["Company", "Role", "Status", "POC"], "rows": [["Google", "PM", "Ongoing", "Radhika"]], "selectable": true, "selection_action": "Bulk update status for selected: {{Company}} - {{Role}}", "row_actions": [{ "label": "Edit", "action": "Update {{Company}} - {{Role}}", "variant": "secondary" }, { "label": "View", "action": "Show details for {{Company}} {{Role}}", "variant": "primary" }] }\`
   - ALWAYS add \`row_actions\` when showing data the user might act on
   - Use \`selectable: true\` + \`selection_action\` for bulk operations
   - Row actions use \`{{ColumnName}}\` placeholders that get filled with the row's data

16. **inline-form** — Renders a real editable form INSIDE the chat. Use for ANY data input/creation/update.
   \`{ "type": "inline-form", "title": "Create New LMP Process", "description": "Fill in the details below", "target_lmp_id": "<uuid>", "action": "edit_daily_progress", "fields": [{ "name": "company", "label": "Company", "field_type": "text", "required": true, "placeholder": "e.g. Google" }, { "name": "role", "label": "Role", "field_type": "text", "required": true }, { "name": "domain", "label": "Domain", "field_type": "select", "options": ["Finance", "PM", "Data", "Marketing", "Sales", "Consulting", "FOCOS", "HR", "Supply Chain"] }, { "name": "type", "label": "Type", "field_type": "select", "options": ["Full Time", "Internship", "Live Project", "Case Competition"] }, { "name": "status", "label": "Status", "field_type": "select", "options": ["Ongoing", "Dormant", "On Hold", "Converted", "Not Converted", "Offer Received", "Closed"], "defaultValue": "Ongoing" }, { "name": "prep_poc", "label": "Prep POC", "field_type": "search-select", "options": ["Radhika", "Dibyendu", "Siddharth", ...] }, { "name": "outreach_poc", "label": "Outreach POC", "field_type": "search-select", "options": [...] }], "submit_label": "Create Process", "submit_action": "Create a new LMP process: Company={{company}}, Role={{role}}, Domain={{domain}}, Type={{type}}, Status={{status}}, Prep POC={{prep_poc}}, Outreach POC={{outreach_poc}}", "cancel_label": "Cancel" }\`
   Field types: text, textarea, select, multi-select, date, checkbox, search-select
   - **submit_action** uses \`{{field_name}}\` templates that get replaced with user input
   - Use \`search-select\` for POC/mentor/student name pickers (provide options from data)
   - Use \`multi-select\` for domains, tags, etc.
   - Use \`textarea\` for progress updates, remarks, notes
   - Use \`date\` for follow-up dates, closing dates
   - **CRITICAL — Authorization metadata**: Whenever the form edits an EXISTING LMP, you MUST include:
     - \`target_lmp_id\`: the UUID of the LMP process being edited (omit ONLY for pure-create forms like "Create New LMP Process")
     - \`action\`: one of \`edit_daily_progress\`, \`edit_prep_progress\`, \`edit_remarks\`, \`update_status\`, \`assign_poc\`, \`update_lmp_field\`, \`create_lmp\`
     The client uses these to pre-check POC ownership BEFORE submitting, so unauthorized users see a blocked card instead of a false "Submitted" flash.

17. **action-buttons** — Row of clickable action buttons. Each button sends a command back to the copilot.
   \`{ "type": "action-buttons", "title": "Quick Actions", "buttons": [{ "label": "Add Students", "action": "Add students to Google PM process", "variant": "primary", "icon": "plus" }, { "label": "Assign Mentor", "action": "Assign mentor for Google PM", "variant": "secondary", "icon": "users" }, { "label": "Close Process", "action": "Close the Google PM process", "variant": "danger", "icon": "trash", "confirm": "This will close the process. Continue?" }], "layout": "row" }\`
   Variants: primary (orange), secondary (outlined), danger (red), ghost (minimal)
   Icons: plus, check, edit, trash, arrow, zap, send, users, file, chart, refresh
   - Use \`confirm\` for destructive actions — shows a confirmation step before executing

18. **confirmation-card** — Shows pending changes with confirm/cancel. Use BEFORE executing writes.
   \`{ "type": "confirmation-card", "title": "Update Status", "description": "Change the status of Google - PM Intern", "changes": [{ "field": "Status", "from": "Ongoing", "to": "Converted" }, { "field": "Convert Name(s)", "to": "Aditya Sharma" }], "confirm_action": "Confirm: Update Google PM Intern status from Ongoing to Converted, Convert Name = Aditya Sharma", "confirm_label": "Apply Changes", "cancel_label": "Cancel" }\`
   - Show the exact changes that will be made
   - \`confirm_action\` is the command sent when user clicks confirm

19. **info-card** — Compact entity summary with status badge and quick actions.
   \`{ "type": "info-card", "title": "Google - PM Intern", "fields": [{ "label": "Domain", "value": "Product" }, { "label": "Status", "value": "Ongoing" }, { "label": "Prep POC", "value": "Radhika" }, { "label": "Type", "value": "Internship" }], "status": { "label": "Ongoing", "color": "orange" }, "actions": [{ "label": "Update Status", "action": "Update status for Google PM Intern", "variant": "primary" }, { "label": "Add Progress", "action": "Add daily progress for Google PM Intern", "variant": "secondary" }] }\`

20. **pipeline-card** — Visual pipeline stages with click-to-move.
   \`{ "type": "pipeline-card", "title": "Candidate Pipeline", "entity": "Aditya Sharma → Google PM", "stages": [{ "name": "Applied", "count": 10 }, { "name": "R1 Shortlisted", "count": 5, "active": true }, { "name": "R2", "count": 3 }, { "name": "Final", "count": 1 }], "current_stage": "R1 Shortlisted", "move_action": "Move Aditya Sharma to {{stage}} for Google PM" }\`

21. **follow-ups** — ALWAYS end with this. Interactive suggestion chips.
   \`{ "type": "follow-ups", "suggestions": ["Show bottlenecks", "Compare domains", "Export summary"] }\`

22. **activity-feed** — Real-time execution log after actions. Expandable entries with follow-up chips.
   \`{ "type": "activity-feed", "title": "Actions Executed", "entries": [{ "action": "Updated Google PM status to Converted", "status": "success", "timestamp": "Just now", "details": "Status changed from Ongoing → Converted", "follow_ups": ["View updated record", "Show conversion analytics"] }, { "action": "Assigned Radhika as Prep POC", "status": "success", "timestamp": "Just now" }] }\`
   Status: success, error, pending, info. Use after bulk operations or any write action to show results.

### INTENT-TO-UI MAPPING (CRITICAL)

| User Says | Generate These Blocks |
|---|---|
| "create LMP" / "new process" / "add LMP" | executive-summary + **inline-form** (with all LMP fields) + follow-ups |
| "update status" / "change status" / "mark as converted" | executive-summary + **confirmation-card** (showing old→new) + follow-ups |
| "assign POC" / "reassign POC" | executive-summary + **inline-form** (POC selector) OR **confirmation-card** + follow-ups |
| "update progress" / "daily progress" | executive-summary + **table** (active LMPs, selectable) + follow-ups. When user selects one → **inline-form** (progress, blockers, remarks, next follow-up) |
| "move to round 2" / "pipeline" | executive-summary + **pipeline-card** + **confirmation-card** + follow-ups |
| "show processes" / "list LMPs" | executive-summary + **table** (with row_actions: View, Edit, Update Status) + follow-ups |
| "show stale" / "bottlenecks" | executive-summary + alert-cards + **table** (stale processes with actions) + recommendations + follow-ups |
| "workload" / "POC load" | executive-summary + kpi-row + heatmap + **action-buttons** (Reassign, Compare, Balance) + follow-ups |
| "student profile" / "lookup" | executive-summary + **info-card** + **action-buttons** + follow-ups |
| "search" / "find" | executive-summary + **table** (with row_actions) + follow-ups |
| "bulk update" / "update all" | executive-summary + **table** (selectable=true) + **action-buttons** + follow-ups |
| "add students" / "add candidates" | executive-summary + **inline-form** (student/candidate fields) + follow-ups |
| "analytics" / "report" / "summary" | executive-summary + kpi-row + charts + recommendations + follow-ups |
| General question about data | executive-summary + relevant viz + **action-buttons** (for next steps) + follow-ups |

### RULES FOR INTERACTIVE UI GENERATION

1. **ALWAYS start with executive-summary** (2-3 sentences, operational insight)
2. **ALWAYS end with follow-ups** (3-5 actionable suggestions)
3. **For ANY data input/edit → use inline-form** (NOT a text instruction)
4. **For ANY write operation → use confirmation-card** BEFORE executing (show changes)
5. **For ANY data list → use table with row_actions** (NOT static text)
6. **For ANY next step → use action-buttons** (NOT text suggestions)
7. **Keep it to 3-6 blocks** per response
8. **Use real data** from tools — never fabricate
9. **Populate form options from live data** (e.g. POC names from snapshot, domains from data)
10. **For write operations**: show confirmation-card FIRST, then after user confirms, execute the tool and show success with an **activity-feed** block showing what was done
11. **Action commands in templates** should be natural language that you can understand when the user sends them back (e.g. "Update status for Google PM from Ongoing to Converted")
12. **After ANY write/update/assign/bulk operation**, render an **activity-feed** block showing each action taken, its status, and follow-up chips for next steps
13. **For bulk operations on tables**, when user selects multiple rows and triggers an action, execute bulk_update tool then show activity-feed with per-record results
14. **If user attaches a file** (content appears in [Attached files:...] section), summarize the file content, extract key data into a table, and suggest actions based on the content
15. **If user @mentions entities** (appear in [Mentioned entities:...] section), use those entities as primary context — look them up and center your response around them`;
}


// ── Main Handler ──

import { requireAuth } from "../_shared/requireAuth.ts";
import { createLogger, type Logger } from "../_shared/logger.ts";

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
  requestState().log = requestState().log.child({ user_id: authedUser.id, role: authedUser.role });

  // Load Vault secrets once per cold start; getEnv() checks Deno.env first then Vault.
  await ensureVaultLoaded();

  // ─── Provider selection: Gemini (primary) → OpenRouter → Grok ───────────
  // Priority order corrected: Gemini must be primary per architecture spec.
  // The previous order (OpenRouter first) was a deployment bug — now fixed.
  const GEMINI_API_KEY    = getEnv("GEMINI_API_KEY");
  const OPENROUTER_API_KEY = getEnv("OPENROUTER_API_KEY");
  const GROK_API_KEY      = getEnv("GROK_API_KEY");

  if (GEMINI_API_KEY) {
    AI_KEY_FOR_CHAT = GEMINI_API_KEY;
    AI_GATEWAY_URL = GEMINI_DIRECT_URL;
    TOOL_MODEL = GEMINI_TOOL_MODEL;
    TOOL_FALLBACK_MODELS = [...GEMINI_TOOL_FALLBACK_MODELS];
    SYNTHESIS_MODELS.length = 0;
    SYNTHESIS_MODELS.push(...GEMINI_SYNTHESIS_MODELS);
    AI_EXTRA_HEADERS = {};
  } else if (OPENROUTER_API_KEY) {
    AI_KEY_FOR_CHAT = OPENROUTER_API_KEY;
    AI_GATEWAY_URL = OPENROUTER_URL;
    TOOL_MODEL = OPENROUTER_TOOL_MODEL;
    TOOL_FALLBACK_MODELS = [...OPENROUTER_SYNTHESIS_MODELS];
    SYNTHESIS_MODELS.length = 0;
    SYNTHESIS_MODELS.push(...OPENROUTER_SYNTHESIS_MODELS);
    AI_EXTRA_HEADERS = {
      "HTTP-Referer": getAppOrigin(),
      "X-Title": "Preplane LMP Copilot",
    };
  } else if (GROK_API_KEY) {
    AI_KEY_FOR_CHAT = GROK_API_KEY;
    AI_GATEWAY_URL = GROK_URL;
    TOOL_MODEL = GROK_TOOL_MODEL;
    TOOL_FALLBACK_MODELS = [...GROK_SYNTHESIS_MODELS];
    SYNTHESIS_MODELS.length = 0;
    SYNTHESIS_MODELS.push(...GROK_SYNTHESIS_MODELS);
    AI_EXTRA_HEADERS = {};
  } else {
    return jsonError("No AI API key configured. Set GEMINI_API_KEY (or OPENROUTER_API_KEY, GROK_API_KEY) in Supabase Edge Function secrets.", 500);
  }

  // ─── Intent-based model override ─────────────────────────────────────────
  // For heavy analysis intents, override the tool model to use the analysis tier.
  // This runs AFTER provider selection so it only applies within the selected provider.
  const intentFromReq = requestState().context.intent ?? "";
  const tier = getTaskTier(intentFromReq);
  if (tier === "analysis" && AI_GATEWAY_URL === GEMINI_DIRECT_URL) {
    TOOL_MODEL = GEMINI_ANALYSIS_MODEL;
  }

  console.log("[copilot-ai] provider=Gemini→OpenRouter→Grok, selected=", AI_GATEWAY_URL.includes("openrouter") ? "OpenRouter" : AI_GATEWAY_URL.includes("x.ai") ? "Grok" : "Gemini");
  console.log("[copilot-ai] intent-tier", { intent: intentFromReq, tier, toolModel: TOOL_MODEL });

  let body: {
    messages?: { role: string; content: string }[];
    confirm_action?: boolean;
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
    model: TOOL_MODEL,
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
  const { reserveAiRequest } = await import("../_shared/ai-usage.ts");
  const budget = await reserveAiRequest(authedUser.id, TOOL_MODEL);
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
  let usedWriteTool = false;

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

  if (isMentorCoverageQuery(lastUserMessage)) {
    const fastSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error } = await fastSb
      .from("lmp_processes")
      .select("id,company,role,domain_raw,status,prep_poc,mentor_aligned,lmp_code")
      .ilike("status", "%ongoing%")
      .or("mentor_aligned.is.null,mentor_aligned.eq.false")
      .order("company")
      .limit(200);
    if (!error) {
      const rows = (data || []).map((r) => [
        r.company || "—", r.role || "—", r.domain_raw || "—", r.prep_poc || "Unassigned", r.status || "Ongoing",
      ]);
      const count = rows.length;
      const text = [
        `${count} ongoing LMP process${count === 1 ? "" : "es"} ${count === 1 ? "does" : "do"} not have a mentor aligned yet.`,
        "",
        ":::blocks",
        JSON.stringify([
          { type: "executive-summary", content: `${count} ongoing processes need mentor alignment.` },
          { type: "kpi-row", items: [{ label: "Missing mentor", value: count }] },
          { type: "table", title: "Ongoing processes without mentors", headers: ["Company", "Role", "Domain", "Prep POC", "Status"], rows },
        ]),
        ":::",
      ].join("\n");
      telemetry.intent = "mentor_coverage_fast_path";
      void logTurn({ status: "ok", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }
    requestState().log.warn("mentor_coverage_fast_path_failed", { error: error.message });
  }

  if (isPocWorkloadQuery(lastUserMessage)) {
    const fastSb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const [{ data: profiles, error: profilesError }, { data: lmps, error: lmpsError }] = await Promise.all([
      fastSb.from("poc_profiles").select("name,role_type,primary_domain,active_load,max_threshold,conversion_rate").order("name"),
      fastSb.from("lmp_processes").select("status,prep_poc,support_poc,outreach_poc").limit(3000),
    ]);
    if (!profilesError && !lmpsError) {
      const rows = (profiles || []).map((p) => {
        const assigned = (lmps || []).filter((l) =>
          [l.prep_poc, l.support_poc, l.outreach_poc].some((name) => name && name.toLowerCase() === p.name?.toLowerCase())
        );
        const statusCounts: Record<string, number> = {};
        for (const l of assigned) {
          const status = l.status || "Unknown";
          statusCounts[status] = (statusCounts[status] || 0) + 1;
        }
        const activeLoad = Number(p.active_load ?? statusCounts.Ongoing ?? 0);
        const threshold = Number(p.max_threshold ?? 10);
        const capacity = threshold > 0 ? Math.round((activeLoad / threshold) * 100) : 0;
        const converted = assigned.filter((l) => /converted|offer/i.test(l.status || "")).length;
        const conversion = Number.isFinite(Number(p.conversion_rate))
          ? Number(p.conversion_rate)
          : (assigned.length ? Math.round((converted / assigned.length) * 1000) / 10 : 0);
        return {
          capacity,
          row: [
            p.name || "—",
            activeLoad,
            threshold,
            `${capacity}%${capacity > 80 ? " ⚠" : ""}`,
            `${conversion}%`,
            Object.entries(statusCounts).map(([status, count]) => `${status}: ${count}`).join(", ") || "No assigned processes",
          ],
        };
      }).sort((a, b) => b.capacity - a.capacity);
      const overCapacity = rows.filter((r) => r.capacity > 80).length;
      const text = [
        `${rows.length} POCs reviewed. ${overCapacity} ${overCapacity === 1 ? "is" : "are"} above 80% capacity.`,
        "",
        ":::blocks",
        JSON.stringify([
          { type: "executive-summary", content: `${rows.length} POCs reviewed using live POC profiles and LMP assignments. ${overCapacity} are above 80% capacity.` },
          { type: "kpi-row", items: [{ label: "POCs", value: rows.length }, { label: "Above 80% capacity", value: overCapacity }] },
          { type: "table", title: "POC workload", headers: ["POC", "Active load", "Max threshold", "Capacity", "Conversion rate", "Processes by status"], rows: rows.map((r) => r.row) },
        ]),
        ":::",
      ].join("\n");
      telemetry.intent = "poc_workload_fast_path";
      void logTurn({ status: "ok", response_chars: text.length });
      return new Response(buildPlainSseResponse(text), {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Model": TOOL_MODEL },
      });
    }
    requestState().log.warn("poc_workload_fast_path_failed", { profiles_error: profilesError?.message, lmps_error: lmpsError?.message });
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
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "X-Copilot-Model": TOOL_MODEL },
      });
    }
    requestState().log.warn("conversion_count_fast_path_failed", { error: error.message });
  }

  const ACTION_MODES = new Set(["update", "assign"]);
  const cacheable =
    body.cache !== false &&
    !body.confirm_action &&
    !ACTION_MODES.has(requestedMode);
  let cKey: string | null = null;
  if (cacheable) {
    cKey = await buildCacheKey(messages, requestedMode, body.lmpId, body.snapshot);
    const hit = await readCache(cKey);
    if (hit) {
      console.log("copilot-ai cache HIT", cKey.slice(0, 12));
      telemetry.cache_hit = true;
      void logTurn({ status: "ok", response_chars: hit.text.length });
      return replayCachedSse(hit.text);
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


    // ── Step 2: AI call with tool-calling loop ──
    const baseSystemPrompt = buildSystemPrompt(sheetSummary, requestedMode, requestedScope, requestedActiveContext);
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

    const MAX_TOOL_ROUNDS = 4;
    const SOFT_WARN_AT = 3;
    let round = 0;
    let softWarned = false;
    // Per-turn tool-result memo so identical (name,args) calls don't repeat work
    // even if the model re-issues them across rounds.
    const toolMemo = new Map<string, string>();

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      // Inject a single soft warning when we're approaching the cap so the
      // model wraps up with the data it has instead of stalling on more reads.
      if (!softWarned && round >= SOFT_WARN_AT) {
        softWarned = true;
        aiMessages.push({
          role: "system",
          content: `You have ${MAX_TOOL_ROUNDS - round + 1} tool round(s) remaining. Stop calling tools and answer the user with the data you've already gathered. Prefer batched search_* tools over per-row get_* calls.`,
        });
      }

      // Tool-call rounds always use the fast model (low latency, cheap)
      const chatKey = AI_KEY_FOR_CHAT;
      const chatExtraHeaders = AI_EXTRA_HEADERS;
      let aiResponse: Response;
      try {
        aiResponse = await fetch(AI_GATEWAY_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${chatKey}`,
            "Content-Type": "application/json",
            ...chatExtraHeaders,
          },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            model: TOOL_MODEL,
            messages: aiMessages,
            tools: TOOLS,
            stream: false,
          }),
        });
      } catch (e) {
        console.warn(`[tool-loop] primary model network/timeout error: ${(e as Error).message}`);
        aiResponse = new Response(JSON.stringify({ error: "primary model timed out" }), { status: 598 });
      }

      // On any non-ok response, try each TOOL_FALLBACK_MODEL before giving up.
      // 429 → short delay; 401/403/404 → immediate retry with next model.
      // lastErrBody tracks the most recent error so we read the body only once per response.
      if (!aiResponse.ok) {
        const toolProvider = AI_GATEWAY_URL.includes("openrouter") ? "OpenRouter"
          : AI_GATEWAY_URL.includes("x.ai") ? "Grok" : "Gemini";
        let lastErrStatus = aiResponse.status;
        let lastErrBody = await aiResponse.text().catch(() => "");
        console.warn(`[tool-loop] ${toolProvider}/${TOOL_MODEL} ${lastErrStatus}: ${lastErrBody.slice(0, 300)}`);

        const fallbacks = TOOL_FALLBACK_MODELS.filter((m) => m !== TOOL_MODEL);
        for (const fallbackModel of fallbacks) {
          if (lastErrStatus === 429) {
            await new Promise((r) => setTimeout(r, 3000));
          }
          console.warn(`[tool-loop] trying fallback: ${toolProvider}/${fallbackModel}`);
          try {
            aiResponse = await fetch(AI_GATEWAY_URL, {
              method: "POST",
              headers: { Authorization: `Bearer ${chatKey}`, "Content-Type": "application/json", ...chatExtraHeaders },
              signal: AbortSignal.timeout(15_000),
              body: JSON.stringify({ model: fallbackModel, messages: aiMessages, tools: TOOLS, stream: false }),
            });
            if (aiResponse.ok) {
              telemetry.model = fallbackModel;
              break;
            }
            lastErrStatus = aiResponse.status;
            lastErrBody = await aiResponse.text().catch(() => "");
            console.warn(`[tool-loop] ${toolProvider}/${fallbackModel} ${lastErrStatus}: ${lastErrBody.slice(0, 300)}`);
          } catch (retryErr) {
            lastErrStatus = 598;
            lastErrBody = (retryErr as Error).message;
            continue;
          }
        }

        if (!aiResponse.ok) {
          const toolProvider2 = AI_GATEWAY_URL.includes("openrouter") ? "OpenRouter"
            : AI_GATEWAY_URL.includes("x.ai") ? "Grok" : "Gemini";
          if (lastErrStatus === 429) {
            void logTurn({ status: "rate_limited", error_message: "429" });
            return new Response(JSON.stringify({ error: "AI provider quota is temporarily exhausted. Please retry after 60 seconds or ask a simpler query." }), {
              status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (lastErrStatus === 402) {
            void logTurn({ status: "credits_exhausted", error_message: "402" });
            return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings > Workspace > Usage." }), {
              status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          if (lastErrStatus === 401) {
            requestState().log.error("ai_gateway_auth", null, { provider: toolProvider2, status: 401, body: lastErrBody.slice(0, 300) });
            void logTurn({ status: "ai_gateway_error", error_message: `401 auth: ${lastErrBody.slice(0, 100)}` });
            return jsonError(`AI gateway auth failed: ${toolProvider2} 401 — check OPENROUTER_API_KEY / GROK_API_KEY / GEMINI_API_KEY in Edge Function secrets`, 500);
          }
          requestState().log.error("ai_gateway_error", null, { provider: toolProvider2, status: lastErrStatus, body: lastErrBody.slice(0, 300) });
          console.error(`[tool-loop] ${toolProvider2} ${lastErrStatus}: ${lastErrBody}`);
          void logTurn({ status: "ai_gateway_error", error_message: `${lastErrStatus}: ${lastErrBody.slice(0, 200)}` });
          return jsonError("AI gateway is temporarily unavailable after trying all configured models. Please retry in a moment.", 503);
        }
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
          const ctx = requestedActiveContext;
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
        }

        // Continue the loop — the AI will process tool results
        continue;
      }

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
      let synthModel = TOOL_MODEL;
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
