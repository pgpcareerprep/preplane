// embed-sync: generates vector embeddings for source records and stores them
// in `public.rag_embeddings`. Invoked by DB triggers (sync-record), by an admin
// bulk reindex (bulk-sync), or by the copilot for semantic search (search).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { requireAuth } from "../_shared/requireAuth.ts";
import { logAiUsage, estimateTokens } from "../_shared/ai-usage.ts";


const EMBED_MODEL = "text-embedding-004";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const EMBED_TABLES = [
  // Core records
  "lmp_processes",
  "students",
  "poc_profiles",
  "mentors",
  "alumni_records",
  "domains",
  // Activity / actions / views
  "lmp_daily_logs",
  "lmp_comments",
  "lmp_timeline",
  "lmp_checklists",
  "lmp_candidates",
  "sessions",
  "activity_log",
  // Copilot context
  "copilot_messages",
] as const;

type Row = Record<string, unknown>;

function s(v: unknown, fallback = ""): string {
  if (v === null || v === undefined) return fallback;
  return String(v);
}

function buildEmbedText(table: string, row: Row): string {
  switch (table) {
    case "lmp_processes":
      return [
        `LMP Process: ${s(row.company)} — ${s(row.role)}`,
        `Domain: ${s(row.domain_raw, "Unknown")} | Status: ${s(row.status)} | Type: ${s(row.type)}`,
        `Prep POC: ${s(row.prep_poc, "unassigned")} | Support: ${s(row.support_poc, "none")} | Outreach: ${s(row.outreach_poc, "none")}`,
        `Progress: ${s(row.daily_progress, "no updates yet")}`,
        `Allocation: ${s(row.allocation_path)} | LMP ID: ${s(row.lmp_code)}`,
        row.prep_doc ? `Prep Doc: ${s(row.prep_doc)}` : "",
        row.closing_date ? `Closing: ${s(row.closing_date)}` : "",
        row.final_convert ? `Converted: ${s(row.convert_names, "yes")}` : "",
      ].filter(Boolean).join("\n");

    case "students":
      return [
        `Student: ${s(row.name)} | Email: ${s(row.email)} | Roll: ${s(row.roll_no)}`,
        `Batch: ${s(row.batch)} | Status: ${s(row.status)}`,
        row.notes ? `Notes: ${s(row.notes)}` : "",
      ].filter(Boolean).join("\n");

    case "poc_profiles":
      return [
        `POC: ${s(row.name)} | Email: ${s(row.email)}`,
        `Role: ${s(row.role_type)} | Primary Domain: ${s(row.primary_domain)}`,
        `Secondary Domains: ${Array.isArray(row.domain_tags) ? (row.domain_tags as string[]).join(", ") : ""}`,
        `Active Load: ${s(row.active_load, "0")} | Max: ${s(row.max_threshold, "5")}`,
        `Status: ${s(row.status, "active")}`,
      ].filter(Boolean).join("\n");

    case "mentors":
      return [
        `Mentor: ${s(row.name)} | Email: ${s(row.email)}`,
        `Company: ${s(row.company)} | Domain: ${s(row.functional_domain ?? row.industry)}`,
        `Designation: ${s(row.designation)} | Seniority: ${s(row.seniority)}`,
        `Skills: ${Array.isArray(row.skill_tags) ? (row.skill_tags as string[]).join(", ") : ""}`,
        `Rating: ${s(row.rating, "unrated")} | Source: ${s(row.source)}`,
        row.bio ? `Bio: ${s(row.bio)}` : "",
      ].filter(Boolean).join("\n");

    case "alumni_records":
      return [
        `Alumni: ${s(row.student_name ?? row.name)} | Email: ${s(row.mu_email_id)}`,
        `Company: ${s(row.current_company)} | Role: ${s(row.current_role_title)}`,
        `Domain: ${s(row.domain_1)} ${row.domain_2 ? "/ " + s(row.domain_2) : ""}`,
        `Industry: ${s(row.industry)}`,
        row.linkedin_profile ? `LinkedIn: ${s(row.linkedin_profile)}` : "",
      ].filter(Boolean).join("\n");

    case "lmp_daily_logs":
      return [
        `Daily Log for LMP ${s(row.lmp_id)}`,
        `Date: ${s(row.log_date ?? row.created_at)} | Author: ${s(row.author_name)}`,
        `Entry: ${s(row.text ?? row.content)}`,
      ].filter(Boolean).join("\n");

    case "copilot_messages":
      return [
        `Past Copilot Exchange | Thread: ${s(row.thread_id)}`,
        `Role: ${s(row.role)} | Intent: ${s(row.intent)}`,
        `Message: ${s(row.content).slice(0, 500)}`,
      ].filter(Boolean).join("\n");

    case "domains":
      return [
        `Domain: ${s(row.name)} | Code: ${s(row.code)}`,
        row.description ? `Description: ${s(row.description)}` : "",
        Array.isArray(row.aliases) && row.aliases.length
          ? `Aliases: ${(row.aliases as string[]).join(", ")}`
          : "",
        row.category ? `Category: ${s(row.category)}` : "",
      ].filter(Boolean).join("\n");

    case "lmp_comments":
      return [
        `Comment on LMP ${s(row.lmp_id)} by ${s(row.author_name)}`,
        `When: ${s(row.ts ?? row.created_at)} | Source: ${s(row.source)}`,
        `Body: ${s(row.body).slice(0, 800)}`,
      ].filter(Boolean).join("\n");

    case "lmp_timeline":
      return [
        `Timeline event for LMP ${s(row.lmp_id)}`,
        `Type: ${s(row.event_type)} | Actor: ${s(row.actor, "system")} | At: ${s(row.created_at)}`,
        `Description: ${s(row.description)}`,
      ].filter(Boolean).join("\n");

    case "lmp_checklists":
      return [
        `Checklist item for LMP ${s(row.lmp_id)}`,
        `Item: ${s(row.item_key)} | Completed: ${row.completed ? "yes" : "no"} | Updated: ${s(row.updated_at)}`,
        row.note ? `Note: ${s(row.note)}` : "",
      ].filter(Boolean).join("\n");

    case "lmp_candidates":
      return [
        `Candidate: ${s(row.student_name)} (${s(row.roll_no)}) on LMP ${s(row.lmp_id)}`,
        `Stage: ${s(row.pipeline_stage)} | R1: ${s(row.r1_status)} | R2: ${s(row.r2_status)} | R3: ${s(row.r3_status)}`,
        row.offer_status ? `Offer: ${s(row.offer_status)}` : "",
        row.remarks ? `Remarks: ${s(row.remarks)}` : "",
      ].filter(Boolean).join("\n");

    case "sessions":
      return [
        `Session ${s(row.session_type)} | Status: ${s(row.status)}`,
        `LMP: ${s(row.lmp_id)} | Mentor: ${s(row.mentor_id)} | Student: ${s(row.student_id)}`,
        `Scheduled: ${s(row.scheduled_at)} | Completed: ${s(row.completed_at)} | Duration: ${s(row.duration_min)}min`,
        row.poc_feedback ? `POC Feedback: ${s(row.poc_feedback).slice(0, 500)}` : "",
        row.notes ? `Notes: ${s(row.notes).slice(0, 500)}` : "",
        row.student_rating ? `Student Rating: ${s(row.student_rating)}` : "",
        row.mentor_rating ? `Mentor Rating: ${s(row.mentor_rating)}` : "",
      ].filter(Boolean).join("\n");

    case "activity_log":
      return [
        `Activity: ${s(row.action)} on ${s(row.entity_type)} ${s(row.entity_id)}`,
        `Actor: ${s(row.actor_name)} (${s(row.poc_role_type, "—")}) | Source: ${s(row.source)} | At: ${s(row.created_at)}`,
        row.previous_value ? `From: ${s(row.previous_value).slice(0, 300)}` : "",
        row.new_value ? `To: ${s(row.new_value).slice(0, 300)}` : "",
      ].filter(Boolean).join("\n");

    default:
      return JSON.stringify(row).slice(0, 1000);
  }
}

function buildMetadata(table: string, row: Row): Record<string, unknown> {
  const base = { source_table: table, source_id: row.id };
  switch (table) {
    case "lmp_processes":
      return { ...base, company: row.company, role: row.role, domain: row.domain_raw, status: row.status, prep_poc: row.prep_poc, lmp_code: row.lmp_code };
    case "students":
      return { ...base, name: row.name, batch: row.batch, status: row.status };
    case "poc_profiles":
      return { ...base, name: row.name, role_type: row.role_type, primary_domain: row.primary_domain };
    case "mentors":
      return { ...base, name: row.name, domain: row.functional_domain, company: row.company };
    case "alumni_records":
      return { ...base, name: row.student_name, company: row.current_company };
    case "domains":
      return { ...base, name: row.name, code: row.code };
    case "lmp_comments":
      return { ...base, lmp_id: row.lmp_id, author: row.author_name, ts: row.ts };
    case "lmp_timeline":
      return { ...base, lmp_id: row.lmp_id, event_type: row.event_type, actor: row.actor };
    case "lmp_checklists":
      return { ...base, lmp_id: row.lmp_id, item_key: row.item_key, completed: row.completed };
    case "lmp_candidates":
      return { ...base, lmp_id: row.lmp_id, student_id: row.student_id, student_name: row.student_name, stage: row.pipeline_stage };
    case "sessions":
      return { ...base, lmp_id: row.lmp_id, mentor_id: row.mentor_id, student_id: row.student_id, status: row.status, session_type: row.session_type };
    case "activity_log":
      return { ...base, action: row.action, entity_type: row.entity_type, entity_id: row.entity_id, actor: row.actor_name };
    default:
      return base;
  }
}

async function getEmbedding(
  text: string,
  taskType = "RETRIEVAL_DOCUMENT",
  ctx: { userId?: string | null; sourceTable?: string } = {},
): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY secret is not set");
  const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`;
  const t0 = Date.now();
  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        content: { parts: [{ text: text.slice(0, 8000) }] },
        taskType,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      logAiUsage({
        userId: ctx.userId ?? null, feature: "embeddings", model: EMBED_MODEL,
        promptTokens: estimateTokens(text), latencyMs: Date.now() - t0,
        status: res.status === 429 ? "rate_limited" : "error",
        errorMessage: err.slice(0, 200),
        metadata: { task_type: taskType, source_table: ctx.sourceTable ?? null },
      });
      throw new Error(`Gemini embed error ${res.status}: ${err.slice(0, 200)}`);
    }
    const data = await res.json();
    logAiUsage({
      userId: ctx.userId ?? null, feature: "embeddings", model: EMBED_MODEL,
      promptTokens: estimateTokens(text), latencyMs: Date.now() - t0, status: "ok",
      metadata: { task_type: taskType, source_table: ctx.sourceTable ?? null },
    });
    return data.embedding.values as number[];
  } catch (e) {
    // Re-throw — caller handles error path. (Failures already logged above when fetch returned.)
    throw e;
  }
}


const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function isTriggerCall(req: Request): Promise<boolean> {
  const tok = req.headers.get("x-embed-trigger");
  if (!tok) return false;
  const { data } = await sb.from("_internal_cron_auth").select("token").eq("id", "t").maybeSingle();
  return !!data?.token && tok === data.token;
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const triggerCall = await isTriggerCall(req);
  let userId: string | null = null;
  if (!triggerCall) {
    const auth = await requireAuth(req, cors);
    if ("error" in auth) return auth.error;
    userId = auth.user.id;
  }


  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const op = (body.op as string) ?? "sync-record";

  if (op === "sync-record") {
    const table = body.table as string;
    const record = body.record as Row | undefined;
    if (!table || !record || !(EMBED_TABLES as readonly string[]).includes(table)) {
      return new Response(JSON.stringify({ error: "Invalid table or record" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    if (!record.id) {
      return new Response(JSON.stringify({ error: "record.id required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const content = buildEmbedText(table, record);
    const metadata = buildMetadata(table, record);

    try {
      const embedding = await getEmbedding(content);
      const { error } = await sb.from("rag_embeddings").upsert({
        source_table: table,
        source_id: record.id,
        chunk_index: 0,
        content,
        metadata,
        embedding: JSON.stringify(embedding),
        source_updated_at: (record.updated_at as string) ?? new Date().toISOString(),
      }, { onConflict: "source_table,source_id,chunk_index" });
      if (error) throw new Error(error.message);
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, table, id: record.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (op === "bulk-sync") {
    const onlyTables = Array.isArray(body.tables) ? (body.tables as string[]) : null;
    const perTableLimit = typeof body.limit === "number" ? body.limit : 500;
    const results: Record<string, { embedded: number; errors: number }> = {};

    for (const table of EMBED_TABLES) {
      if (onlyTables && !onlyTables.includes(table)) continue;
      const { data: rows, error } = await sb.from(table).select("*").limit(perTableLimit);
      if (error) {
        results[table] = { embedded: 0, errors: 1 };
        continue;
      }
      let embedded = 0;
      let errors = 0;
      for (const row of (rows ?? []) as Row[]) {
        try {
          const content = buildEmbedText(table, row);
          const metadata = buildMetadata(table, row);
          const embedding = await getEmbedding(content);
          await sb.from("rag_embeddings").upsert({
            source_table: table,
            source_id: row.id,
            chunk_index: 0,
            content,
            metadata,
            embedding: JSON.stringify(embedding),
            source_updated_at: (row.updated_at as string) ?? new Date().toISOString(),
          }, { onConflict: "source_table,source_id,chunk_index" });
          embedded++;
          await new Promise((r) => setTimeout(r, 110));
        } catch (e) {
          console.warn(`Embed failed for ${table} ${row.id}:`, e);
          errors++;
        }
      }
      results[table] = { embedded, errors };
    }

    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  if (op === "search") {
    const query = body.query as string;
    const tables = Array.isArray(body.tables) ? (body.tables as string[]) : null;
    const limit = typeof body.limit === "number" ? body.limit : 6;
    const threshold = typeof body.threshold === "number" ? body.threshold : 0.68;
    if (!query) {
      return new Response(JSON.stringify({ error: "query required" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }

    try {
      const embedding = await getEmbedding(query, "RETRIEVAL_QUERY");
      const { data: results, error } = await sb.rpc("rag_search", {
        query_embedding: JSON.stringify(embedding),
        match_threshold: threshold,
        match_count: limit,
        filter_tables: tables,
      });
      if (error) throw new Error(error.message);
      return new Response(JSON.stringify({ ok: true, results: results ?? [] }), { headers: { ...cors, "Content-Type": "application/json" } });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }
  }

  if (op === "stats") {
    const { data, error } = await sb
      .from("rag_embeddings")
      .select("source_table, embedded_at")
      .order("embedded_at", { ascending: false })
      .limit(50000);
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const stats: Record<string, { count: number; last_embedded_at: string | null }> = {};
    for (const t of EMBED_TABLES) stats[t] = { count: 0, last_embedded_at: null };
    for (const row of (data ?? []) as Array<{ source_table: string; embedded_at: string }>) {
      const cur = stats[row.source_table] ?? { count: 0, last_embedded_at: null };
      cur.count++;
      if (!cur.last_embedded_at || row.embedded_at > cur.last_embedded_at) cur.last_embedded_at = row.embedded_at;
      stats[row.source_table] = cur;
    }
    return new Response(JSON.stringify({ ok: true, stats }), { headers: { ...cors, "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ error: "Unknown op" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
});
