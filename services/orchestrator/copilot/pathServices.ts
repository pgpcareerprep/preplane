// Clients for the hybrid-mesh path services (intent-router, reasoning path,
// workflow path, command-plane, query-path). Advisory calls use tight timeouts;
// deterministic QUERY / COMMAND / WORKFLOW short-circuits return before the LLM.

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

/** Workflow-path decomposition hint for multi-step utterances (titles only). */
export async function fetchWorkflowSteps(utterance: string): Promise<string[] | null> {
  const plan = await fetchWorkflowPlan(utterance);
  return plan?.steps ?? null;
}

export type WorkflowPlanResult = {
  sse_text: string;
  steps: string[];
  plan_id: string;
  matched_pattern: boolean;
};

/**
 * Full workflow plan with plan-card SSE. Prefer this for no-LLM WORKFLOW turns.
 * Returns null when the service is down or the plan is too thin.
 */
export async function fetchWorkflowPlan(utterance: string): Promise<WorkflowPlanResult | null> {
  const base = baseUrl("WORKFLOW_URL");
  if (!base) return null;
  try {
    const resp = await fetch(`${base}/decompose`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(800),
      body: JSON.stringify({ utterance }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const steps = j?.plan?.steps;
    if (!Array.isArray(steps) || steps.length < 2) return null;
    const titles = steps
      .map((s: { title?: string }) => (typeof s?.title === "string" ? s.title.trim() : ""))
      .filter((t: string) => t.length > 0);
    const sse = typeof j?.sse_text === "string" ? j.sse_text.trim() : "";
    if (titles.length < 2 || !sse) return null;
    return {
      sse_text: sse,
      steps: titles,
      plan_id: String(j?.plan?.plan_id ?? ""),
      matched_pattern: j?.matched_pattern === true,
    };
  } catch {
    return null;
  }
}

/** True when the utterance reads like a multi-step workflow request. */
export function looksMultiStep(utterance: string): boolean {
  return /\b(and then|then (assign|find|create|update|parse|match)|after that|first .{3,60} then|make[_ ]plan)\b/i.test(
    utterance,
  );
}

// ── Deterministic QUERY routing ─────────────────────────────────────────────

const POC_WORKLOAD_RE =
  /\bpocs?\b[\s\S]{0,80}\b(workload|active load|capacity|max threshold)\b|\b(workload|active load|capacity)\b[\s\S]{0,80}\bpocs?\b/i;
const CONVERSION_RE =
  /\b(conversion|converted|not converted|not-converted|conversion rate)\b/i;
const DOMAIN_DIST_RE = /\b(domain|by domain|domain breakdown|domain distribution)\b/i;
const STATUS_DIST_RE = /\b(status breakdown|status distribution|by status)\b/i;
const AGE_STALE_RE =
  /\b(stale|stuck|overdue|age|oldest|delayed|bottleneck|sla|attention|urgent|at.?risk)\b/i;
const ASSIGN_POC_RE =
  /\b(assign|reassign|allocate)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\s+(?:as\s+)?(?:(prep|outreach|support)\s+)?poc\b/i;

export function analyticsMetricForUtterance(utterance: string): string {
  if (POC_WORKLOAD_RE.test(utterance)) return "poc_workload";
  if (CONVERSION_RE.test(utterance)) return "conversion_rate";
  if (DOMAIN_DIST_RE.test(utterance)) return "domain_distribution";
  if (STATUS_DIST_RE.test(utterance)) return "status_distribution";
  if (AGE_STALE_RE.test(utterance)) return "age_tracking";
  return "pipeline_summary";
}

function inferCompanyFromUtterance(utterance: string): string | null {
  const forAt = utterance.match(
    /\b(?:for|at|of)\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\b/,
  );
  if (forAt?.[1] && !/^(The|All|Our|My|This|That|LMP|POC)\b/i.test(forAt[1])) {
    return forAt[1].trim();
  }
  return null;
}

function inferStatusFromUtterance(utterance: string): string | null {
  const lower = utterance.toLowerCase();
  if (/\bon[\s-]?hold\b/.test(lower)) return "hold";
  if (/\bnot[\s-]?converted\b/.test(lower)) return "not-converted";
  if (/\bconverted\b/.test(lower) && !/\bnot\b/.test(lower)) return "converted";
  if (/\b(prep[\s-]?ongoing|ongoing)\b/.test(lower)) return "ongoing";
  if (/\b(prep[\s-]?done)\b/.test(lower)) return "prep-done";
  if (/\bdormant\b/.test(lower)) return "dormant";
  if (/\bclosed\b/.test(lower)) return "closed";
  return null;
}

function searchLmpArgs(utterance: string): Record<string, unknown> {
  const args: Record<string, unknown> = { limit: 50 };
  const company = inferCompanyFromUtterance(utterance);
  if (company) args.company = company;
  const status = inferStatusFromUtterance(utterance);
  if (status) args.status = status;
  if (/\b(recent|latest|newest)\b/i.test(utterance)) args.sort = "recent";
  if (/\b(oldest|stale)\b/i.test(utterance)) args.sort = "oldest_activity";
  return args;
}

/**
 * Map a router QUERY verdict to a query-path template. Returns null for
 * sub-intents that need the LLM (student search, compare, mentor assign).
 */
export function queryTemplateForDecision(
  subIntent: string,
  utterance: string,
): { template: string; args: Record<string, unknown> } | null {
  // Assign POC is a COMMAND — never serve as workload analytics.
  if (subIntent === "poc_allocation" && ASSIGN_POC_RE.test(utterance)) {
    return null;
  }

  switch (subIntent) {
    case "analytics_query":
    case "dashboard_query":
    case "platform_summary":
      return {
        template: "get_analytics",
        args: { metric: analyticsMetricForUtterance(utterance) },
      };
    case "poc_allocation":
      return { template: "get_analytics", args: { metric: "poc_workload" } };
    case "attention_needed":
      return { template: "get_analytics", args: { metric: "age_tracking" } };
    case "alumni_matching":
      return { template: "lmp_with_alumni_mentors", args: { limit: 50 } };
    case "lmp_process_search":
      return { template: "search_lmp_records", args: searchLmpArgs(utterance) };
    case "entity_listing":
      if (/\b(lmps?|processes?|process)\b/i.test(utterance)) {
        return { template: "search_lmp_records", args: searchLmpArgs(utterance) };
      }
      // Students/mentors/POCs listing still needs list_entities via LLM for now.
      return null;
    case "compare_progress":
    case "student_search":
    case "student_progress":
      return null;
    default:
      // Unknown but utterance clearly asks for LMP listing / pipeline.
      if (/\b(show|list|find|search|get)\b/i.test(utterance) &&
        /\b(lmp|process|processes)\b/i.test(utterance)) {
        return { template: "search_lmp_records", args: searchLmpArgs(utterance) };
      }
      if (/\b(overview|pipeline summary|dashboard|conversion rate)\b/i.test(utterance)) {
        return {
          template: "get_analytics",
          args: { metric: analyticsMetricForUtterance(utterance) },
        };
      }
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

// ── Deterministic COMMAND staging ───────────────────────────────────────────

const STATUS_ALIASES: Array<{ re: RegExp; status: string }> = [
  { re: /\bon[\s-]?hold\b/i, status: "On Hold" },
  { re: /\bnot[\s-]?converted\b/i, status: "Not Converted" },
  { re: /\bconverted\b/i, status: "Converted" },
  { re: /\bprep[\s-]?ongoing\b|\bongoing\b/i, status: "Ongoing" },
  { re: /\bclosed\b/i, status: "Closed" },
  { re: /\bdormant\b/i, status: "Dormant" },
];

/**
 * Parse safe COMMAND utterances into kind+payload.
 * Only returns when company + role (and status/poc) are explicit — never guess.
 */
export function tryParseCommandArgs(
  utterance: string,
): { kind: string; payload: Record<string, unknown> } | null {
  const text = utterance.trim();
  if (!text) return null;

  // update|mark|set <Company> · <Role> to <Status>
  const statusUpdate = text.match(
    /\b(?:update|mark|set|change|move)\s+(.+?)\s*[·•]\s*(.+?)\s+(?:to|as|=)\s+(.+)$/i,
  );
  if (statusUpdate) {
    const company = statusUpdate[1].trim();
    const role = statusUpdate[2].trim();
    const statusRaw = statusUpdate[3].trim();
    const status = STATUS_ALIASES.find((s) => s.re.test(statusRaw))?.status
      ?? (/^(on hold|converted|ongoing|closed|dormant|not converted)$/i.test(statusRaw)
        ? statusRaw.replace(/\b\w/g, (c) => c.toUpperCase())
        : null);
    if (company && role && status && company.length >= 2 && role.length >= 1) {
      return { kind: "update_lmp_status", payload: { company, role, status } };
    }
  }

  // assign <Name> as (prep|outreach|support)? POC (to|for) <Company> · <Role>
  const assign = text.match(
    /\b(?:assign|reassign|allocate)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:as\s+)?(?:(prep|outreach|support)\s+)?poc\s+(?:to|for|on)\s+(.+?)\s*[·•]\s*(.+)$/i,
  );
  if (assign) {
    const pocName = assign[1].trim();
    const pocRole = (assign[2] || "prep").toLowerCase();
    const company = assign[3].trim();
    const role = assign[4].trim();
    if (pocName && company && role) {
      return {
        kind: "assign_poc",
        payload: { company, role, poc_name: pocName, poc_role: pocRole },
      };
    }
  }

  // delete|remove LMP <Company> · <Role>
  const del = text.match(
    /\b(?:delete|remove|soft[\s-]?delete)\s+(?:the\s+)?(?:lmp\s+(?:for\s+|process\s+)?)?(.+?)\s*[·•]\s*(.+)$/i,
  );
  if (del && /\b(delete|remove|soft[\s-]?delete)\b/i.test(text)) {
    const company = del[1].replace(/\blmp\b/gi, "").trim();
    const role = del[2].trim();
    if (company.length >= 2 && role.length >= 1) {
      return { kind: "delete_lmp_record", payload: { company, role } };
    }
  }

  return null;
}

export type CommandStageResult = {
  sse_text: string;
  pending_action_id: string;
  phase: string;
};

/** Stage a write via command-plane (confirmation card, no LLM). */
export async function stageCommandPlane(input: {
  utterance: string;
  kind?: string;
  payload?: Record<string, unknown>;
  requestedBy: string;
  role: string | null;
  viewAsRole: string | null;
  actorName: string | null;
}): Promise<CommandStageResult | null> {
  const base = baseUrl("COMMAND_PLANE_URL");
  if (!base) return null;
  const parsed = input.kind && input.payload
    ? { kind: input.kind, payload: input.payload }
    : tryParseCommandArgs(input.utterance);
  if (!parsed) return null;
  try {
    const resp = await fetch(`${base}/stage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(8000),
      body: JSON.stringify({
        utterance: input.utterance,
        kind: parsed.kind,
        payload: parsed.payload,
        requestedBy: input.requestedBy,
        role: input.role,
        viewAsRole: input.viewAsRole,
        actorName: input.actorName,
      }),
    });
    if (!resp.ok) return null;
    const j = await resp.json();
    const sse = typeof j?.sse_text === "string" ? j.sse_text.trim() : "";
    if (!sse) return null;
    return {
      sse_text: sse,
      pending_action_id: String(j?.pending_action_id ?? ""),
      phase: String(j?.phase ?? "staged"),
    };
  } catch {
    return null;
  }
}
