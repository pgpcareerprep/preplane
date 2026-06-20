import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { checkPermission } from "./rbac.ts";

export const SUBMISSION_ROUNDS = ["Submitted", "R1", "R2", "R3", "Offer"] as const;
export const SUBMISSION_OUTCOMES = ["Submitted", "Cleared", "Rejected", "Selected", "Pending"] as const;

export type NormalizedSubmission = {
  candidate: string;
  company: string;
  role: string;
  lmp_id?: string;
  round: string;
  outcome: string;
  date: string;
};

export type ValidationResult =
  | { ok: true; normalized: NormalizedSubmission }
  | { ok: false; error: string; missing: string[] };

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function validateLogSubmissionArgs(args: Record<string, unknown>): ValidationResult {
  const candidate = String(args.candidate || args.candidate_name || "").trim();
  const company = String(args.company || "").trim();
  const role = String(args.role || "").trim();
  const lmpId = String(args.lmp_id || "").trim();
  const round = String(args.round || "").trim();
  const outcome = String(args.outcome || "").trim();
  const date = String(args.date || new Date().toISOString().slice(0, 10)).trim();

  const missing: string[] = [];
  if (!candidate) missing.push("candidate");
  if (!lmpId && (!company || !role)) missing.push("company/role or lmp_id");
  if (!round) missing.push("round");
  if (!outcome) missing.push("outcome");
  if (!date) missing.push("date");

  if (missing.length) {
    return { ok: false, error: `Missing required fields: ${missing.join(", ")}`, missing };
  }

  if (!SUBMISSION_ROUNDS.includes(round as (typeof SUBMISSION_ROUNDS)[number])) {
    return { ok: false, error: `Invalid round "${round}". Use: ${SUBMISSION_ROUNDS.join(", ")}`, missing: [] };
  }
  if (!SUBMISSION_OUTCOMES.includes(outcome as (typeof SUBMISSION_OUTCOMES)[number])) {
    return { ok: false, error: `Invalid outcome "${outcome}". Use: ${SUBMISSION_OUTCOMES.join(", ")}`, missing: [] };
  }

  return {
    ok: true,
    normalized: {
      candidate,
      company,
      role,
      lmp_id: lmpId || undefined,
      round,
      outcome,
      date,
    },
  };
}

function roundField(round: string): { column: string; pipelineStage?: string } {
  switch (round) {
    case "R1": return { column: "r1_status" };
    case "R2": return { column: "r2_status" };
    case "R3": return { column: "r3_status" };
    case "Offer": return { column: "offer_status" };
    case "Submitted": return { column: "pipeline_stage", pipelineStage: "submitted" };
    default: return { column: "pipeline_stage" };
  }
}

export async function writeSubmissionRecord(
  input: NormalizedSubmission,
  actor: { id: string; name: string; role: string },
): Promise<{ ok: true; summary: string; candidate_id: string; lmp_id: string } | { ok: false; error: string }> {
  const perm = checkPermission(actor.role, "update_candidate_stage");
  if (!perm.allowed) return { ok: false, error: perm.reason || "Not allowed to log submissions" };

  const c = sb();
  let lmpId = input.lmp_id;
  let company = input.company;
  let role = input.role;

  if (lmpId) {
    const { data: lmp } = await c.from("lmp_processes").select("id,company,role").eq("id", lmpId).maybeSingle();
    if (!lmp?.id) return { ok: false, error: "LMP not found for lmp_id" };
    company = String(lmp.company || company);
    role = String(lmp.role || role);
    lmpId = lmp.id;
  } else {
    const { data: lmp } = await c
      .from("lmp_processes")
      .select("id,company,role")
      .ilike("company", company)
      .ilike("role", role)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lmp?.id) return { ok: false, error: `LMP not found for ${company} · ${role}` };
    lmpId = lmp.id;
    company = String(lmp.company);
    role = String(lmp.role);
  }

  const { data: existing } = await c
    .from("lmp_candidates")
    .select("id,r1_status,r2_status,r3_status,pipeline_stage,offer_status")
    .eq("lmp_id", lmpId)
    .ilike("student_name", input.candidate)
    .limit(1)
    .maybeSingle();

  const { column, pipelineStage } = roundField(input.round);
  const updatePayload: Record<string, unknown> = {
    sync_source: "copilot_log_submission",
    updated_at: new Date().toISOString(),
  };
  if (column === "pipeline_stage") {
    updatePayload.pipeline_stage = pipelineStage || input.outcome.toLowerCase();
  } else {
    updatePayload[column] = input.outcome;
  }

  let candidateId: string;
  let previousValue = "—";

  if (existing?.id) {
    candidateId = existing.id;
    previousValue = String((existing as Record<string, unknown>)[column] || "—");
    const { error } = await c.from("lmp_candidates").update(updatePayload).eq("id", candidateId);
    if (error) return { ok: false, error: error.message };
  } else {
    const insertRow = {
      lmp_id: lmpId,
      student_name: input.candidate,
      pipeline_stage: pipelineStage || "pool",
      added_by: actor.id,
      sync_source: "copilot_log_submission",
      ...updatePayload,
    };
    const { data: inserted, error } = await c.from("lmp_candidates").insert(insertRow).select("id").single();
    if (error) return { ok: false, error: error.message };
    candidateId = inserted.id;
  }

  const newValue = `${input.round}: ${input.outcome} (${input.date})`;
  await c.from("activity_log").insert({
    actor_name: actor.name,
    poc_role_type: actor.role === "admin" ? "admin" : actor.role === "allocator" ? "system" : "primary",
    entity_type: "candidate",
    entity_id: candidateId,
    action: `Logged submission for ${input.candidate} @ ${company} · ${role}`,
    previous_value: previousValue,
    new_value: newValue,
  });

  return {
    ok: true,
    summary: `Logged ${input.candidate}'s ${input.round} submission (${input.outcome}) for ${company} · ${role}`,
    candidate_id: candidateId,
    lmp_id: lmpId,
  };
}
