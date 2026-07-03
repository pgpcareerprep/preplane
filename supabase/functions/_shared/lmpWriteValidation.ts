/** Shared validation for LMP-targeting copilot write tools (chat + voice). */

export function trimStr(v: unknown): string {
  return String(v ?? "").trim();
}

/** Human label for an LMP — never emits "undefined". */
export function formatLmpLabel(company: unknown, role: unknown): string {
  const c = trimStr(company);
  const r = trimStr(role);
  if (c && r) return `${c} – ${r}`;
  if (c) return c;
  if (r) return r;
  return "the LMP";
}

export type LmpKeyResult =
  | { ok: true; company: string; role: string }
  | { ok: false; error: string; missing: string[] };

export function requireLmpKey(company: unknown, role: unknown): LmpKeyResult {
  const c = trimStr(company);
  const r = trimStr(role);
  const missing: string[] = [];
  if (!c) missing.push("company");
  if (!r) missing.push("role");
  if (missing.length) {
    return { ok: false, error: `Missing required fields: ${missing.join(", ")}`, missing };
  }
  return { ok: true, company: c, role: r };
}

export function lmpKeyFromArgs(
  args: Record<string, unknown>,
): { company: string; role: string } | { error: string; code: "invalid_lmp_key" } {
  const key = requireLmpKey(args.company, args.role);
  if (!key.ok) return { error: key.error, code: "invalid_lmp_key" };
  return { company: key.company, role: key.role };
}

export type WriteValidationResult =
  | { ok: true; normalized: Record<string, unknown> }
  | { ok: false; error: string; ask: string; missing: string[] };

const VOICE_LMP_ACTIONS = new Set([
  "create_lmp",
  "update_lmp_status",
  "update_lmp_field",
  "assign_poc",
  "delete_lmp",
]);

const CHAT_LMP_KINDS = new Set([
  "update_lmp_status",
  "update_lmp_field",
  "assign_poc",
  "delete_lmp_record",
  "add_lmp_record",
]);

function fail(missing: string[], ask?: string): WriteValidationResult {
  const error = `Missing required fields: ${missing.join(", ")}`;
  const defaultAsk = missing.some((m) => m === "company" || m === "role")
    ? "Which LMP did you mean? I need both the company name and the role title."
    : `I need ${missing.join(", ")} before I can stage that change.`;
  return { ok: false, error, ask: ask ?? defaultAsk, missing };
}

export function validateVoicePrepareWrite(input: Record<string, unknown>): WriteValidationResult {
  const action = trimStr(input.action);
  if (!action) return fail(["action"]);

  const normalized: Record<string, unknown> = { ...input, action };

  if (VOICE_LMP_ACTIONS.has(action)) {
    const key = requireLmpKey(input.company, input.role);
    if (!key.ok) {
      return {
        ok: false,
        error: key.error,
        ask: "Which LMP did you mean? I need both the company name and the role title.",
        missing: key.missing,
      };
    }
    normalized.company = key.company;
    normalized.role = key.role;
  }

  switch (action) {
    case "update_lmp_status":
      if (!trimStr(input.status)) return fail(["status"]);
      normalized.status = trimStr(input.status);
      break;
    case "update_lmp_field": {
      const field = trimStr(input.field);
      if (!field) return fail(["field"]);
      if (input.value === undefined || input.value === null) return fail(["value"]);
      normalized.field = field;
      normalized.value = trimStr(input.value);
      break;
    }
    case "assign_poc":
      if (!trimStr(input.poc_name)) return fail(["poc_name"]);
      normalized.poc_name = trimStr(input.poc_name);
      break;
    case "update_student_field": {
      const missing: string[] = [];
      if (!trimStr(input.student_name)) missing.push("student_name");
      if (!trimStr(input.field)) missing.push("field");
      if (input.value === undefined || input.value === null) missing.push("value");
      if (missing.length) return fail(missing);
      normalized.student_name = trimStr(input.student_name);
      normalized.field = trimStr(input.field);
      normalized.value = trimStr(input.value);
      break;
    }
    default:
      break;
  }

  return { ok: true, normalized };
}

export function validateChatWriteKind(
  kind: string,
  payload: Record<string, unknown>,
): WriteValidationResult {
  const k = trimStr(kind);
  if (!CHAT_LMP_KINDS.has(k) && k !== "bulk_update") {
    return { ok: true, normalized: payload };
  }

  if (k === "bulk_update") {
    const updates = Array.isArray(payload.updates)
      ? payload.updates as Record<string, unknown>[]
      : [];
    if (!updates.length) return fail(["updates"]);
    const normalizedUpdates: Record<string, unknown>[] = [];
    for (const u of updates) {
      const key = requireLmpKey(u.company, u.role);
      if (!key.ok) {
        return {
          ok: false,
          error: key.error,
          ask: "Each bulk update needs a company and role.",
          missing: key.missing,
        };
      }
      normalizedUpdates.push({ ...u, company: key.company, role: key.role });
    }
    return { ok: true, normalized: { ...payload, updates: normalizedUpdates } };
  }

  const key = requireLmpKey(payload.company, payload.role);
  if (!key.ok) {
    return {
      ok: false,
      error: key.error,
      ask: "Which LMP did you mean? I need both the company name and the role title.",
      missing: key.missing,
    };
  }
  const normalized: Record<string, unknown> = {
    ...payload,
    company: key.company,
    role: key.role,
  };

  if (k === "update_lmp_status" && !trimStr(payload.status)) return fail(["status"]);
  if (k === "update_lmp_field") {
    const fields = payload.fields as Record<string, unknown> | undefined;
    if (!fields || !Object.keys(fields).length) return fail(["fields"]);
  }
  if (k === "assign_poc" && !trimStr(payload.poc_name)) return fail(["poc_name"]);

  return { ok: true, normalized };
}
