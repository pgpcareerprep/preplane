import { supabase } from "@/integrations/supabase/client";
import type { ColumnMapping, MentorCsvRow } from "@/lib/mentorUpload";
import { fetchCanonicalDomains, normalizeDomain, normalizeDomainList } from "@/lib/domainNormalize";

export type StudentCsvRow = MentorCsvRow;

export const STUDENT_DB_FIELDS = [
  { key: "roll_no", label: "Student ID" },
  { key: "name", label: "Student Name" },
  { key: "email", label: "Student Email ID" },
  { key: "primary_domain", label: "Primary Domain" },
  { key: "other_domains", label: "Secondary Domain" },
  { key: "placement_status", label: "Placement Status" },
  { key: "cohort", label: "Program Name" },
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
  secondary_domain: "other_domains",
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

  // Load canonical domains once for alias-aware normalization.
  const canonicalDomains = await fetchCanonicalDomains();

  const records = rows
    .map((row, idx) => {
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
        errors.push(`Row ${idx + 2}: missing name and roll_no, skipped`);
        skipped++;
        return null;
      }
      if (!rec.name) rec.name = rec.roll_no;
      return rec;
    })
    .filter(Boolean) as Record<string, unknown>[];

  // Pre-fetch existing keys to compute insert vs update.
  const rollNos = records.map((r) => r.roll_no as string | undefined).filter(Boolean) as string[];
  const emails = records
    .filter((r) => !r.roll_no)
    .map((r) => r.email as string | undefined)
    .filter(Boolean) as string[];

  const existingRolls = new Set<string>();
  const existingEmails = new Set<string>();
  if (rollNos.length) {
    const { data } = await supabase.from("students").select("roll_no").in("roll_no", rollNos);
    (data || []).forEach((d: any) => d.roll_no && existingRolls.add(d.roll_no));
  }
  if (emails.length) {
    const { data } = await supabase.from("students").select("email").in("email", emails);
    (data || []).forEach((d: any) => d.email && existingEmails.add(d.email.toLowerCase()));
  }

  const BATCH = 50;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const withRoll = batch.filter((r) => r.roll_no);
    const withEmailOnly = batch.filter((r) => !r.roll_no && r.email);

    if (withRoll.length) {
      const { error } = await supabase
        .from("students")
        .upsert(withRoll as any, { onConflict: "roll_no", ignoreDuplicates: false });
      if (error) {
        errors.push(error.message);
        skipped += withRoll.length;
      } else {
        for (const r of withRoll) {
          if (existingRolls.has(r.roll_no as string)) updated++;
          else inserted++;
        }
      }
    }
    if (withEmailOnly.length) {
      const { error } = await supabase
        .from("students")
        .upsert(withEmailOnly as any, { onConflict: "email", ignoreDuplicates: false });
      if (error) {
        errors.push(error.message);
        skipped += withEmailOnly.length;
      } else {
        for (const r of withEmailOnly) {
          if (existingEmails.has((r.email as string).toLowerCase())) updated++;
          else inserted++;
        }
      }
    }
  }

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
