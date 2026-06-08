import type { ParsedAlumniRow } from "@/lib/alumniStore";

export type FieldCheck = { valid: boolean; error?: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\d{7,15}$/;
const ROLL_RE = /^[A-Za-z0-9_-]+$/;

export function validateEmail(val: string): FieldCheck {
  if (!val) return { valid: false, error: "Invalid email format" };
  return EMAIL_RE.test(val.trim())
    ? { valid: true }
    : { valid: false, error: "Invalid email format" };
}

export function validatePhone(val: string): FieldCheck {
  const v = (val ?? "").trim();
  if (!v) return { valid: true };
  const stripped = v.replace(/[\s-]+/g, "");
  return PHONE_RE.test(stripped)
    ? { valid: true }
    : { valid: false, error: "Invalid phone number" };
}

export function validateUrl(val: string): FieldCheck {
  const v = (val ?? "").trim();
  if (!v) return { valid: true };
  try {
    const u = new URL(v);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return { valid: false, error: "Invalid URL" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL" };
  }
}

function rowPrefix(rowIdx: number) {
  return `Row ${rowIdx + 2}`;
}

function asStr(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

export function validateMentorRow(rec: Record<string, unknown>, rowIdx: number): string[] {
  const errors: string[] = [];
  const p = rowPrefix(rowIdx);

  const name = asStr(rec.name);
  if (!name) errors.push(`${p}: missing name`);

  const email = asStr(rec.email);
  if (email && !validateEmail(email).valid) errors.push(`${p}: invalid email format`);

  const phone = asStr(rec.phone);
  if (phone && !validatePhone(phone).valid) errors.push(`${p}: invalid phone number`);

  if (rec.rate !== undefined && rec.rate !== null && rec.rate !== "") {
    const n = typeof rec.rate === "number" ? rec.rate : parseFloat(String(rec.rate));
    if (!Number.isFinite(n)) errors.push(`${p}: rate must be numeric`);
  }

  return errors;
}

export function validateAlumniRow(rec: ParsedAlumniRow, rowIdx: number): string[] {
  const errors: string[] = [];
  const p = rowPrefix(rowIdx);

  if (!asStr(rec.student_name)) errors.push(`${p}: missing student name`);

  const email = asStr(rec.mu_email_id);
  if (email && !validateEmail(email).valid) errors.push(`${p}: invalid email format`);

  const link = asStr(rec.linkedin_profile);
  if (link && !validateUrl(link).valid) errors.push(`${p}: invalid LinkedIn URL`);

  return errors;
}

export function validateStudentRow(rec: Record<string, unknown>, rowIdx: number): string[] {
  const errors: string[] = [];
  const p = rowPrefix(rowIdx);

  if (!asStr(rec.name)) errors.push(`${p}: missing name`);

  const roll = asStr(rec.roll_no);
  if (roll && !ROLL_RE.test(roll)) errors.push(`${p}: invalid roll number`);

  const email = asStr(rec.email);
  if (email && !validateEmail(email).valid) errors.push(`${p}: invalid email format`);

  if (!asStr(rec.primary_domain)) errors.push(`${p}: missing primary_domain`);

  return errors;
}
