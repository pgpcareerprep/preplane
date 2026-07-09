// Clients for the hybrid-mesh path services (intent-router, reasoning path,
// workflow path). All calls are strictly advisory with tight timeouts and
// silent fallback: the orchestrator's own tool loop remains the source of
// truth, so a slow or missing path service can never degrade an answer.

export type RouterDecision = {
  category: string;
  sub_intent: string;
  confidence: number;
};

export type RouterContext = {
  role?: string | null;
  real_role?: string | null;
  view_as_role?: string | null;
  view_as_user_name?: string | null;
  lmp_id?: string | null;
  mode?: string | null;
  history_len?: number;
};

function baseUrl(envKey: string): string | null {
  const raw = Deno.env.get(envKey);
  if (!raw || !raw.trim()) return null;
  return raw.trim().replace(/\/$/, "");
}

/** Shadow classification via the Rust intent-router (rules + semantic classifier). */
export async function classifyViaRouter(
  utterance: string,
  ctx: RouterContext,
): Promise<RouterDecision | null> {
  const base = baseUrl("INTENT_ROUTER_URL");
  if (!base) return null;
  try {
    const resp = await fetch(`${base}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(300),
      body: JSON.stringify({ utterance, context: ctx }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return {
      category: String(j?.category ?? "UNKNOWN"),
      sub_intent: String(j?.sub_intent ?? "unknown"),
      confidence: Number(j?.confidence ?? 0),
    };
  } catch {
    return null;
  }
}

/** Reasoning-path context hint (e.g. "attach a JD before mentor matching"). */
export async function fetchReasoningHint(input: {
  utterance: string;
  subIntent: string;
  role: string | null;
  lmpId: string | null;
  mode: string | null;
}): Promise<string | null> {
  const base = baseUrl("REASONING_URL");
  if (!base) return null;
  try {
    const resp = await fetch(`${base}/plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(300),
      body: JSON.stringify({
        utterance: input.utterance,
        sub_intent: input.subIntent,
        role: input.role,
        lmp_id: input.lmpId,
        mode: input.mode,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const guidance = j?.context?.guidance;
    return typeof guidance === "string" && guidance.trim() ? guidance.trim() : null;
  } catch {
    return null;
  }
}

/** Workflow-path decomposition hint for multi-step utterances. */
export async function fetchWorkflowSteps(utterance: string): Promise<string[] | null> {
  const base = baseUrl("WORKFLOW_URL");
  if (!base) return null;
  try {
    const resp = await fetch(`${base}/decompose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(300),
      body: JSON.stringify({ utterance }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const steps = j?.plan?.steps;
    if (!Array.isArray(steps) || steps.length < 2) return null;
    const titles = steps
      .map((s: { title?: string }) => (typeof s?.title === "string" ? s.title.trim() : ""))
      .filter((t: string) => t.length > 0);
    return titles.length >= 2 ? titles : null;
  } catch {
    return null;
  }
}

/** True when the utterance reads like a multi-step workflow request. */
export function looksMultiStep(utterance: string): boolean {
  return /\b(and then|then (assign|find|create|update|parse|match)|after that|first .{3,60} then)\b/i.test(
    utterance,
  );
}

// ── Deterministic QUERY routing ─────────────────────────────────────────────
// When the intent-router classifies a turn as QUERY and a query-path template
// can genuinely answer it, the turn is served without any LLM call.

const POC_WORKLOAD_RE =
  /\bpocs?\b[\s\S]{0,80}\b(workload|active load|capacity|max threshold|conversion rate)\b|\b(workload|active load|capacity)\b[\s\S]{0,80}\bpocs?\b/i;

/**
 * Map a router QUERY verdict to a query-path template. Returns null for
 * sub-intents query-path has no template for (student search, attention,
 * compare) — those stay on the LLM tool loop.
 */
export function queryTemplateForDecision(
  subIntent: string,
  utterance: string,
): { template: string; args: Record<string, unknown> } | null {
  switch (subIntent) {
    case "analytics_query":
    case "dashboard_query":
      return {
        template: "get_analytics",
        args: { metric: POC_WORKLOAD_RE.test(utterance) ? "poc_workload" : "pipeline_summary" },
      };
    case "poc_allocation":
      return { template: "get_analytics", args: { metric: "poc_workload" } };
    case "alumni_matching":
      return { template: "lmp_with_alumni_mentors", args: { limit: 50 } };
    case "lmp_process_search":
      return { template: "search_lmp_records", args: { limit: 50 } };
    case "entity_listing":
      // Only LMP/process listings — mentor/student listings have no template.
      return /\b(lmps?|processes?|process)\b/i.test(utterance)
        ? { template: "search_lmp_records", args: { limit: 50 } }
        : null;
    default:
      return null;
  }
}

/** Execute a query-path template; returns the formatted answer text or null. */
export async function executeQueryPath(input: {
  template: string;
  args: Record<string, unknown>;
  utterance: string;
  subIntent: string;
  role: string | null;
  userName: string | null;
}): Promise<string | null> {
  const base = baseUrl("QUERY_PATH_URL");
  if (!base) return null;
  try {
    const resp = await fetch(`${base}/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        template: input.template,
        args: input.args,
        utterance: input.utterance,
        sub_intent: input.subIntent,
        role: input.role,
        userName: input.userName,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    return typeof j?.sse_text === "string" && j.sse_text.trim() ? j.sse_text : null;
  } catch {
    return null;
  }
}
