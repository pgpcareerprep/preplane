import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkPermission } from "../../_shared/rbac.ts";
import { POC_WRITABLE_LMP_COLUMNS } from "../../_shared/permissionContract.ts";
import {
  claimPendingActionForExecution,
  stagePendingAction,
} from "../../_shared/copilotPendingActions.ts";
import {
  requestState,
  aiProvider,
  privilegedCopilotRole,
  viewAsBlocksWrites,
  type LmpFetch,
} from "../requestContext.ts";
import { retrieveRAGContext } from "../rag.ts";
import { getCacheClient } from "../cache.ts";
import { executeWebSearch } from "./web_search.ts";
import {
  lmpKeyFromArgs,
  trimStr,
  validateChatWriteKind,
} from "../../_shared/lmpWriteValidation.ts";

async function assertPocOwnsLmp(payload: Record<string, unknown>): Promise<{ ok: true } | { ok: false; reason: string }> {
  const actorRole = requestState().context.role;
  if (privilegedCopilotRole(actorRole)) return { ok: true };

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
        .in("role", ["prep", "support"])
        .limit(1)
        .maybeSingle();
      if (link?.id) return { ok: true };
    }
    // Fallback: exact-token name/alias match on prep/support columns only.
    const tokens = new Set<string>();
    const pushTok = (s: string | null | undefined) => {
      if (!s) return;
      tokens.add(s.trim().toLowerCase());
    };
    pushTok(pocName);
    pocAliases.forEach(pushTok);
    if (tokens.size) {
      const cols = [lmp.prep_poc, lmp.support_poc];
      const present = cols
        .flatMap((c) => String(c || "").split(/[,;/&]/))
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (present.some((p) => tokens.has(p))) return { ok: true };
    }
    return { ok: false, reason: `You are not assigned as a POC on ${company} · ${role}. Only the assigned Prep / Support POC can edit this LMP.` };
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
export async function getLmpRecords(): Promise<LmpFetch> {
  if (requestState().cache.lmp) return requestState().cache.lmp;
  requestState().cache.lmp = fetchLmpFromSupabase();
  return requestState().cache.lmp;
}

export async function getMastersheetRecords(): Promise<Record<string, string>[]> {
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

/** POC read scope: effectiveRole (view-as) or JWT role when acting as self. */
function pocReadScopeName(): string | null {
  const ctx = requestState().context;
  const readRole = ctx.effectiveRole ?? ctx.role;
  const readName = ctx.effectiveName ?? ctx.viewAsName ?? ctx.actorName;
  if (readRole === "poc" && readName) return readName;
  return null;
}

function recordMatchesOperationalPocScope(record: Record<string, string>, pocName: string): boolean {
  return (
    matchesPocFilter(record["Prep POC"] || "", pocName) ||
    matchesPocFilter(record["Support POC"] || "", pocName) ||
    matchesPocFilter(record["Secondary POC"] || "", pocName)
  );
}

function applyPocReadScope(
  records: Record<string, string>[],
  args: Record<string, unknown>,
): Record<string, string>[] {
  const scopePoc = pocReadScopeName();
  if (!scopePoc || args.poc || args.scope_org_wide === true) return records;
  return records.filter((r) => recordMatchesOperationalPocScope(r, scopePoc));
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
  "Closing Date": "closing_date",
  "Mentor Aligned": "mentor_aligned",
  "Prep Doc": "prep_doc",
  "R1 - Names": "r1_names",
  "R2 - Names": "r2_names",
  "R3 - Names": "r3_names",
  "Final Converted Numbers": "final_converted_numbers",
  "Converted Names": "final_converted_names",
  "Final Convert": "final_converted_numbers",
  "Convert Name(s)": "final_converted_names",
};

/** Normalize tool-emitted column labels to canonical sheet keys before mirroring. */
const SHEET_FIELD_ALIASES: Record<string, string> = {
  "R1 Shortlisted": "R1 - Names",
  "R2 Shortlisted": "R2 - Names",
  "R3 Shortlisted": "R3 - Names",
  "R1 Names": "R1 - Names",
  "R2 Names": "R2 - Names",
  "R3 Names": "R3 - Names",
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
  for (const [rawCol, value] of Object.entries(sheetFields)) {
    const sheetCol = SHEET_FIELD_ALIASES[rawCol.trim()] ?? rawCol.trim();
    const dbCol = MIRROR_FIELD_MAP[sheetCol];
    if (dbCol) dbFields[dbCol] = value;
  }
  if (Object.keys(dbFields).length === 0) {
    return { ok: false, skipped: true, error: "No recognized LMP fields in update payload." };
  }
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
  if (viewAsBlocksWrites()) {
    return { blocked: true, reason: "View-as mode is read-only. Switch back to your own perspective to make changes." };
  }
  // 1. Real-role gate.
  const perm = WRITE_KIND_PERMS[kind];
  if (!perm) return { blocked: true, reason: `Unknown write kind: ${kind}` };
  const permResult = checkPermission(requestState().context.role, perm);
  if (!permResult.allowed) {
    return { blocked: true, reason: permResult.reason || `Your role (${requestState().context.role}) cannot perform ${perm}.` };
  }
  // 2. Per-LMP ownership (POC role only — admin/allocator bypass inside assertPocOwnsLmp).
  if (requestState().context.role === "poc") {
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

export async function executeTool(
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
          let q = supa
            .from("poc_profiles")
            .select("id,name,primary_domain,role_type,status", { count: "exact" })
            .neq("role_type", "outreach_poc")
            .eq("status", "active")
            .order("name")
            .limit(limitVal);
          if (args.domain) q = q.ilike("primary_domain", `%${args.domain}%`);
          const { data, count, error } = await q;
          if (error) return JSON.stringify({ error: error.message });
          return JSON.stringify({ count: count ?? data?.length ?? 0, pocs: data ?? [] });
        }

        if (entityType === "lmp") {
          const { records } = await getLmpRecords();
          let filtered = applyPocReadScope(records, args as Record<string, unknown>);
          if (args.status) {
            filtered = filtered.filter((r) => matchesFilter(r["Status"] || "", String(args.status)));
          }
          if (args.domain) {
            filtered = filtered.filter((r) => matchesFilter(r["Domain"] || "", String(args.domain)));
          }
          return JSON.stringify({
            count: filtered.length,
            sample: filtered.slice(0, 5).map((r) => `${r["Company"]} ${r["Role"]}`),
          });
        }

        const { searchEntities: _se } = await import("../../_shared/entitySearch.ts");
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
        if (viewAsBlocksWrites()) {
          return JSON.stringify({
            blocked: true,
            allowed: false,
            reason: "View-as mode is read-only. Switch back to your own perspective to make changes.",
          });
        }
        const kind = String(args.kind || "");
        const payloadRaw = (args.payload as Record<string, unknown>) || {};
        const targetSummary = typeof args.target_summary === "string" ? args.target_summary : undefined;

        const writeVal = validateChatWriteKind(kind, payloadRaw);
        if (!writeVal.ok) {
          return JSON.stringify({
            error: writeVal.error,
            missing: writeVal.missing,
            clarification_needed: true,
            ask: writeVal.ask,
            target_summary: targetSummary,
          });
        }
        const payload = writeVal.normalized;
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

        // Server-staged confirmation: persist row; client/model only round-trips the id.
        if (!requestState().context.userId) {
          return JSON.stringify({ error: "Not authenticated" });
        }
        const staged = await stagePendingAction({
          userId: requestState().context.userId,
          actorName: requestState().context.actorName,
          role: requestState().context.role,
          kind,
          payload,
          currentSnapshot,
          proposedSnapshot,
          source: "chat",
        });
        if ("error" in staged) {
          return JSON.stringify({ error: staged.error });
        }

        return JSON.stringify({
          pending_action_id: staged.id,
          expires_at: staged.expiresAt,
          target_summary: targetSummary,
          current: currentSnapshot,
          proposed: proposedSnapshot,
          sync_impact: syncImpact,
          role: requestState().context.role,
          permission: perm,
        });
      }
      case "execute_pending": {
        if (viewAsBlocksWrites()) {
          return JSON.stringify({
            blocked: true,
            allowed: false,
            reason: "View-as mode is read-only. Switch back to your own perspective to make changes.",
          });
        }
        const id = String(args.pending_action_id || "").trim();
        if (!id) return JSON.stringify({ error: "Missing pending_action_id" });

        const userId = requestState().context.userId;
        if (!userId) return JSON.stringify({ error: "Not authenticated" });

        const claimed = await claimPendingActionForExecution(id, userId);
        if ("error" in claimed) {
          return JSON.stringify({ error: claimed.error, code: claimed.code });
        }

        const kind = claimed.kind;
        const payload = claimed.payload;
        const currentSnapshot = claimed.currentSnapshot;
        const proposedSnapshot = claimed.proposedSnapshot;

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

        // Per-LMP POC ownership re-check at execute time (POC role only).
        if (requestState().context.role === "poc") {
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

        const { searchEntities: _se2 } = await import("../../_shared/entitySearch.ts");
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
        let filtered = applyPocReadScope(records, args as Record<string, unknown>);
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
        const key = lmpKeyFromArgs(args);
        if ("error" in key) return JSON.stringify({ error: key.error, code: key.code });
        const { company, role } = key;
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        const statusCol = headers.indexOf("Status");
        if (companyCol === -1 || roleCol === -1 || statusCol === -1) return JSON.stringify({ error: "Required columns not found" });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === company.toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === role.toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${company} - ${role}` });

        const oldStatus = allRows[rowIndex][statusCol];

        // DB-only write.
        const dbResult = await mirrorLmpUpsert({ company, role, status: args.status as string });

        return JSON.stringify({
          success: dbResult.ok,
          company,
          role,
          old_status: oldStatus,
          new_status: args.status,
          message: `Status updated from "${oldStatus}" to "${args.status}"`,
          db_result: dbResult,
        });
      }

      case "update_lmp_field": {
        const key = lmpKeyFromArgs(args);
        if ("error" in key) return JSON.stringify({ error: key.error, code: key.code });
        const { company, role } = key;
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        if (companyCol === -1 || roleCol === -1) return JSON.stringify({ error: "Required columns not found" });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === company.toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === role.toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${company} - ${role}` });

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

        const dbResult = await mirrorLmpFields(company, role, fields);

        return JSON.stringify({ success: dbResult.ok, company, role, changes, db_result: dbResult });
      }

      case "assign_poc": {
        const key = lmpKeyFromArgs(args);
        if ("error" in key) return JSON.stringify({ error: key.error, code: key.code });
        const { company, role } = key;
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
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === company.toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === role.toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${company} - ${role}` });

        const oldPoc = allRows[rowIndex][targetCol] || "";
        const newRow = [...allRows[rowIndex]];
        newRow[targetCol] = args.poc_name as string;
        const updatedAtCol = headers.indexOf("updatedAt");
        if (updatedAtCol !== -1) newRow[updatedAtCol] = new Date().toISOString();

        const dbResult = await mirrorLmpFields(company, role, { [pocCol]: args.poc_name as string });

        return JSON.stringify({
          success: dbResult.ok,
          company,
          role,
          poc_type: args.poc_type,
          poc_column: pocCol,
          old_poc: oldPoc,
          new_poc: args.poc_name,
          message: `${pocCol} changed from "${oldPoc}" to "${args.poc_name}"`,
          db_result: dbResult,
        });
      }

      case "add_lmp_record": {
        const key = lmpKeyFromArgs(args);
        if ("error" in key) return JSON.stringify({ error: key.error, code: key.code });
        const { company, role } = key;
        const dbResult = await mirrorLmpUpsert({
          company,
          role,
          domain_raw: (args.domain as string) || null,
          type: (args.type as string) || "Full Time",
          status: (args.status as string) || "Ongoing",
          prep_poc: (args.prep_poc as string) || null,
          outreach_poc: (args.outreach_poc as string) || null,
        });

        return JSON.stringify({
          success: dbResult.ok,
          message: `New LMP record created: ${company} - ${role}`,
          record: { company, role, domain: args.domain, type: args.type || "Full Time", status: args.status || "Ongoing" },
          db_result: dbResult,
        });
      }

      case "delete_lmp_record": {
        const key = lmpKeyFromArgs(args);
        if ("error" in key) return JSON.stringify({ error: key.error, code: key.code });
        const { company, role } = key;
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        if (companyCol === -1 || roleCol === -1) return JSON.stringify({ error: "Required columns not found" });

        let rowIndex = -1;
        for (let i = 1; i < allRows.length; i++) {
          if ((allRows[i][companyCol] || "").trim().toLowerCase() === company.toLowerCase() &&
              (allRows[i][roleCol] || "").trim().toLowerCase() === role.toLowerCase()) {
            rowIndex = i;
            break;
          }
        }
        if (rowIndex === -1) return JSON.stringify({ error: `Record not found: ${company} - ${role}` });

        // Soft-close in DB (no hard-delete column today).
        const dbResult = await mirrorLmpUpsert({ company, role, status: "Closed" });

        return JSON.stringify({ success: dbResult.ok, message: `Record soft-deleted: ${company} - ${role}`, db_result: dbResult });
      }

      case "bulk_update": {
        const updates = args.updates as { company: string; role: string; fields: Record<string, string> }[];
        const { headers, allRows } = await getLmpRecords();
        const companyCol = headers.indexOf("Company");
        const roleCol = headers.indexOf("Role");
        if (companyCol === -1 || roleCol === -1) return JSON.stringify({ error: "Required columns not found" });

        const results: { company: string; role: string; success: boolean; error?: string }[] = [];

        for (const upd of updates) {
          const company = trimStr(upd.company);
          const role = trimStr(upd.role);
          if (!company || !role) {
            results.push({
              company: company || "?",
              role: role || "?",
              success: false,
              error: "Missing company or role",
            });
            continue;
          }
          let rowIndex = -1;
          for (let i = 1; i < allRows.length; i++) {
            if ((allRows[i][companyCol] || "").trim().toLowerCase() === company.toLowerCase() &&
                (allRows[i][roleCol] || "").trim().toLowerCase() === role.toLowerCase()) {
              rowIndex = i;
              break;
            }
          }
          if (rowIndex === -1) {
            results.push({ company, role, success: false, error: "Not found" });
            continue;
          }
          results.push({ company, role, success: true });
        }

        // DB-only writes.
        const dbResults: { company: string; role: string; ok: boolean }[] = [];
        for (const upd of updates) {
          const company = trimStr(upd.company);
          const role = trimStr(upd.role);
          const r = results.find((x) => x.company === company && x.role === role);
          if (!r?.success) continue;
          const m = await mirrorLmpFields(company, role, upd.fields);
          dbResults.push({ company, role, ok: m.ok });
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
        let filtered = applyPocReadScope(records, args as Record<string, unknown>);
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
          const ai = aiProvider();
          const expandRes = await fetch(ai.gatewayUrl, {
            method: "POST",
            headers: { Authorization: `Bearer ${ai.keyForChat}`, "Content-Type": "application/json", ...ai.extraHeaders },
            signal: AbortSignal.timeout(90_000),
            body: JSON.stringify({
              model: ai.toolModel,
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

        // Primary: operational prep POCs (exclude outreach-only profiles).
        const primaryQs = new URLSearchParams({
          select: "name,max_threshold",
          status: "eq.active",
          role_type: "eq.prep_poc",
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

        // Outreach: display-only tag — list names for labeling, not operational assignment.
        const outreachRows = await fetchProfiles(
          new URLSearchParams({
            select: "name,max_threshold",
            status: "eq.active",
            role_type: "eq.outreach_poc",
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
            outreach: {
              role: "Outreach POC (display-only tag)",
              candidates: outreachCandidates,
              recommended: outreachCandidates[0]?.name,
              note: "Outreach POC is a display label only — not an operational assignment slot.",
            },
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

      case "web_search":
        return executeWebSearch(args);

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
