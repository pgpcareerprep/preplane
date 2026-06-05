// Centralized Alumni DB - backed by Supabase `alumni_records`.
// A small in-memory cache mirrors the latest fetched rows so synchronous
// consumers (mentor matching, MatchContextModal previews) keep working.
//
// MIGRATION REQUIRED: ALTER TABLE alumni_records ADD CONSTRAINT alumni_unique_name_cohort UNIQUE (student_name, cohort);
// Run this in Supabase SQL editor before deploying this change.

import { supabase } from "@/integrations/supabase/client";

export type ALUMentor = {
  id: string;
  name: string;
  cohort?: string;
  muEmail?: string;
  linkedin?: string;
  industry?: string;
  domain1?: string;
  domain2?: string;
  currentCompany?: string;
  currentRole?: string;
  // legacy positional company/role fields kept for back-compat consumers
  company2?: string;
  role2?: string;
  company3?: string;
  role3?: string;
  company4?: string;
  role4?: string;
  company5?: string;
  role5?: string;
  company6?: string;
  role6?: string;
  allCompanies: string[];
  allRoles: string[];
  skills: string[];
  uploadedAt: string;
};

export type ALUStore = {
  mentors: ALUMentor[];
  lastUploadedAt: string | null;
  totalCount: number;
};

// ── In-memory cache (mirrors latest DB fetch) ──────────────────────────────
let _cache: ALUStore = { mentors: [], lastUploadedAt: null, totalCount: 0 };

export function getALUStore(): ALUStore {
  return _cache;
}

export function clearALUStore(): void {
  _cache = { mentors: [], lastUploadedAt: null, totalCount: 0 };
}

/** Internal: replace cache from a hook (used by useAlumniMentors). */
export function _setAlumniCache(mentors: ALUMentor[]): void {
  _cache = {
    mentors,
    totalCount: mentors.length,
    lastUploadedAt: mentors[0]?.uploadedAt ?? null,
  };
}

const SKILL_KEYWORDS = [
  "product management", "product strategy", "growth", "analytics", "marketing",
  "branding", "seo", "sem", "performance marketing", "b2b", "b2c", "saas",
  "fintech", "edtech", "healthtech", "ecommerce", "go-to-market", "gtm",
  "customer success", "account management", "data analysis", "market research",
  "ux", "ui", "figma", "design", "engineering", "java", "python", "sql",
  "machine learning", "finance", "accounting", "fundraising", "operations",
  "supply chain", "sales", "bd", "business development", "partnerships",
  "consulting", "strategy", "leadership", "communication",
];

export function inferSkillsFromAlumni(a: Partial<ALUMentor>): string[] {
  const text = [
    a.currentRole, a.role2, a.role3, a.role4, a.role5, a.role6,
    a.domain1, a.domain2, a.industry,
  ].filter(Boolean).join(" ").toLowerCase();
  return SKILL_KEYWORDS.filter(skill => text.includes(skill));
}

// ── CSV parsing (used by upload modal) ─────────────────────────────────────
export type ParsedAlumniRow = {
  student_name: string;
  cohort?: string;
  mu_email_id?: string;
  linkedin_profile?: string;
  industry?: string;
  domain_1?: string;
  domain_2?: string;
  current_city?: string;
  current_state?: string;
  location?: string;
  current_company?: string;
  current_role_title?: string;
  company_2?: string;
  role_2?: string;
  company_3?: string;
  company_4?: string;
  role_4?: string;
  company_5?: string;
  role_5?: string;
  company_6?: string;
  role_6?: string;
};

const ALU_HEADER_MAP: Record<string, keyof ParsedAlumniRow> = {
  // Name
  "student name": "student_name",
  "studentname": "student_name",
  "name": "student_name",
  "full name": "student_name",
  "fullname": "student_name",
  "alumni name": "student_name",
  "alumniname": "student_name",
  "candidate name": "student_name",
  "participant name": "student_name",
  // Cohort
  "cohort": "cohort",
  "batch": "cohort",
  "program batch": "cohort",
  "class": "cohort",
  // Email
  "mu email id": "mu_email_id",
  "mu email": "mu_email_id",
  "email": "mu_email_id",
  "email id": "mu_email_id",
  "email address": "mu_email_id",
  "contact email": "mu_email_id",
  "mail": "mu_email_id",
  // LinkedIn
  "linkedin profile": "linkedin_profile",
  "linkedin": "linkedin_profile",
  "linkedin url": "linkedin_profile",
  "profile url": "linkedin_profile",
  "profile link": "linkedin_profile",
  "linkedin link": "linkedin_profile",
  "url": "linkedin_profile",
  // Industry
  "industry": "industry",
  "sector": "industry",
  "vertical": "industry",
  // Domain
  "domain 1": "domain_1",
  "domain1": "domain_1",
  "primary domain": "domain_1",
  "domain": "domain_1",
  "area of expertise": "domain_1",
  "domain 2": "domain_2",
  "domain2": "domain_2",
  "secondary domain": "domain_2",
  // Location
  "current city": "current_city",
  "city": "current_city",
  "current state": "current_state",
  "state": "current_state",
  "location": "location",
  "country": "location",
  // Company (current/primary)
  "current company": "current_company",
  "company": "current_company",
  "company 1": "current_company",
  "company1": "current_company",
  "organisation": "current_company",
  "organization": "current_company",
  "employer": "current_company",
  "current employer": "current_company",
  // Role (current/primary)
  "current role": "current_role_title",
  "current role title": "current_role_title",
  "role": "current_role_title",
  "role 1": "current_role_title",
  "role1": "current_role_title",
  "title": "current_role_title",
  "designation": "current_role_title",
  "current designation": "current_role_title",
  "current title": "current_role_title",
  "job title": "current_role_title",
  "position": "current_role_title",
  // Companies 2–6 + paired roles (no role_3 — header layout omits it)
  "company 2": "company_2",
  "company2": "company_2",
  "role 2": "role_2",
  "role2": "role_2",
  "company 3": "company_3",
  "company3": "company_3",
  "company 4": "company_4",
  "company4": "company_4",
  "role 4": "role_4",
  "role4": "role_4",
  "company 5": "company_5",
  "company5": "company_5",
  "role 5": "role_5",
  "role5": "role_5",
  "company 6": "company_6",
  "company6": "company_6",
  "role 6": "role_6",
  "role6": "role_6",
  // Underscored sequential roles (CSV variant): Role_1/2/3 → role_4/5/6
  // (paired positionally with Company 4/5/6 in the canonical layout).
  // Note: plain "Role 1" (no underscore) keeps its existing meaning of
  // current_role_title; only the underscored form is treated positionally.
  "role_1": "role_4",
  "role_2": "role_5",
  "role_3": "role_6",
};

export type AlumniSkippedRow = { row: number; reason: string };

export type ParsedAlumniResult = {
  parsed: ParsedAlumniRow[];
  skipped: AlumniSkippedRow[];
};

// DB field options shown in the upload modal's Map step.
export const ALU_DB_FIELDS = [
  { key: "student_name", label: "Student Name" },
  { key: "cohort", label: "Cohort" },
  { key: "mu_email_id", label: "Email" },
  { key: "linkedin_profile", label: "LinkedIn" },
  { key: "industry", label: "Industry" },
  { key: "domain_1", label: "Domain 1" },
  { key: "domain_2", label: "Domain 2" },
  { key: "current_city", label: "Current City" },
  { key: "current_state", label: "Current State" },
  { key: "location", label: "Location" },
  { key: "current_company", label: "Current Company" },
  { key: "current_role_title", label: "Current Role" },
  { key: "company_2", label: "Company 2" },
  { key: "role_2", label: "Role 2" },
  { key: "company_3", label: "Company 3" },
  { key: "company_4", label: "Company 4" },
  { key: "role_4", label: "Role 4" },
  { key: "company_5", label: "Company 5" },
  { key: "role_5", label: "Role 5" },
  { key: "company_6", label: "Company 6" },
  { key: "role_6", label: "Role 6" },
] as const;

/** Normalize a raw CSV header for ALU_HEADER_MAP lookup. */
function normalizeAluHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ").replace(/[^\w\s]/g, "");
}

/** Resolve a CSV header to a ParsedAlumniRow field, with fuzzy fallbacks. */
function resolveAluField(h: string): keyof ParsedAlumniRow | undefined {
  const key = normalizeAluHeader(h);
  return ALU_HEADER_MAP[key]
    ?? ALU_HEADER_MAP[key.replace(/\s+/g, "")]
    ?? ALU_HEADER_MAP[key.replace(/\s+/g, "_")];
}

/**
 * Auto-map CSV headers to ParsedAlumniRow fields.
 *
 * Special handling for the canonical Alumni header layout where multiple
 * "Role" columns appear without numeric suffixes — each unsuffixed "Role"
 * is bound positionally to the most recent preceding "Company N" header
 * (Company 2 → role_2, Company 4 → role_4, Company 5 → role_5, Company 6 → role_6).
 * Company 3 has no paired Role column in the spec and is preserved as-is.
 */
export function autoMapAlumniColumns(csvHeaders: string[]) {
  const used = new Set<string>();
  let lastCompanyIdx: number | null = null;

  const isPlainRole = (raw: string) => normalizeAluHeader(raw) === "role";
  const companyIdxFromHeader = (raw: string): number | null => {
    const k = normalizeAluHeader(raw);
    const m = k.match(/^company\s*(\d+)$/);
    if (m) return parseInt(m[1], 10);
    if (k === "current company" || k === "company") return 1;
    return null;
  };
  const roleFieldForCompanyIdx = (n: number): keyof ParsedAlumniRow | null => {
    if (n === 1) return "current_role_title";
    if (n === 2) return "role_2";
    if (n === 4) return "role_4";
    if (n === 5) return "role_5";
    if (n === 6) return "role_6";
    return null; // Company 3 has no paired Role
  };

  return csvHeaders.map((h) => {
    const cIdx = companyIdxFromHeader(h);
    if (cIdx !== null) lastCompanyIdx = cIdx;

    let field: keyof ParsedAlumniRow | undefined;
    if (isPlainRole(h) && lastCompanyIdx !== null) {
      const positional = roleFieldForCompanyIdx(lastCompanyIdx);
      if (positional && !used.has(positional)) field = positional;
    }
    if (!field) field = resolveAluField(h);

    if (field && !used.has(field)) {
      used.add(field);
      return { csvColumn: h, dbField: field as string };
    }
    return { csvColumn: h, dbField: "" };
  });
}

/**
 * Parse alumni CSV rows. If `mappingOrHeaders` is a `ColumnMapping[]`, it's
 * treated as the explicit user-confirmed mapping (csvColumn → dbField).
 * Otherwise it's treated as the raw header list (legacy auto-resolve).
 */
export function parseAlumniCsvRows(
  rows: Record<string, string>[],
  mappingOrHeaders: string[] | { csvColumn: string; dbField: string }[],
): ParsedAlumniResult {
  const resolved: { header: string; field: keyof ParsedAlumniRow }[] = [];
  const used = new Set<keyof ParsedAlumniRow>();

  const isMapping =
    Array.isArray(mappingOrHeaders) &&
    mappingOrHeaders.length > 0 &&
    typeof (mappingOrHeaders[0] as any) === "object" &&
    "csvColumn" in (mappingOrHeaders[0] as any);

  if (isMapping) {
    for (const m of mappingOrHeaders as { csvColumn: string; dbField: string }[]) {
      if (!m.dbField) continue;
      const field = m.dbField as keyof ParsedAlumniRow;
      if (used.has(field)) continue;
      resolved.push({ header: m.csvColumn, field });
      used.add(field);
    }
  } else {
    for (const h of mappingOrHeaders as string[]) {
      const field = resolveAluField(h);
      if (field && !used.has(field)) {
        resolved.push({ header: h, field });
        used.add(field);
      }
    }
  }

  const parsed: ParsedAlumniRow[] = [];
  const skipped: AlumniSkippedRow[] = [];
  rows.forEach((row, idx) => {
    const rowNum = idx + 2;
    const rec: Partial<ParsedAlumniRow> = {};
    for (const { header, field } of resolved) {
      const v = (row[header] || "").trim();
      if (v) rec[field] = v;
    }
    if (!rec.student_name) {
      skipped.push({ row: rowNum, reason: `Row ${rowNum}: Missing student_name — skipped` });
      return;
    }
    // Only skip if we have literally no professional context at all
    const hasProfContext = rec.current_company || rec.current_role_title ||
                           rec.domain_1 || rec.domain_2 || rec.industry;
    if (!hasProfContext) {
      skipped.push({
        row: rowNum,
        reason: `Row ${rowNum}: No professional context (company, role, domain, or industry) — skipped`,
      });
      return;
    }
    parsed.push(rec as ParsedAlumniRow);
  });
  return { parsed, skipped };
}

// ── DB load / upload ───────────────────────────────────────────────────────
export function rowToALUMentor(r: any): ALUMentor {
  const partial: Partial<ALUMentor> = {
    name: r.student_name,
    cohort: r.cohort || undefined,
    muEmail: r.mu_email_id || undefined,
    linkedin: r.linkedin_profile || undefined,
    industry: r.industry || undefined,
    domain1: r.domain_1 || undefined,
    domain2: r.domain_2 || undefined,
    currentCompany: r.current_company || undefined,
    currentRole: r.current_role_title || undefined,
  };
  return {
    ...partial,
    id: r.id,
    allCompanies: [r.current_company].filter(Boolean) as string[],
    allRoles: [r.current_role_title].filter(Boolean) as string[],
    skills: inferSkillsFromAlumni(partial),
    uploadedAt: r.uploaded_at,
  } as ALUMentor;
}

/** Loads alumni rows from Supabase into the in-memory cache. */
export async function loadAlumniFromDb(): Promise<ALUStore> {
  const { data, error } = await supabase
    .from("alumni_records")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (error) {
    console.warn("[alumniStore] failed to load:", error.message);
    return _cache;
  }
  const mentors = (data || []).map(rowToALUMentor);
  _cache = {
    mentors,
    totalCount: mentors.length,
    lastUploadedAt: mentors[0]?.uploadedAt ?? null,
  };
  return _cache;
}

export type AlumniUploadResult = {
  inserted: number;
  updated: number;
  skipped: number;
  /** Rows dropped because the same key appeared multiple times in this file. */
  inFileDuplicates: number;
  /** Skip reasons surfaced from CSV parsing (missing fields, etc.). */
  parseSkipReasons: string[];
  errors: string[];
  status: "success" | "partial_success" | "failed";
};

const norm = (v?: string | null) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};
const lower = (v?: string | null) => {
  const s = norm(v);
  return s ? s.toLowerCase() : null;
};

export async function uploadAlumniRecords(
  rows: ParsedAlumniRow[],
  fileName: string,
  admin: { id?: string; email?: string },
  extraErrors: string[] = [],
): Promise<AlumniUploadResult> {
  const errors: string[] = [];
  const parseSkipReasons = [...extraErrors];
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let inFileDuplicates = 0;

  // Normalise rows up-front (trim + lowercase dedupe keys)
  const normalised = rows.map((r) => ({
    ...r,
    student_name: norm(r.student_name) || "",
    cohort: norm(r.cohort) || undefined,
    mu_email_id: lower(r.mu_email_id) || undefined,
    linkedin_profile: lower(r.linkedin_profile) || undefined,
  }));

  // ── In-file dedupe (last wins) ──────────────────────────────────────────
  const byEmail = new Map<string, ParsedAlumniRow>();
  const byLink = new Map<string, ParsedAlumniRow>();
  const byNameCohort = new Map<string, ParsedAlumniRow>();

  for (const r of normalised) {
    if (r.mu_email_id) {
      if (byEmail.has(r.mu_email_id)) inFileDuplicates++;
      byEmail.set(r.mu_email_id, r);
    } else if (r.linkedin_profile) {
      if (byLink.has(r.linkedin_profile)) inFileDuplicates++;
      byLink.set(r.linkedin_profile, r);
    } else {
      const key = `${r.student_name.toLowerCase()}|${(r.cohort ?? "").toLowerCase()}`;
      if (byNameCohort.has(key)) inFileDuplicates++;
      byNameCohort.set(key, r);
    }
  }

  let emailRows = [...byEmail.values()];
  let linkRows = [...byLink.values()];
  const plainRows = [...byNameCohort.values()];

  // Reroute rows whose (name, cohort) already exists in DB through the
  // name+cohort upsert path. Without this, the email/linkedin upsert hits a
  // cross-constraint duplicate-key violation and Postgres rejects the batch.
  const allNameCohortCandidates = [...emailRows, ...linkRows];
  if (allNameCohortCandidates.length) {
    const names = allNameCohortCandidates.map((r) => r.student_name);
    const { data: ncExisting } = await supabase
      .from("alumni_records")
      .select("student_name,cohort,mu_email_id,linkedin_profile")
      .in("student_name", names);
    const ncSet = new Set(
      (ncExisting || []).map(
        (d: any) =>
          `${(d.student_name || "").toLowerCase()}|${(d.cohort || "").toLowerCase()}`,
      ),
    );
    const reroute = (r: ParsedAlumniRow) => {
      const k = `${(r.student_name || "").toLowerCase()}|${(r.cohort || "").toLowerCase()}`;
      return ncSet.has(k);
    };
    const rerouted: ParsedAlumniRow[] = [];
    emailRows = emailRows.filter((r) => {
      if (reroute(r)) { rerouted.push(r); return false; }
      return true;
    });
    linkRows = linkRows.filter((r) => {
      if (reroute(r)) { rerouted.push(r); return false; }
      return true;
    });
    plainRows.push(...rerouted);
  }


  // Pre-fetch existing dedupe keys to count inserted vs updated
  const existingEmails = new Set<string>();
  const existingLinks = new Set<string>();
  const existingNameCohort = new Set<string>();
  if (emailRows.length) {
    const { data } = await supabase
      .from("alumni_records").select("mu_email_id").in("mu_email_id", emailRows.map((r) => r.mu_email_id!));
    (data || []).forEach((d: any) => d.mu_email_id && existingEmails.add(d.mu_email_id.toLowerCase()));
  }
  if (linkRows.length) {
    const { data } = await supabase
      .from("alumni_records").select("linkedin_profile").in("linkedin_profile", linkRows.map((r) => r.linkedin_profile!));
    (data || []).forEach((d: any) => d.linkedin_profile && existingLinks.add(d.linkedin_profile.toLowerCase()));
  }
  if (plainRows.length) {
    const { data } = await supabase
      .from("alumni_records").select("student_name,cohort").in("student_name", plainRows.map((r) => r.student_name));
    (data || []).forEach((d: any) =>
      existingNameCohort.add(`${(d.student_name || "").toLowerCase()}|${(d.cohort || "").toLowerCase()}`));
  }

  const now = new Date().toISOString();
  const stamp = <T extends ParsedAlumniRow>(rs: T[]) =>
    rs.map((r) => ({
      ...r,
      source_file_name: fileName,
      uploaded_by_admin_id: admin.id ?? null,
      uploaded_by_admin_email: admin.email ?? null,
      uploaded_at: now,
      updated_at: now,
    }));

  const BATCH = 100;
  const upsertBatched = async (
    bucket: ReturnType<typeof stamp>,
    onConflict: string,
    countAs: (r: any) => "insert" | "update",
  ) => {
    for (let i = 0; i < bucket.length; i += BATCH) {
      const slice = bucket.slice(i, i + BATCH);
      const { error } = await supabase
        .from("alumni_records")
        .upsert(slice, { onConflict, ignoreDuplicates: false });
      if (error) {
        errors.push(error.message);
        skipped += slice.length;
      } else {
        for (const r of slice) {
          if (countAs(r) === "update") updated++;
          else inserted++;
        }
      }
    }
  };

  await upsertBatched(stamp(emailRows), "mu_email_id",
    (r) => existingEmails.has(r.mu_email_id) ? "update" : "insert");
  await upsertBatched(stamp(linkRows), "linkedin_profile",
    (r) => existingLinks.has(r.linkedin_profile) ? "update" : "insert");
  await upsertBatched(stamp(plainRows), "student_name,cohort",
    (r) => existingNameCohort.has(`${(r.student_name || "").toLowerCase()}|${(r.cohort || "").toLowerCase()}`)
      ? "update" : "insert");

  // Total skipped surface = parse-time skips + in-file duplicates + DB-failed rows
  skipped += parseSkipReasons.length + inFileDuplicates;

  const status: AlumniUploadResult["status"] =
    errors.length === 0 && parseSkipReasons.length === 0 && inFileDuplicates === 0
      ? "success"
      : (inserted + updated > 0 ? "partial_success" : "failed");

  await supabase.from("data_source_sync_history").insert({
    source_type: "alumni_db",
    file_name: fileName,
    uploaded_by_admin_id: admin.id ?? null,
    uploaded_by_admin_email: admin.email ?? null,
    total_rows: rows.length + parseSkipReasons.length,
    inserted_rows: inserted,
    updated_rows: updated,
    skipped_rows: skipped,
    error_rows: errors.length,
    validation_summary: {
      errors: errors.slice(0, 20),
      skipped_reasons: parseSkipReasons.slice(0, 50),
      in_file_duplicates: inFileDuplicates,
    },
    status,
  });
  await supabase.rpc("refresh_data_source_status", { _source: "alumni_db" });
  // Mirror alumni rows into the mentors table so findMentors() picks them up
  // immediately (a DB trigger keeps them in sync afterwards).
  try {
    const { error: mirrorErr } = await supabase.rpc("refresh_alumni_mentor_mirror");
    if (mirrorErr) console.warn("[alumniStore] refresh_alumni_mentor_mirror:", mirrorErr.message);
  } catch (e) {
    console.warn("[alumniStore] refresh_alumni_mentor_mirror threw:", e);
  }
  await loadAlumniFromDb();

  return { inserted, updated, skipped, inFileDuplicates, parseSkipReasons, errors, status };
}
