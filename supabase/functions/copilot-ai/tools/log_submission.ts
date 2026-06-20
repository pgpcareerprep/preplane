import { requestState } from "../requestContext.ts";
import {
  SUBMISSION_OUTCOMES,
  SUBMISSION_ROUNDS,
  validateLogSubmissionArgs,
  writeSubmissionRecord,
} from "../../_shared/logSubmissionWrite.ts";

export const LOG_SUBMISSION_SCHEMA = {
  type: "function",
  function: {
    name: "log_submission",
    description:
      "Guided flow to log a candidate submission/interview round outcome for an LMP. Step 1: call with partial args to get an inline-form spec. Step 2: call with all fields to get a confirmation-card payload. Step 3: after user confirms, call with confirmed=true to write. NEVER skip confirmation. Fields: candidate, company, role (or lmp_id), round, outcome, date.",
    parameters: {
      type: "object",
      properties: {
        candidate: { type: "string", description: "Candidate / student name" },
        candidate_name: { type: "string", description: "Alias for candidate" },
        company: { type: "string", description: "Company name for the LMP" },
        role: { type: "string", description: "Role title for the LMP" },
        lmp_id: { type: "string", description: "Optional LMP UUID (alternative to company+role)" },
        round: { type: "string", enum: [...SUBMISSION_ROUNDS], description: "Interview round or submission stage" },
        outcome: { type: "string", enum: [...SUBMISSION_OUTCOMES], description: "Outcome for this round" },
        date: { type: "string", description: "Submission/interview date (YYYY-MM-DD)" },
        confirmed: { type: "boolean", description: "Set true ONLY after user confirms the confirmation-card" },
      },
      additionalProperties: false,
    },
  },
};

function buildInlineForm(defaults: Record<string, string>) {
  return {
    type: "inline-form",
    title: "Log Submission",
    description: "Record a candidate submission or interview round outcome",
    action: "log_submission",
    fields: [
      { name: "candidate", label: "Candidate", field_type: "text", required: true, placeholder: "e.g. Aditya Sharma", defaultValue: defaults.candidate || "" },
      { name: "company", label: "Company", field_type: "text", required: true, placeholder: "e.g. Google", defaultValue: defaults.company || "" },
      { name: "role", label: "Role / LMP", field_type: "text", required: true, placeholder: "e.g. PM Intern", defaultValue: defaults.role || "" },
      { name: "round", label: "Round", field_type: "select", required: true, options: [...SUBMISSION_ROUNDS], defaultValue: defaults.round || "Submitted" },
      { name: "outcome", label: "Outcome", field_type: "select", required: true, options: [...SUBMISSION_OUTCOMES], defaultValue: defaults.outcome || "Submitted" },
      { name: "date", label: "Date", field_type: "date", required: true, defaultValue: defaults.date || new Date().toISOString().slice(0, 10) },
    ],
  };
}

export async function executeLogSubmission(
  args: Record<string, unknown>,
  options: { confirmed?: boolean } = {},
): Promise<string> {
  if (requestState().context.isImpersonating) {
    return JSON.stringify({ blocked: true, reason: "View-as mode is read-only." });
  }

  const validated = validateLogSubmissionArgs(args);
  if (!validated.ok) {
    if (validated.missing.length) {
      return JSON.stringify({
        step: "form",
        missing: validated.missing,
        render: buildInlineForm({
          candidate: String(args.candidate || args.candidate_name || ""),
          company: String(args.company || ""),
          role: String(args.role || ""),
          round: String(args.round || ""),
          outcome: String(args.outcome || ""),
          date: String(args.date || ""),
        }),
        instruction: "Render the inline-form block above. When the user submits the form, call log_submission again with the filled values.",
      });
    }
    return JSON.stringify({ error: validated.error });
  }

  const { normalized } = validated;
  const confirmed = options.confirmed || args.confirmed === true;

  if (!confirmed) {
    const pendingId = crypto.randomUUID();
    return JSON.stringify({
      step: "confirm",
      pending_action_id: pendingId,
      render: {
        type: "confirmation-card",
        title: "Log Submission",
        description: `Record submission for ${normalized.candidate} @ ${normalized.company} · ${normalized.role}`,
        changes: [
          { field: "Candidate", to: normalized.candidate },
          { field: "LMP", to: `${normalized.company} · ${normalized.role}` },
          { field: "Round", to: normalized.round },
          { field: "Outcome", to: normalized.outcome },
          { field: "Date", to: normalized.date },
        ],
        pending_action_id: pendingId,
        sync_impact: "Updates candidate pipeline status and writes an activity-log entry.",
        confirm_action: `Execute log_submission ${pendingId}`,
        confirm_label: "Log Submission",
        cancel_label: "Cancel",
      },
      payload: normalized,
      instruction: "Render the confirmation-card block. STOP. When user confirms, call log_submission with the same payload and confirmed=true.",
    });
  }

  const ctx = requestState().context;
  const result = await writeSubmissionRecord(normalized, {
    id: ctx.userId || "",
    name: ctx.actorName || "Copilot",
    role: ctx.role,
  });

  if (!result.ok) {
    return JSON.stringify({ success: false, error: result.error });
  }

  return JSON.stringify({
    step: "done",
    success: true,
    ...result,
    render: {
      type: "activity-feed",
      title: "Submission Logged",
      entries: [{
        action: result.summary,
        status: "success",
        timestamp: "Just now",
        details: `${normalized.round} → ${normalized.outcome} on ${normalized.date}`,
        follow_ups: ["View LMP pipeline", "Log another submission"],
      }],
    },
    instruction: "Render the activity-feed block summarizing the logged submission.",
  });
}
