import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/logger";
import type { ColumnMapping, MentorCsvRow } from "@/lib/mentorUpload";
import { fetchCanonicalDomains, normalizeDomain, normalizeDomainList } from "@/lib/domainNormalize";

export type PocCsvRow = MentorCsvRow;

export const POC_DB_FIELDS = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "role_type", label: "Role" },
  { key: "primary_domain", label: "Primary Domain" },
  { key: "domain_tags", label: "Supported Domains" },
  { key: "status", label: "Status" },
  { key: "max_threshold", label: "Max Threshold" },
] as const;

export const POC_REQUIRED_FIELDS = ["name", "role_type"];

const AUTO_MAP_POCS: Record<string, string> = {
  name: "name",
  full_name: "name",
  poc_name: "name",
  email: "email",
  email_id: "email",
  email_address: "email",
  role: "role_type",
  role_type: "role_type",
  type: "role_type",
  poc_type: "role_type",
  primary_domain: "primary_domain",
  domain: "primary_domain",
  main_domain: "primary_domain",
  supported_domains: "domain_tags",
  domain_tags: "domain_tags",
  domains: "domain_tags",
  other_domains: "domain_tags",
  status: "status",
  active: "status",
  availability: "status",
  max_threshold: "max_threshold",
  threshold: "max_threshold",
  capacity: "max_threshold",
  max_load: "max_threshold",
};

export function autoMapPocColumns(csvHeaders: string[]): ColumnMapping[] {
  return csvHeaders.map((h) => {
    const norm = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
    return { csvColumn: h, dbField: AUTO_MAP_POCS[norm] || "" };
  });
}

const ROLE_NORMALIZE: Record<string, string> = {
  prep: "prep_poc",
  prep_poc: "prep_poc",
  preppoc: "prep_poc",
  support: "support_poc",
  support_poc: "support_poc",
  outreach: "outreach_poc",
  outreach_poc: "outreach_poc",
  admin: "admin",
  allocator: "allocator",
  mod: "allocator",
};

const normRole = (v?: string | null): string => {
  const k = (v || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ROLE_NORMALIZE[k] || "prep_poc";
};

const normStatus = (v?: string | null): "active" | "inactive" => {
  const k = (v || "").trim().toLowerCase();
  if (!k) return "active";
  if (["inactive", "off", "false", "no", "disabled", "unavailable"].includes(k)) return "inactive";
  return "active";
};

const splitTags = (v?: string | null): string[] => {
  if (!v) return [];
  return String(v)
    .split(/[;,|\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
};

export type PocUploadResult = {
  inserted: number;
  updated: number;
  skipped: number;
  errors: string[];
  status: "success" | "partial_success" | "failed";
};

// (poc_registry helper removed — poc_profiles is now canonical)
export async function uploadPocs(
  rows: PocCsvRow[],
  mapping: ColumnMapping[],
  admin: { id?: string; email?: string; name?: string },
  fileName = "poc_db.csv",
): Promise<PocUploadResult> {
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

  // Build records and validate
  const records = rows
    .map((row, idx) => {
      const rowNum = idx + 2;
      const rec: any = { sync_source: "csv_upload" };
      for (const [csvCol, dbField] of Object.entries(mapped)) {
        const val = (row[csvCol] || "").trim();
        if (!val) continue;
        if (dbField === "domain_tags") rec.domain_tags = normalizeDomainList(splitTags(val), canonicalDomains);
        else if (dbField === "primary_domain") rec.primary_domain = normalizeDomain(val, canonicalDomains) ?? val;
        else if (dbField === "max_threshold") {
          const n = parseInt(val, 10);
          if (!Number.isNaN(n)) rec.max_threshold = n;
        } else if (dbField === "role_type") rec.role_type = normRole(val);
        else if (dbField === "status") rec.status = normStatus(val);
        else if (dbField === "email") rec.email = val.toLowerCase();
        else rec[dbField] = val;
      }
      if (!rec.name) {
        errors.push(`Row ${rowNum}: missing name — skipped`);
        skipped++;
        return null;
      }
      if (!rec.role_type) rec.role_type = "prep_poc";
      if (!rec.status) rec.status = "active";
      if (!rec.domain_tags) rec.domain_tags = [];
      const isOutreach = rec.role_type === "outreach_poc" || rec.role_type === "outreach";
      if (isOutreach) {
        rec.max_threshold = null;
      } else if (rec.max_threshold == null) {
        rec.max_threshold = 8;
      } else if (rec.max_threshold < 1 || rec.max_threshold > 50) {
        errors.push(`Row ${rowNum}: max_threshold ${rec.max_threshold} out of range (1–50) — clamped`);
        rec.max_threshold = Math.max(1, Math.min(50, rec.max_threshold));
      }
      return { rowNum, rec };
    })
    .filter((x): x is { rowNum: number; rec: any } => !!x);

  // Pre-fetch existing rows by email + by name (when no email)
  const emails = [...new Set(records.map((r) => r.rec.email).filter(Boolean))] as string[];
  const names = [...new Set(records.filter((r) => !r.rec.email).map((r) => r.rec.name))] as string[];

  const existingByEmail = new Map<string, string>(); // email → id
  const existingByName = new Map<string, string>(); // name → id
  if (emails.length) {
    const { data } = await supabase
      .from("poc_profiles").select("id,email").in("email", emails);
    (data || []).forEach((p: any) => p.email && existingByEmail.set(p.email.toLowerCase(), p.id));
  }
  if (names.length) {
    const { data } = await supabase
      .from("poc_profiles").select("id,name").in("name", names);
    (data || []).forEach((p: any) => p.name && existingByName.set(p.name, p.id));
  }

  for (const { rowNum, rec } of records) {
    try {
      const existingId = rec.email
        ? existingByEmail.get(rec.email)
        : existingByName.get(rec.name);

      const profilePayload: any = {
        name: rec.name,
        email: rec.email ?? null,
        role_type: rec.role_type,
        status: rec.status,
        primary_domain: rec.primary_domain ?? null,
        domain_tags: rec.domain_tags,
      };

      if (existingId) {
        const { error } = await supabase
          .from("poc_profiles").update(profilePayload).eq("id", existingId);
        if (error) {
          errors.push(`Row ${rowNum}: ${error.message}`);
          skipped++;
          continue;
        }
        updated++;
      } else {
        const { error } = await supabase
          .from("poc_profiles").insert(profilePayload);
        if (error) {
          errors.push(`Row ${rowNum}: ${error.message}`);
          skipped++;
          continue;
        }
        inserted++;
      }

      // poc_registry is deprecated; poc_profiles is the canonical store.
    } catch (e: any) {
      errors.push(`Row ${rowNum}: ${e?.message || "unknown error"}`);
      skipped++;
    }
  }

  const status: PocUploadResult["status"] =
    errors.length === 0 && skipped === 0
      ? "success"
      : (inserted + updated > 0 ? "partial_success" : "failed");

  await supabase.from("data_source_sync_history").insert({
    source_type: "poc_db",
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
  // best-effort status refresh; ignore if RPC doesn't know this source
  try {
    await supabase.rpc("refresh_data_source_status", { _source: "poc_db" });
  } catch (e) {
    log.warn("[pocUpload] refresh_data_source_status failed", e);
  }

  return { inserted, updated, skipped, errors, status };
}
