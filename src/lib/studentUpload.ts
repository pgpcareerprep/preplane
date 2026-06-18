import { supabase } from "@/integrations/supabase/client";
import type { ColumnMapping, MentorCsvRow } from "@/lib/mentorUpload";
import { fetchCanonicalDomains, normalizeDomain, normalizeDomainList } from "@/lib/domainNormalize";
import { validateStudentCsvDuplicates } from "@/lib/uploadValidation";

export type StudentCsvRow = MentorCsvRow;

export const STUDENT_DB_FIELDS = [
  { key: "roll_no", label: "Student ID" },
  { key: "name", label: "Student Name" },
  { key: "email", label: "Student Email ID" },
  { key: "primary_domain", label: "Primary Domain" },
  { key: "secondary_domain", label: "Secondary Domain" },
  { key: "other_domains", label: "Other Domains" },
  { key: "placement_status", label: "Placement Status" },
  { key: "cohort", label: "Program / Cohort" },
  { key: "phone", label: "Phone" },
] as const;

const AUTO_MAP_STUDENTS: Record<string, string> = {
  roll_no: "roll_no",
  rollno: "roll_no",
  roll: "roll_no",
  roll_number: "roll_no",
  name: "name",
  student_name: "name",
  full_name: "name",
  email: "email",
  email_id: "email",
  emailid: "email",
  email_address: "email",
  emailaddress: "email",
  mail: "email",
  mail_id: "email",
  mu_email: "email",
  mu_email_id: "email",
  student_email: "email",
  student_email_id: "email",
  student_emailid: "email",
  students_email: "email",
  students_email_id: "email",
  personal_email: "email",
  official_email: "email",
  primary_email: "email",
  contact_email: "email",
  primary_domain: "primary_domain",
  domain: "primary_domain",
  actual_domain: "primary_domain",
  other_domains: "other_domains",
  secondary_domain: "secondary_domain",
  other_domain: "other_domains",
  placement_status: "placement_status",
  status: "placement_status",
  placement: "placement_status",
  cohort: "cohort",
  batch: "cohort",
  program: "cohort",
  program_name: "cohort",
  student_id: "roll_no",
  studentid: "roll_no",
  phone: "phone",
  mobile: "phone",
  mobile_number: "phone",

};

export function autoMapStudentColumns(csvHeaders: string[]): ColumnMapping[] {
  return csvHeaders.map((h) => {
    const norm = h.trim().toLowerCase().replace(/[\s\-_]+/g, "_");
    return { csvColumn: h, dbField: AUTO_MAP_STUDENTS[norm] || "" };
  });
}

export const STUDENT_REQUIRED_FIELDS = ["name|roll_no", "email", "primary_domain"];

export type StudentUploadResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  status: "success" | "partial_success" | "failed";
};

type ExistingStudent = {
  id: string;
  email: string | null;
  roll_no: string | null;
  name: string;
};

type ParsedStudentRow = {
  rowNum: number;
  rec: Record<string, unknown>;
};

type ResolvedWrite = {
  rowNum: number;
  kind: "insert" | "update";
  id?: string;
  payload: Record<string, unknown>;
};

const STUDENT_UPLOAD_FIELDS = [
  "roll_no",
  "name",
  "email",
  "primary_domain",
  "secondary_domain",
  "other_domains",
  "placement_status",
  "cohort",
  "phone",
  "sync_source",
] as const;

const BATCH_SIZE = 50;

function buildStudentPayload(rec: Record<string, unknown>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const key of STUDENT_UPLOAD_FIELDS) {
    if (rec[key] !== undefined && rec[key] !== null && rec[key] !== "") {
      payload[key] = rec[key];
    }
  }
  if (payload.roll_no) {
    payload.student_code = payload.roll_no;
  }
  return payload;
}

async function fetchExistingStudents(
  rollNos: string[],
  emails: string[],
): Promise<{ students: ExistingStudent[]; error?: string }> {
  const byId = new Map<string, ExistingStudent>();

  const addRows = (rows: ExistingStudent[] | null) => {
    for (const row of rows || []) {
      byId.set(row.id, row);
    }
  };

  const CHUNK = 200;
  for (let i = 0; i < rollNos.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("students")
      .select("id, email, roll_no, name")
      .in("roll_no", rollNos.slice(i, i + CHUNK));
    if (error) return { students: [], error: error.message };
    addRows(data as ExistingStudent[]);
  }

  for (let i = 0; i < emails.length; i += CHUNK) {
    const { data, error } = await supabase
      .from("students")
      .select("id, email, roll_no, name")
      .in("email", emails.slice(i, i + CHUNK));
    if (error) return { students: [], error: error.message };
    addRows(data as ExistingStudent[]);
  }

  return { students: [...byId.values()] };
}

async function executeInsertBatch(
  batch: ResolvedWrite[],
): Promise<{ inserted: number; errors: string[]; skipped: number }> {
  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];
  const payloads = batch.map((b) => b.payload);

  const { data, error } = await supabase
    .from("students")
    .insert(payloads)
    .select("id, email, roll_no, name");

  if (!error) {
    return { inserted: batch.length, errors, skipped };
  }

  for (const item of batch) {
    const { error: rowError } = await supabase.from("students").insert(item.payload);
    if (rowError) {
      errors.push(`Row ${item.rowNum}: ${rowError.message}`);
      skipped++;
    } else {
      inserted++;
    }
  }
  return { inserted, errors, skipped };
}

async function executeUpdateBatch(
  batch: ResolvedWrite[],
): Promise<{ updated: number; errors: string[]; skipped: number }> {
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const payloads = batch.map((b) => ({ id: b.id, ...b.payload }));

  const { error } = await supabase
    .from("students")
    .upsert(payloads, { onConflict: "id", ignoreDuplicates: false });

  if (!error) {
    return { updated: batch.length, errors, skipped };
  }

  for (const item of batch) {
    const { error: rowError } = await supabase
      .from("students")
      .update(item.payload)
      .eq("id", item.id!);
    if (rowError) {
      errors.push(`Row ${item.rowNum}: ${rowError.message}`);
      skipped++;
    } else {
      updated++;
    }
  }
  return { updated, errors, skipped };
}

async function syncCandidatesAfterUpload(): Promise<void> {
  const { error } = await supabase.rpc("sync_lmp_candidates_from_students_after_student_upload");
  if (error) {
    console.warn("[studentUpload] candidate sync RPC failed:", error.message);
  }
}

export async function uploadStudents(
  rows: StudentCsvRow[],
  mapping: ColumnMapping[],
  admin: { id?: string; email?: string; name?: string },
  fileName = "students.csv",
): Promise<StudentUploadResult> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;

  const mapped = mapping.reduce<Record<string, string>>((acc, m) => {
    if (m.dbField) acc[m.csvColumn] = m.dbField;
    return acc;
  }, {});

  const canonicalDomains = await fetchCanonicalDomains();

  const parsedRows: ParsedStudentRow[] = [];

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx];
    const rowNum = idx + 2;
    const rec: Record<string, unknown> = { sync_source: "csv_upload" };

    for (const [csvCol, dbField] of Object.entries(mapped)) {
      const val = (row[csvCol] || "").trim();
      if (!val) continue;
      if (dbField === "other_domains") {
        const parts = val.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean);
        rec[dbField] = normalizeDomainList(parts, canonicalDomains).join(", ");
      } else if (dbField === "primary_domain") {
        rec[dbField] = normalizeDomain(val, canonicalDomains) ?? val;
      } else if (dbField === "email") {
        rec[dbField] = val.toLowerCase();
      } else {
        rec[dbField] = val;
      }
    }

    const hasName = !!rec.name;
    const hasRoll = !!rec.roll_no;
    if (!hasName && !hasRoll) {
      errors.push(`Row ${rowNum}: missing name and roll_no, skipped`);
      skipped++;
      continue;
    }
    if (!rec.name) rec.name = rec.roll_no;

    parsedRows.push({ rowNum, rec });
  }

  const duplicateErrors = validateStudentCsvDuplicates(parsedRows.map((p) => p.rec));
  if (duplicateErrors.length) {
    return {
      inserted: 0,
      updated: 0,
      skipped: rows.length,
      errors: duplicateErrors,
      status: "failed",
    };
  }

  const rollNos = [
    ...new Set(
      parsedRows
        .map((p) => p.rec.roll_no as string | undefined)
        .filter(Boolean) as string[],
    ),
  ];
  const emails = [
    ...new Set(
      parsedRows
        .map((p) => p.rec.email as string | undefined)
        .filter(Boolean) as string[],
    ),
  ];

  const { students: existingStudents, error: fetchError } = await fetchExistingStudents(rollNos, emails);
  if (fetchError) {
    errors.push(fetchError);
    const status: StudentUploadResult["status"] = "failed";
    await supabase.from("data_source_sync_history").insert({
      source_type: "student_db",
      file_name: fileName,
      uploaded_by_admin_id: admin.id ?? null,
      uploaded_by_admin_email: admin.email ?? null,
      total_rows: rows.length,
      inserted_rows: 0,
      updated_rows: 0,
      skipped_rows: rows.length,
      error_rows: errors.length,
      validation_summary: { errors: errors.slice(0, 20) },
      status,
    });
    await supabase.rpc("refresh_data_source_status", { _source: "student_db" });
    return { inserted: 0, updated: 0, skipped: rows.length, errors, status };
  }

  const existingByEmail = new Map<string, ExistingStudent>();
  const existingByRollNo = new Map<string, ExistingStudent>();
  for (const student of existingStudents) {
    if (student.email) existingByEmail.set(student.email.toLowerCase(), student);
    if (student.roll_no) existingByRollNo.set(student.roll_no, student);
  }

  const toInsert: ResolvedWrite[] = [];
  const toUpdate: ResolvedWrite[] = [];

  for (const { rowNum, rec } of parsedRows) {
    const email = rec.email as string | undefined;
    const rollNo = rec.roll_no as string | undefined;
    const emailMatch = email ? existingByEmail.get(email.toLowerCase()) : undefined;
    const rollMatch = rollNo ? existingByRollNo.get(rollNo) : undefined;

    if (emailMatch && rollMatch && emailMatch.id !== rollMatch.id) {
      errors.push(
        `Row ${rowNum}: email belongs to one existing student but Student ID belongs to another. Please resolve conflict.`,
      );
      skipped++;
      continue;
    }

    const payload = buildStudentPayload(rec);
    const target = emailMatch ?? rollMatch;

    if (target) {
      toUpdate.push({ rowNum, kind: "update", id: target.id, payload });
      const merged: ExistingStudent = {
        id: target.id,
        name: (payload.name as string | undefined) ?? target.name,
        email: (payload.email as string | undefined) ?? target.email,
        roll_no: (payload.roll_no as string | undefined) ?? target.roll_no,
      };
      if (merged.email) existingByEmail.set(merged.email.toLowerCase(), merged);
      if (merged.roll_no) existingByRollNo.set(merged.roll_no, merged);
    } else {
      toInsert.push({ rowNum, kind: "insert", payload });
    }
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const result = await executeInsertBatch(batch);
    inserted += result.inserted;
    skipped += result.skipped;
    errors.push(...result.errors);
  }

  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    const batch = toUpdate.slice(i, i + BATCH_SIZE);
    const result = await executeUpdateBatch(batch);
    updated += result.updated;
    skipped += result.skipped;
    errors.push(...result.errors);
  }

  await syncCandidatesAfterUpload();

  const status: StudentUploadResult["status"] =
    errors.length === 0 ? "success" : inserted + updated > 0 ? "partial_success" : "failed";

  await supabase.from("data_source_sync_history").insert({
    source_type: "student_db",
    file_name: fileName,
    uploaded_by_admin_id: admin.id ?? null,
    uploaded_by_admin_email: admin.email ?? null,
    total_rows: rows.length,
    inserted_rows: inserted,
    updated_rows: updated,
    skipped_rows: skipped,
    error_rows: errors.length,
    validation_summary: { errors: errors.slice(0, 20) },
    status,
  });
  await supabase.rpc("refresh_data_source_status", { _source: "student_db" });

  await supabase.from("activity_log").insert({
    entity_type: "student_upload",
    action: "csv_upload",
    actor_name: admin.name || admin.email || "Admin",
    source: "ui",
    metadata: { row_count: inserted + updated, error_count: errors.length },
  });

  return { inserted, updated, skipped, errors, status };
}
