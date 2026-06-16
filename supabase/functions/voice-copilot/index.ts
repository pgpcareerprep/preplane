// Conversational, agentic voice copilot.
// - Phonetic glossary normalises STT mishears ("poses" -> POCs, "elemental" -> LMP)
// - Multi-round tool loop (up to 4 rounds)
// - Reads + staged writes against the same Supabase tables the chat copilot uses
// - All writes go through prepare -> verbal confirm -> execute
import { createClient } from "npm:@supabase/supabase-js@2";
import { AsyncLocalStorage } from "node:async_hooks";
import { logAiUsage, estimateTokens, reserveAiRequest } from "../_shared/ai-usage.ts";
import { isMentorCoverageQuery, isPocWorkloadQuery } from "../_shared/copilotFastPaths.ts";
import { GEMINI_TOOL_FALLBACK_MODELS } from "../copilot-ai/modelConfig.ts";


import { buildCorsHeaders, pickAllowedOrigin } from "../_shared/cors.ts";
import { DEFAULT_APP_ORIGIN } from "../_shared/appConfig.ts";
// Inline CORS headers — the npm:@supabase/supabase-js@2/cors subpath
// does not exist in the published package and throws at runtime.
const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": DEFAULT_APP_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GEMINI_URL      = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const OPENROUTER_URL  = "https://openrouter.ai/api/v1/chat/completions";
const GROK_URL        = "https://api.x.ai/v1/chat/completions";
const MAX_ROUNDS = 4;

// Provider fallback order: Gemini → OpenRouter → Grok
// Configured per-request via voiceProviderStorage to prevent concurrency bleed.
import { GROK_TOOL_MODEL, OPENROUTER_TOOL_MODEL } from "../copilot-ai/modelConfig.ts";

type VoiceProviderState = { url: string; key: string; models: string[]; name: string };
const voiceProviderStorage = new AsyncLocalStorage<{ provider: VoiceProviderState | null }>();

// Retryable HTTP status codes — any other failure is non-retryable
const VOICE_RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

// Vault secrets cache (per cold start)
const _voiceVault = new Map<string, string>();
let _voiceVaultLoaded = false;
async function loadVoiceVault(): Promise<void> {
  if (_voiceVaultLoaded) return;
  _voiceVaultLoaded = true;
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL")!;
    const sbKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const { createClient: cc } = await import("npm:@supabase/supabase-js@2");
    const vaultSb = cc(sbUrl, sbKey, { db: { schema: "vault" }, auth: { persistSession: false } });
    const { data } = await vaultSb.from("decrypted_secrets").select("name,decrypted_secret");
    for (const row of (data ?? []) as any[]) {
      if (row.name && row.decrypted_secret) _voiceVault.set(row.name, row.decrypted_secret.trim());
    }
  } catch { /* non-fatal */ }
}
function voiceEnv(name: string): string | undefined {
  return Deno.env.get(name)?.trim() || _voiceVault.get(name) || undefined;
}

type VoiceRequestState = {
  viewAs: { impersonating: boolean; name: string | null };
  userId: string | null;
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
  kirti, kitty, critty, krithi, criti -> Kriti
  weather, wither, whitter, with it, video, vidith, with-it -> Vidit
  vidit jane, vidith jain -> Vidit Jain
  sonali avast, sonally, sonali avasti, sonali avast hi, sonali avasthy -> Sonali Awasthi
  mansi bargwa, mansi bhargav, monsi bhargwa -> Mansi Bhargwa
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
- Greetings / chitchat / clarifying questions -> respond directly with no tool.
- If you are unsure what the user means, prefer calling resolve_entity or get_analytics over refusing.
- NEVER reply with "Sorry I didn't catch that" — if you can't parse the request, call resolve_entity
  with the most likely name token from the user's utterance.

WRITES (prepare -> confirm -> execute)
- For ANY write (create LMP, assign POC, change status, update field, delete) — call prepare_write.
  prepare_write STAGES the action and returns a one-line summary. Speak that summary ending with
  "Should I go ahead?" Do NOT speak "Done" until the user confirms.
- If a write needs more info (e.g. user said "create LMP for Google" with no role) — ask one short
  clarifying question. Don't stage incomplete writes.

Be decisive. Use tools. Stay in the placement domain.`;

// ─── Tool Schemas ──────────────────────────────────────────────────────────
const tools = [
  {
    type: "function",
    function: {
      name: "list_entities",
      description: "Count and list all entities of a type. Use for 'how many POCs/students/mentors/LMPs', 'list all X'.",
      parameters: {
        type: "object",
        properties: {
          entity_type: { type: "string", enum: ["poc", "student", "mentor", "lmp"] },
          domain: { type: "string", description: "Optional domain filter" },
          status: { type: "string", description: "Optional status filter (LMPs only)" },
        },
        required: ["entity_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "resolve_entity",
      description: "Resolve a name (person, company, LMP) to a concrete entity. Use when user mentions someone by name.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          preferred_scope: { type: "string", enum: ["auto", "student", "poc", "mentor", "lmp", "company"] },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_lmp_records",
      description: "Filter LMP processes by company / role / domain / status / POC.",
      parameters: {
        type: "object",
        properties: {
          company: { type: "string" },
          role: { type: "string" },
          domain: { type: "string" },
          status: { type: "string" },
          mentor_aligned: { type: "boolean" },
          poc: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_student_profile",
      description: "Get a student's profile (scores, domain, mentors, placement status).",
      parameters: {
        type: "object",
        properties: { name: { type: "string" }, roll_no: { type: "string" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "Aggregate metrics over LMP data.",
      parameters: {
        type: "object",
        properties: {
          metric: {
            type: "string",
            enum: ["status_distribution", "domain_distribution", "poc_workload", "conversion_rate", "overview"],
          },
          domain: { type: "string" },
          poc: { type: "string" },
        },
        required: ["metric"],
      },
    },
  },
  {
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
            ],
          },
          // create_lmp / update_*: identify by company + role
          company: { type: "string" },
          role: { type: "string" },
          // create_lmp + update_lmp_field
          domain: { type: "string" },
          type: { type: "string", description: "Full Time, Internship, Live Project, Case Competition" },
          status: { type: "string" },
          prep_poc: { type: "string" },
          support_poc: { type: "string" },
          outreach_poc: { type: "string" },
          // assign_poc
          poc_name: { type: "string" },
          poc_type: { type: "string", enum: ["primary", "support", "outreach"] },
          // generic field update
          field: { type: "string" },
          value: { type: "string" },
          // student updates
          student_name: { type: "string" },
        },
        required: ["action"],
      },
    },
  },
];

// ─── Supabase ──────────────────────────────────────────────────────────────
function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

// ─── Read executors ────────────────────────────────────────────────────────
async function execListEntities(a: { entity_type: string; domain?: string; status?: string }) {
  const c = sb();
  const dom = a.domain?.trim();
  if (a.entity_type === "poc") {
    let q = c.from("poc_profiles").select("name,primary_domain,role_type", { count: "exact" }).limit(20);
    if (dom) q = q.ilike("primary_domain", `%${dom}%`);
    const { data, count } = await q;
    return { count: count ?? data?.length ?? 0, sample: (data || []).slice(0, 5).map((r: any) => r.name) };
  }
  if (a.entity_type === "student") {
    let q = c.from("students").select("name,primary_domain,placement_status", { count: "exact" }).limit(20);
    if (dom) q = q.ilike("primary_domain", `%${dom}%`);
    const { data, count } = await q;
    return { count: count ?? data?.length ?? 0, sample: (data || []).slice(0, 5).map((r: any) => r.name) };
  }
  if (a.entity_type === "mentor") {
    let q = c.from("mentors_union_view").select("name,functional_domain,source_label", { count: "exact" }).limit(20);
    if (dom) q = q.ilike("functional_domain", `%${dom}%`);
    const { data, count } = await q;
    return { count: count ?? data?.length ?? 0, sample: (data || []).slice(0, 5).map((r: any) => r.name) };
  }
  if (a.entity_type === "lmp") {
    let q = c.from("lmp_processes").select("company,role,status,domain_raw", { count: "exact" }).limit(20);
    if (dom) q = q.ilike("domain_raw", `%${dom}%`);
    if (a.status) q = q.ilike("status", `%${a.status}%`);
    const { data, count } = await q;
    return {
      count: count ?? data?.length ?? 0,
      sample: (data || []).slice(0, 5).map((r: any) => `${r.company} ${r.role}`),
    };
  }
  return { error: "unknown entity_type" };
}

async function execResolveEntity(a: { query: string; preferred_scope?: string }) {
  const c = sb();
  const q = a.query.trim();
  const scope = a.preferred_scope || "auto";
  const tasks: Promise<any>[] = [];
  if (scope === "auto" || scope === "poc") {
    tasks.push(c.from("poc_profiles").select("name,primary_domain,role_type,active_load,conversion_rate").ilike("name", `%${q}%`).limit(3));
  } else tasks.push(Promise.resolve({ data: [] }));
  if (scope === "auto" || scope === "student") {
    tasks.push(c.from("students").select("name,primary_domain,placement_status,composite_primary,interview_risk_flag").ilike("name", `%${q}%`).limit(3));
  } else tasks.push(Promise.resolve({ data: [] }));
  if (scope === "auto" || scope === "mentor") {
    tasks.push(c.from("mentors_union_view").select("name,functional_domain,company,role,source_label").ilike("name", `%${q}%`).limit(3));
  } else tasks.push(Promise.resolve({ data: [] }));
  if (scope === "auto" || scope === "lmp" || scope === "company") {
    tasks.push(c.from("lmp_processes").select("id,company,role,status,prep_poc,outreach_poc,domain_raw").or(`company.ilike.%${q}%,role.ilike.%${q}%`).limit(5));
  } else tasks.push(Promise.resolve({ data: [] }));
  const [pocs, students, mentors, lmps] = await Promise.all(tasks);
  return {
    pocs: pocs.data || [],
    students: students.data || [],
    mentors: mentors.data || [],
    lmp_processes: lmps.data || [],
  };
}

// Resolve a freeform POC name (e.g. "Sonali", "Sonali Awasthi") to canonical poc_id
// via the poc_profiles.aliases array. Returns null if no match.
async function resolvePocId(name: string): Promise<string | null> {
  const c = sb();
  const norm = name.trim().toLowerCase();
  if (!norm) return null;
  // Match by canonical name (case-insensitive) or any alias entry.
  const { data: byAlias } = await c
    .from("poc_profiles")
    .select("id")
    .contains("aliases", [norm])
    .maybeSingle();
  if (byAlias?.id) return byAlias.id;
  const { data: byName } = await c
    .from("poc_profiles")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();
  if (byName?.id) return byName.id;
  // Try first word (e.g. "Sonali Awasthi" → "sonali")
  const first = norm.split(/\s+/)[0];
  const { data: byFirst } = await c
    .from("poc_profiles")
    .select("id")
    .contains("aliases", [first])
    .maybeSingle();
  return byFirst?.id ?? null;
}

async function execSearchLmp(a: any) {
  const c = sb();
  let q = c.from("lmp_processes").select("id,company,role,status,domain_raw,prep_poc,outreach_poc,type,mentor_aligned").limit(a.limit ?? 10);
  if (a.company) q = q.ilike("company", `%${a.company}%`);
  if (a.role) q = q.ilike("role", `%${a.role}%`);
  if (a.domain) q = q.ilike("domain_raw", `%${a.domain}%`);
  if (a.status) q = q.ilike("status", `%${a.status}%`);
  if (a.mentor_aligned === false) q = q.or("mentor_aligned.is.null,mentor_aligned.eq.false");
  else if (a.mentor_aligned === true) q = q.eq("mentor_aligned", true);
  if (a.poc) {
    // Use the structured link table when we can resolve the POC; falls back to
    // freeform ilike so unmapped aliases still return something.
    const pocId = await resolvePocId(a.poc);
    if (pocId) {
      const { data: links } = await c.from("lmp_poc_links").select("lmp_id").eq("poc_id", pocId);
      const ids = (links || []).map(l => l.lmp_id);
      if (ids.length === 0) return { rows: [], total: 0, resolved_poc_id: pocId };
      q = q.in("id", ids);
    } else {
      q = q.or(`prep_poc.ilike.%${a.poc}%,support_poc.ilike.%${a.poc}%,outreach_poc.ilike.%${a.poc}%`);
    }
  }
  const { data } = await q;
  return { rows: data || [], total: (data || []).length };
}

async function execStudentProfile(a: { name?: string; roll_no?: string }) {
  const c = sb();
  let q = c.from("students").select("name,roll_no,primary_domain,placement_status,composite_primary,mock_score,resume_score,behavioral,interview_risk_flag,mentor_primary").limit(1);
  if (a.roll_no) q = q.eq("roll_no", a.roll_no);
  else if (a.name) q = q.ilike("name", `%${a.name}%`);
  else return { error: "name or roll_no required" };
  const { data } = await q;
  return data?.[0] || { error: "not found" };
}

async function execAnalytics(a: { metric: string; domain?: string; poc?: string }) {
  const c = sb();
  if (a.metric === "status_distribution" || a.metric === "overview") {
    let q = c.from("lmp_processes").select("status,domain_raw");
    if (a.domain) q = q.ilike("domain_raw", `%${a.domain}%`);
    const { data } = await q;
    const dist: Record<string, number> = {};
    for (const r of data || []) dist[r.status || "Unknown"] = (dist[r.status || "Unknown"] || 0) + 1;
    return { metric: a.metric, total: data?.length ?? 0, distribution: dist };
  }
  if (a.metric === "domain_distribution") {
    const { data } = await c.from("lmp_processes").select("domain_raw");
    const dist: Record<string, number> = {};
    for (const r of data || []) dist[r.domain_raw || "Unknown"] = (dist[r.domain_raw || "Unknown"] || 0) + 1;
    return { metric: a.metric, total: data?.length ?? 0, distribution: dist };
  }
  if (a.metric === "poc_workload") {
    let pocQ = c.from("poc_profiles").select("name,role_type,active_load,max_threshold,conversion_rate").order("active_load", { ascending: false }).limit(20);
    if (a.poc) pocQ = pocQ.ilike("name", `%${a.poc}%`);
    const { data: pocData } = await pocQ;
    const { data: lmpData } = await c.from("lmp_processes").select("prep_poc,outreach_poc,status");
    const lmps = lmpData || [];
    const top = ((pocData || []) as any[]).slice(0, 10).map((r: any) => {
      const name = r.name as string;
      const ongoing = lmps.filter((l) => (l.prep_poc === name || l.outreach_poc === name) && /ongoing/i.test(l.status || "")).length;
      const converted = lmps.filter((l) => (l.prep_poc === name || l.outreach_poc === name) && /converted|offer/i.test(l.status || "")).length;
      return {
        name,
        role_type: r.role_type,
        total_lmps: Number(r.active_load ?? 0),
        max_threshold: Number(r.max_threshold ?? 10),
        capacity_percent: Number(r.max_threshold ?? 10) > 0
          ? Math.round((Number(r.active_load ?? 0) / Number(r.max_threshold ?? 10)) * 100)
          : 0,
        conversion_rate: Number(r.conversion_rate ?? 0),
        prep_count: ongoing,
        ongoing,
        converted,
      };
    });
    return { metric: a.metric, top };
  }
  if (a.metric === "conversion_rate") {
    const { data } = await c.from("lmp_processes").select("status");
    const total = data?.length ?? 0;
    const converted = (data || []).filter((r: any) => /converted|offer/i.test(r.status || "")).length;
    return { metric: a.metric, total, converted, rate: total ? Math.round((converted / total) * 1000) / 10 : 0 };
  }
  return { error: "unknown metric" };
}

// ─── Write stager + executor ───────────────────────────────────────────────
type PendingAction = Record<string, any> & { action: string; _current?: Record<string, any> };

// BUG-V3: snapshot current DB values for an LMP write so the spoken
// confirmation (and downstream UI) reflects what's actually in the DB.
async function snapshotForPending(p: PendingAction): Promise<Record<string, any> | null> {
  if (!p.company || !p.role) return null;
  const c = sb();
  const { data } = await c
    .from("lmp_processes")
    .select("id,company,role,status,domain_raw,type,prep_poc,support_poc,outreach_poc,prep_progress,placement_progress,daily_progress,remarks,prep_doc,closing_date,r1_names,r2_names,r3_names,final_converted_numbers,final_converted_names")
    .ilike("company", `%${p.company}%`)
    .ilike("role", `%${p.role}%`)
    .limit(1)
    .maybeSingle();
  return data || null;
}

// BUG-V2: per-LMP POC ownership check. Admin/allocator bypass.
async function assertPocOwnsLmp(
  actor: { id: string; role: string },
  p: PendingAction,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Per-LMP ownership enforced for EVERY role. Admin/Allocator no longer
  // bypass — they only get visibility, not write access on other POCs' LMPs.
  if (!p.company || !p.role) return { ok: false, reason: "missing company/role to verify ownership" };
  const c = sb();
  const { data: lmp } = await c
    .from("lmp_processes")
    .select("id,prep_poc,support_poc,outreach_poc")
    .ilike("company", `%${p.company}%`)
    .ilike("role", `%${p.role}%`)
    .limit(1)
    .maybeSingle();
  if (!lmp?.id) return { ok: false, reason: `LMP ${p.company} – ${p.role} not found` };
  const { data: prof } = await c
    .from("poc_profiles")
    .select("id,name,aliases")
    .eq("approved_user_id", actor.id)
    .maybeSingle();
  if (prof?.id) {
    const { data: link } = await c
      .from("lmp_poc_links")
      .select("id")
      .eq("lmp_id", lmp.id)
      .eq("poc_id", prof.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (link?.id) return { ok: true };
  }
  // Fallback: exact-token name / alias match on denormalized POC columns.
  const tokens = new Set<string>();
  if (prof?.name) tokens.add(String(prof.name).trim().toLowerCase());
  if (Array.isArray(prof?.aliases)) {
    for (const a of prof.aliases as string[]) if (a) tokens.add(String(a).trim().toLowerCase());
  }
  if (tokens.size) {
    const present = [lmp.prep_poc, lmp.support_poc, lmp.outreach_poc]
      .flatMap((v) => String(v || "").split(/[,;/&]/))
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (present.some((p) => tokens.has(p))) return { ok: true };
  }
  return { ok: false, reason: `you are not assigned as a POC on ${p.company} – ${p.role}` };
}

function summarisePending(p: PendingAction): string {
  const cur = p._current || {};
  const fmtChange = (label: string, was: any, to: any) =>
    was && String(was) !== String(to)
      ? `${label} from "${was}" to "${to}"`
      : `${label} to "${to}"`;
  switch (p.action) {
    case "create_lmp":
      return `Create new LMP for ${p.company} – ${p.role}${p.domain ? ` in ${p.domain}` : ""}${p.prep_poc ? `, prep POC ${p.prep_poc}` : ""}${p.outreach_poc ? `, outreach POC ${p.outreach_poc}` : ""}`;
    case "update_lmp_status":
      return `${fmtChange(`Set ${p.company} – ${p.role} status`, cur.status, p.status)}`;
    case "update_lmp_field":
      return `${fmtChange(`Set ${p.field} on ${p.company} – ${p.role}`, cur[p.field], p.value)}`;
    case "assign_poc": {
      const col = p.poc_type === "support" ? "support POC" : p.poc_type === "outreach" ? "outreach POC" : "prep POC";
      const colKey = p.poc_type === "support" ? "support_poc" : p.poc_type === "outreach" ? "outreach_poc" : "prep_poc";
      return fmtChange(`Assign ${col} for ${p.company} – ${p.role}`, cur[colKey], p.poc_name);
    }
    case "delete_lmp":
      return `Delete LMP ${p.company} – ${p.role}`;
    case "update_student_field":
      return `Set ${p.field} to "${p.value}" for student ${p.student_name}`;
    default:
      return `Run ${p.action}`;
  }
}

async function executePending(
  p: PendingAction,
  actor: { id: string; role: string },
): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const c = sb();
  try {
    // BUG-V2: ownership gate (admin/mod bypass; create_lmp not gated by per-LMP).
    if (p.action !== "create_lmp" && p.action !== "update_student_field") {
      const own = await assertPocOwnsLmp(actor, p);
      if (!own.ok) return { ok: false, error: own.reason };
    }

    if (p.action === "create_lmp") {
      if (actor.role === "poc") return { ok: false, error: "only admins can create LMPs" };
      if (!p.company || !p.role) return { ok: false, error: "company and role required" };
      const row: any = {
        company: p.company,
        role: p.role,
        domain_raw: p.domain || null,
        type: p.type || null,
        status: p.status || "Ongoing",
        prep_poc: p.prep_poc || null,
        support_poc: p.support_poc || null,
        outreach_poc: p.outreach_poc || null,
        sync_source: "voice-copilot",
      };
      const { error } = await c.from("lmp_processes").insert(row);
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `created LMP for ${p.company} – ${p.role}` };
    }

    const findLmp = async () => {
      const { data } = await c.from("lmp_processes").select("id,company,role")
        .ilike("company", `%${p.company}%`).ilike("role", `%${p.role}%`).limit(1);
      return data?.[0];
    };

    if (p.action === "update_lmp_status") {
      const lmp = await findLmp();
      if (!lmp) return { ok: false, error: "LMP not found" };
      const { error } = await c.from("lmp_processes").update({ status: p.status }).eq("id", lmp.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `set status to ${p.status}` };
    }
    if (p.action === "update_lmp_field") {
      const allowed = new Set([
        "domain_raw", "type", "prep_progress", "placement_progress", "daily_progress",
        "remarks", "prep_doc", "closing_date", "r1_names", "r2_names",
        "r3_names", "final_converted_numbers", "final_converted_names",
      ]);
      if (!allowed.has(p.field)) return { ok: false, error: `field ${p.field} not allowed` };
      const lmp = await findLmp();
      if (!lmp) return { ok: false, error: "LMP not found" };
      const { error } = await c.from("lmp_processes").update({ [p.field]: p.value }).eq("id", lmp.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `updated ${p.field}` };
    }
    if (p.action === "assign_poc") {
      if (actor.role === "poc") return { ok: false, error: "only admins can reassign POCs" };
      const lmp = await findLmp();
      if (!lmp) return { ok: false, error: "LMP not found" };
      const col = p.poc_type === "support" ? "support_poc" : p.poc_type === "outreach" ? "outreach_poc" : "prep_poc";
      const { error } = await c.from("lmp_processes").update({ [col]: p.poc_name }).eq("id", lmp.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `assigned ${p.poc_name} as ${col.replace("_", " ")}` };
    }
    if (p.action === "delete_lmp") {
      if (actor.role === "poc") return { ok: false, error: "only admins can delete LMPs" };
      const lmp = await findLmp();
      if (!lmp) return { ok: false, error: "LMP not found" };
      const { error } = await c.from("lmp_processes").delete().eq("id", lmp.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `deleted ${p.company} – ${p.role}` };
    }
    if (p.action === "update_student_field") {
      const allowed = new Set(["placement_status", "primary_domain", "interview_risk_flag", "mentor_primary"]);
      if (!allowed.has(p.field)) return { ok: false, error: `field ${p.field} not allowed` };
      const { data } = await c.from("students").select("id,name").ilike("name", `%${p.student_name}%`).limit(1);
      if (!data?.length) return { ok: false, error: "student not found" };
      const { error } = await c.from("students").update({ [p.field]: p.value }).eq("id", data[0].id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, summary: `updated ${data[0].name}` };
    }
    return { ok: false, error: `unknown action ${p.action}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── LLM — multi-provider with Gemini→OpenRouter→Grok fallback ────────────────
async function callModel(messages: any[], forceTool = false) {
  const t0 = Date.now();
  const promptText = messages.map((m: any) =>
    typeof m?.content === "string" ? m.content : JSON.stringify(m?.content ?? "")
  ).join("\n");

  // Provider catalogue — skipped if key unavailable
  const PROVIDERS: Array<{ name: string; url: string; keyName: string; models: string[]; extraHeaders?: Record<string,string> }> = [
    {
      name: "Gemini", url: GEMINI_URL, keyName: "GEMINI_API_KEY",
      models: [...GEMINI_TOOL_FALLBACK_MODELS],
    },
    {
      name: "OpenRouter", url: OPENROUTER_URL, keyName: "OPENROUTER_API_KEY",
      models: [OPENROUTER_TOOL_MODEL, "meta-llama/llama-3.3-70b-instruct:free"],
      extraHeaders: { "HTTP-Referer": "https://preplane.mastersunion.org", "X-Title": "PrepLane Voice" },
    },
    {
      name: "Grok", url: GROK_URL, keyName: "GROK_API_KEY",
      models: [GROK_TOOL_MODEL],
    },
  ];

  let lastFailReason = "all providers unavailable";

  for (const provider of PROVIDERS) {
    const key = voiceEnv(provider.keyName);
    if (!key) continue;

    for (const model of provider.models) {
      let resp: Response;
      try {
        resp = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            ...(provider.extraHeaders ?? {}),
          },
          signal: AbortSignal.timeout(15_000),
          body: JSON.stringify({
            model,
            messages,
            tools,
            tool_choice: forceTool ? "required" : "auto",
            temperature: 0.3,
            max_tokens: 600,
          }),
        });
      } catch (e) {
        const eName = (e as { name?: string })?.name ?? "";
        if (eName === "TimeoutError" || eName === "AbortError") {
          lastFailReason = `${provider.name}/${model}: timeout`;
          continue; // try next model/provider
        }
        lastFailReason = `${provider.name}/${model}: network error`;
        continue;
      }

      if (resp.ok) {
        const data = await resp.json();
        const usage = data?.usage ?? {};
        const pt = Number(usage.prompt_tokens) || estimateTokens(promptText);
        const rt = Number(usage.completion_tokens) || estimateTokens(JSON.stringify(data?.choices?.[0]?.message ?? ""));
        logAiUsage({
          userId: voiceRequestState().userId,
          feature: `voice-${provider.name.toLowerCase()}`,
          model,
          promptTokens: pt, responseTokens: rt,
          totalTokens: Number(usage.total_tokens) || (pt + rt),
          latencyMs: Date.now() - t0, status: "ok",
        });
        return data;
      }

      const status = resp.status;
      const errText = await resp.text().catch(() => "");
      lastFailReason = `${provider.name}/${model} HTTP ${status}`;
      logAiUsage({
        userId: voiceRequestState().userId, feature: `voice-${provider.name.toLowerCase()}`, model,
        promptTokens: estimateTokens(promptText), latencyMs: Date.now() - t0,
        status: status === 429 ? "rate_limited" : "error",
        errorMessage: errText.slice(0, 200),
      });

      // Non-retryable errors — don't try other models for this provider
      if (!VOICE_RETRYABLE.has(status)) break;
      // Retryable — try next model in same provider, then next provider
    }
  }

  throw new Error(`Voice AI unavailable: ${lastFailReason}. Please try again.`);
}


async function runTool(name: string, args: any): Promise<{ result: any; pending?: PendingAction; block?: any }> {
  switch (name) {
    case "list_entities": {
      const result = await execListEntities(args);
      return { result, block: { type: "count", entity: args.entity_type, count: result.count, sample: result.sample } };
    }
    case "resolve_entity": {
      const result = await execResolveEntity(args);
      return { result, block: { type: "entity_lookup", query: args.query, result } };
    }
    case "search_lmp_records": {
      const result = await execSearchLmp(args);
      return { result, block: result.total > 0 ? { type: "lmp_list", rows: result.rows, total: result.total } : undefined };
    }
    case "get_student_profile": {
      const result = await execStudentProfile(args);
      return { result, block: !result.error ? { type: "student_profile", data: result } : undefined };
    }
    case "get_analytics": {
      const result = await execAnalytics(args);
      return { result, block: { type: "analytics", metric: args.metric, data: result } };
    }
    case "prepare_write": {
      const pending = args as PendingAction;
      // BUG-V3: snapshot current DB values so the spoken summary reflects DB truth.
      try {
        const snap = await snapshotForPending(pending);
        if (snap) pending._current = snap;
      } catch (_e) { /* non-fatal */ }
      return {
        result: { staged: true, current: pending._current || null, summary: summarisePending(pending) + ". Should I go ahead?" },
        pending,
        block: { type: "pending_action", action: pending.action, summary: summarisePending(pending) },
      };
    }
    default:
      return { result: { error: `unknown tool ${name}` } };
  }
}

// ─── HTTP ──────────────────────────────────────────────────────────────────
import { requireAuth } from "../_shared/requireAuth.ts";
import { createLogger } from "../_shared/logger.ts";

async function handleVoiceRequest(req: Request) {
  corsHeaders["Access-Control-Allow-Origin"] = pickAllowedOrigin(req);
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
      confirm?: PendingAction | null;
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
    const viewAsRole = (bodyViewAsRole || bodyRole || realRole).trim();
    const isImpersonating = !!viewAsName && viewAsName.toLowerCase() !== realName.toLowerCase();
    voiceRequestState().viewAs = { impersonating: isImpersonating, name: isImpersonating ? viewAsName : null };
    // Effective identity = who the model should answer "as".
    const effectiveName = isImpersonating ? viewAsName : realName;
    const effectiveRole = isImpersonating ? viewAsRole : realRole;

    // Confirmation branch — execute the staged write
    if (confirm) {
      userLog.event("confirm_execute", { action: confirm.action });
      const r = await executePending(confirm, { id: auth.user.id, role: realRole });
      userLog.event("confirm_result", { ok: r.ok, error: r.error, ms: Math.round(performance.now() - t0) });
      const spoken = r.ok ? `Done. ${r.summary}.` : `Couldn't do that — ${r.error}.`;
      return new Response(JSON.stringify({ spoken }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load a small POC roster so the model can re-map STT mishears against real names.
    let rosterBlock = "";
    try {
      const sbc = sb();
      const { data: pocs } = await sbc.from("poc_profiles").select("name,role_type,primary_domain").limit(40);
      if (pocs && pocs.length > 0) {
        rosterBlock = "\n\nPOC ROSTER (use these canonical names for mishears):\n" +
          pocs.map((p: any) => `- ${p.name}${p.primary_domain ? ` (${p.primary_domain})` : ""}`).join("\n");
      }
    } catch { /* non-fatal */ }

    const identityBlock = `\n\nCURRENT USER\n- Name: ${realName}\n- Email: ${realEmail || "(unknown)"}\n- Real role: ${realRole}\n${
      isImpersonating
        ? `- Viewing as: ${viewAsName} (${viewAsRole})\n- When the user says "me", "my", "I", "mine", "today's", resolve reads to ${viewAsName}. Scope reads to ${viewAsName}'s LMPs/candidates. Writes still use the authenticated user's real role (${realRole}) and backend ownership rules.`
        : `- The user is acting as themselves. "me", "my", "I" resolve to ${realName}.`
    }${effectiveRole === "poc" ? `\n- Effective role is POC — scope LMP listings, search, and workload to ${effectiveName}'s assignments unless the user explicitly says "all" / "everyone" / "org-wide" / another named POC.` : ""}`;

    const sysPrompt = SYSTEM_PROMPT + identityBlock + rosterBlock;

    // Multi-round agent loop
    const convo: any[] = [{ role: "system", content: sysPrompt }, ...messages];
    let pendingAction: PendingAction | null = null;
    let lastSpoken = "";
    const responseBlocks: any[] = [];

    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    if (isMentorCoverageQuery(lastUser)) {
      const result = await execSearchLmp({ status: "Ongoing", mentor_aligned: false, limit: 50 });
      const count = result.total;
      const spoken = `${count} ongoing LMP process${count === 1 ? "" : "es"} ${count === 1 ? "needs" : "need"} a mentor aligned.`;
      return new Response(JSON.stringify({
        spoken,
        blocks: count > 0 ? [{ type: "lmp_list", rows: result.rows, total: count }] : [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (isPocWorkloadQuery(lastUser)) {
      const result = await execAnalytics({ metric: "poc_workload" });
      const overloaded = (result.top || []).filter((p: any) => p.capacity_percent > 80);
      const spoken = overloaded.length
        ? `${overloaded.length} POCs are above eighty percent capacity. ${overloaded.slice(0, 3).map((p: any) => p.name).join(", ")} need attention first.`
        : "No POCs are above eighty percent capacity right now.";
      return new Response(JSON.stringify({
        spoken,
        blocks: [{ type: "analytics", metric: "poc_workload", data: result }],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const FORCE = /\b(how many|count|list|show|all|total|create|add|assign|update|change|set|delete|remove|status|conversion|workload|domain|ongoing|tell me|find|who|what|recommend|progress|performance|how is|how's|how are|update on|status of|doing|load|active|working on|kriti|kirti|my|me|mine|today)\b/i;
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
      const resp = await callModel(convo, forced);
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
          const { result, pending, block } = await runTool(name, args);
          if (pending) pendingAction = pending;
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

      if (pendingAction) continue;
    }

    if (!lastSpoken) {
      lastSpoken = pendingAction
        ? summarisePending(pendingAction) + ". Should I go ahead?"
        : "I couldn't find an answer for that — try asking about a specific POC, LMP, or domain.";
    }

    userLog.event("turn_done", {
      spoken_len: lastSpoken.length,
      pending: !!pendingAction,
      pending_action: pendingAction?.action,
      ms: Math.round(performance.now() - t0),
    });

    return new Response(JSON.stringify({ spoken: lastSpoken, pendingAction, blocks: responseBlocks }), {
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
    { viewAs: { impersonating: false, name: null }, userId: null },
    () => handleVoiceRequest(req),
  )
);
