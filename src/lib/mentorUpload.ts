import { supabase } from "@/integrations/supabase/client";
import { validateMentorRow } from "@/lib/uploadValidation";
import { fetchCanonicalDomains, normalizeDomain } from "@/lib/domainNormalize";

export type MentorCsvRow = Record<string, string>;

export interface ColumnMapping {
  csvColumn: string;
  dbField: string;
}

export const DB_FIELDS = [
  { key: "name", label: "Name" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "designation", label: "Designation" },
  { key: "company", label: "Company" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "functional_domain", label: "Functional Domain" },
  { key: "industry", label: "Industry" },
  { key: "skill_tags", label: "Expertise / Skills" },
  { key: "seniority", label: "Mentor Type / Seniority" },
  { key: "years_of_experience", label: "Years of Experience" },
  { key: "rate", label: "Rate" },
  { key: "currency", label: "Currency" },
  { key: "payment_type", label: "Payment Type" },
  { key: "rating", label: "Rating" },
  { key: "source", label: "Source" },
] as const;

const AUTO_MAP: Record<string, string> = {
  // name
  name: "name",
  full_name: "name",
  mentor_name: "name",
  contact_name: "name",
  mentor: "name",
  speaker: "name",
  poc: "name",
  contact: "name",
  first_name: "first_name",
  firstname: "first_name",
  last_name: "last_name",
  lastname: "last_name",
  surname: "last_name",
  // email
  email: "email",
  e_mail: "email",
  email_address: "email",
  contact_email: "email",
  // phone
  phone: "phone",
  mobile: "phone",
  mobile_number: "phone",
  contact_no: "phone",
  contact_number: "phone",
  whatsapp: "phone",
  // designation
  designation: "designation",
  title: "designation",
  job_title: "designation",
  current_role: "designation",
  current_designation: "designation",
  role: "designation",
  position: "designation",
  current_title: "designation",
  // company
  company: "company",
  organization: "company",
  organisation: "company",
  org: "company",
  employer: "company",
  current_company: "company",
  current_employer: "company",
  firm: "company",
  workplace: "company",
  // linkedin
  linkedin: "linkedin",
  linkedin_url: "linkedin",
  linkedin_profile: "linkedin",
  linkedin_link: "linkedin",
  profile_url: "linkedin",
  profile_link: "linkedin",
  url: "linkedin",
  // functional domain
  functional_domain: "functional_domain",
  domain: "functional_domain",
  primary_domain: "functional_domain",
  area_of_expertise: "functional_domain",
  function: "functional_domain",
  area: "functional_domain",
  category: "functional_domain",
  // industry
  industry: "industry",
  sector: "industry",
  vertical: "industry",
  // skills
  skills: "skill_tags",
  skill_set: "skill_tags",
  skill_tags: "skill_tags",
  core_skills: "skill_tags",
  key_skills: "skill_tags",
  expertise: "skill_tags",
  domains: "skill_tags",
  areas_of_expertise: "skill_tags",
  specialization: "skill_tags",
  specialisation: "skill_tags",
  // seniority
  mentor_type: "seniority",
  seniority: "seniority",
  experience_level: "seniority",
  level: "seniority",
  type: "seniority",
  // misc
  years_of_experience: "years_of_experience",
  yoe: "years_of_experience",
  experience: "years_of_experience",
  rate: "rate",
  currency: "currency",
  payment_type: "payment_type",
  ratings: "rating",
  rating: "rating",
  source: "source",
};

export function autoMapColumns(csvHeaders: string[]): ColumnMapping[] {
  const keys = Object.keys(AUTO_MAP);
  return csvHeaders.map((h) => {
    const norm = h.trim().toLowerCase()
      .replace(/[\/\\]/g, "_")     // slashes to underscore
      .replace(/[\s\-\.]+/g, "_")  // spaces, hyphens, dots to underscore
      .replace(/[^\w_]/g, "")      // remove remaining special chars
      .replace(/_+/g, "_")         // collapse multiple underscores
      .replace(/^_|_$/g, "");      // trim leading/trailing underscores

    let m = AUTO_MAP[norm];

    // Substring fallback (existing behaviour) — known key contained in normalized header
    if (!m) {
      const hit = keys
        .filter((k) => norm.includes(k))
        .sort((a, b) => b.length - a.length)[0];
      if (hit) m = AUTO_MAP[hit];
    }

    // Fuzzy bidirectional fallback — header contained in known key (e.g. "domain" → "functional_domain")
    if (!m) {
      const matchedKey = keys
        .filter((k) => norm.includes(k) || k.includes(norm))
        .sort((a, b) => b.length - a.length)[0];
      if (matchedKey) m = AUTO_MAP[matchedKey];
    }

    return { csvColumn: h, dbField: m && m !== "skip_yoe" ? m : "" };
  });
}

export type MentorUploadResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  validation_errors: number;
  status: "success" | "partial_success" | "failed";
};

export async function uploadMentors(
  rows: MentorCsvRow[],
  mapping: ColumnMapping[],
  admin: { id?: string; email?: string; name?: string },
  fileName = "mentor_union.csv",
): Promise<MentorUploadResult> {
  const errors: string[] = [];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let validationWarnings = 0;

  const mapped = mapping.reduce<Record<string, string>>((acc, m) => {
    if (m.dbField) acc[m.csvColumn] = m.dbField;
    return acc;
  }, {});

  // Load canonical domains once for alias-aware normalization.
  const canonicalDomains = await fetchCanonicalDomains();

  const records = rows
    .map((row, idx) => {
      const rec: Record<string, unknown> = { sync_source: "csv_upload" };
      let firstName = "", lastName = "";
      for (const [csvCol, dbField] of Object.entries(mapped)) {
        const val = (row[csvCol] || "").trim();
        if (!val) continue;
        if (dbField === "skill_tags") {
          rec[dbField] = val.split(/[,;|]+/).map((s) => s.trim()).filter(Boolean);
        } else if (dbField === "functional_domain") {
          rec[dbField] = normalizeDomain(val, canonicalDomains) ?? val;
        } else if (dbField === "rate" || dbField === "years_of_experience") {
          const n = parseFloat(val);
          if (!isNaN(n)) rec[dbField] = n;
        } else if (dbField === "first_name") { firstName = val; }
        else if (dbField === "last_name") { lastName = val; }
        else { rec[dbField] = val; }
      }
      if (!rec.name && (firstName || lastName)) {
        rec.name = [firstName, lastName].filter(Boolean).join(" ").trim();
      }
      if (!rec.name) {
        errors.push(`Row ${idx + 2}: missing name, skipped`);
        skipped++;
        return null;
      }
      if (!rec.source) rec.source = "MU";

      // Non-blocking validation warnings.
      const warnings = validateMentorRow(rec, idx);
      if (warnings.length) {
        validationWarnings += warnings.length;
        warnings.forEach((w) => errors.push(w.replace(/^Row (\d+):/, "Row $1 (warning):")));
      }
      return rec;
    })
    .filter(Boolean) as Record<string, unknown>[];

  // Pre-fetch existing rows by email -> id (PostgREST upsert can't target the
  // partial unique index on mentors.email, so we do manual insert/update).
  const emails = records.map(r => (r.email as string | undefined)?.toLowerCase()).filter(Boolean) as string[];
  const existingByEmail = new Map<string, string>(); // email -> id
  if (emails.length) {
    const { data } = await supabase.from("mentors").select("id,email").in("email", emails);
    (data || []).forEach((d: any) => d.email && existingByEmail.set(d.email.toLowerCase(), d.id));
  }

  const BATCH = 50;

  // 1) Updates for existing emails
  const updates = records.filter(r => r.email && existingByEmail.has((r.email as string).toLowerCase()));
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    for (const rec of batch) {
      const id = existingByEmail.get((rec.email as string).toLowerCase())!;
      const { error } = await supabase.from("mentors").update(rec as any).eq("id", id);
      if (error) { errors.push(error.message); skipped++; }
      else updated++;
    }
  }

  // 2) Inserts for new emails + email-less rows
  const inserts = records.filter(r => !r.email || !existingByEmail.has((r.email as string).toLowerCase()));
  for (let i = 0; i < inserts.length; i += BATCH) {
    const batch = inserts.slice(i, i + BATCH);
    const { error } = await supabase.from("mentors").insert(batch as any);
    if (error) { errors.push(error.message); skipped += batch.length; }
    else inserted += batch.length;
  }

  const status: MentorUploadResult["status"] =
    errors.length === 0 ? "success" : (inserted + updated > 0 ? "partial_success" : "failed");

  await supabase.from("data_source_sync_history").insert({
    source_type: "mentor_union",
    file_name: fileName,
    uploaded_by_admin_id: admin.id ?? null,
    uploaded_by_admin_email: admin.email ?? null,
    total_rows: rows.length,
    inserted_rows: inserted,
    updated_rows: updated,
    skipped_rows: skipped,
    error_rows: errors.length,
    validation_summary: { errors: errors.slice(0, 20), validation_errors: validationWarnings },
    status,
  });
  await supabase.rpc("refresh_data_source_status", { _source: "mentor_union" });

  await supabase.from("activity_log").insert({
    entity_type: "mentor_upload",
    action: "csv_upload",
    actor_name: admin.name || admin.email || "Admin",
    source: "ui",
    metadata: { row_count: inserted + updated, error_count: errors.length, validation_errors: validationWarnings },
  });

  return { inserted, updated, skipped, errors, validation_errors: validationWarnings, status };
}
