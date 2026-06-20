/** Client-side mirrors of copilot tool argument validation (kept in sync with edge _shared). */

export const SUBMISSION_ROUNDS = ["Submitted", "R1", "R2", "R3", "Offer"] as const;
export const SUBMISSION_OUTCOMES = ["Submitted", "Cleared", "Rejected", "Selected", "Pending"] as const;

export function validateLogSubmissionArgs(args: Record<string, unknown>):
  | { ok: true; normalized: { candidate: string; company: string; role: string; round: string; outcome: string; date: string; lmp_id?: string } }
  | { ok: false; error: string; missing: string[] } {
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
    return { ok: false, error: `Invalid round "${round}"`, missing: [] };
  }
  if (!SUBMISSION_OUTCOMES.includes(outcome as (typeof SUBMISSION_OUTCOMES)[number])) {
    return { ok: false, error: `Invalid outcome "${outcome}"`, missing: [] };
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

export function validateCreateCaseStudyArgs(args: Record<string, unknown>): { ok: true } | { ok: false; error: string } {
  const company = String(args.company || "").trim();
  const role = String(args.role || "").trim();
  if (!company) return { ok: false, error: "company is required" };
  if (!role) return { ok: false, error: "role is required" };
  return { ok: true };
}
