/**
 * reportAggregator
 * ----------------
 * Combines Supabase records and the connected Google Sheet row(s) for a
 * single LMP process into one normalized report. Supabase wins on conflict;
 * sheet values fill gaps when the DB column is empty.
 */

import { supabase } from "@/integrations/supabase/client";
import { sheets } from "@/lib/sheets/sheetsClient";
import { getHeaderRow, type TabName } from "@/lib/sheets/schema";

// ─────────────────────────── Types ───────────────────────────

export interface AggregatedLmpReport {
  lmpId: string;
  fetchedAt: string;
  source: { supabase: boolean; sheet: boolean; conflicts: string[] };

  process: {
    company: string | null;
    role: string | null;
    domain: string | null;
    status: string | null;
    type: string | null;
    closingDate: string | null;
    prepPoc: string | null;
    supportPoc: string | null;
    outreachPoc: string | null;
    admin: string | null;
    nextProgressDate: string | null;
    nextProgressStatus: string | null;
    remarks: string | null;
  };

  pipeline: {
    shortlisted: number;
    r1: number;
    r2: number;
    r3: number;
    offers: number;
    converted: number;
    candidates: Array<{
      id: string;
      name: string;
      stage: string;
      r1: string;
      r2: string;
      r3: string;
      offer: string | null;
    }>;
  };

  mentors: Array<{
    id: string;
    mentorId: string;
    status: string;
    feedbackAvg: number;
    feedbackCount: number;
    assignedAt: string | null;
  }>;

  sessions: Array<{
    id: string;
    type: string;
    status: string;
    scheduledAt: string | null;
    completedAt: string | null;
    mentorRating: number | null;
    studentRating: number | null;
  }>;

  checklists: Array<{
    key: string;
    label: string;
    completed: boolean;
    completedAt: string | null;
  }>;

  sheet: {
    found: boolean;
    tab: string;
    rowNumber?: number;
    raw: Record<string, string> | null;
  };
}

// ─────────────────── Field-mapping registry cache ───────────────────

interface MappingRow {
  tab_name: string;
  sheet_column: string;
  app_field: string | null;
  sync_direction: string;
  is_mapped: boolean;
}

let mappingCache: { ts: number; rows: MappingRow[] } | null = null;
const MAPPING_TTL_MS = 5 * 60_000;

async function loadMappings(): Promise<MappingRow[]> {
  if (mappingCache && Date.now() - mappingCache.ts < MAPPING_TTL_MS) {
    return mappingCache.rows;
  }
  const { data, error } = await supabase
    .from("field_mapping_registry")
    .select("tab_name, sheet_column, app_field, sync_direction, is_mapped")
    .eq("is_mapped", true)
    .in("sync_direction", ["read", "bidirectional"]);
  if (error) throw new Error(`mapping fetch: ${error.message}`);
  const rows = (data ?? []) as MappingRow[];
  mappingCache = { ts: Date.now(), rows };
  return rows;
}

// ─────────────────────────── Helpers ───────────────────────────

function s(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

function pickField(dbVal: unknown, sheetVal: unknown, fieldName: string, conflicts: string[]): string | null {
  const db = s(dbVal);
  const sh = s(sheetVal);
  if (db && sh && db !== sh) conflicts.push(fieldName);
  return db ?? sh;
}

function matchSheetRow(
  rows: Array<Record<string, string>>,
  sheetRowId: string | null,
  company: string | null,
  role: string | null,
): { row: Record<string, string>; rowNumber: number } | null {
  if (!rows.length) return null;
  // Try sheet_row_id-style match first (any column equal to sheetRowId).
  if (sheetRowId) {
    const idx = rows.findIndex((r) =>
      Object.values(r).some((v) => String(v).trim() === sheetRowId.trim()),
    );
    if (idx >= 0) return { row: rows[idx], rowNumber: idx + 1 };
  }
  if (company && role) {
    const c = company.trim().toLowerCase();
    const r = role.trim().toLowerCase();
    const idx = rows.findIndex(
      (row) =>
        String(row["Company"] ?? "").trim().toLowerCase() === c &&
        String(row["Role"] ?? "").trim().toLowerCase() === r,
    );
    if (idx >= 0) return { row: rows[idx], rowNumber: idx + 1 };
  }
  return null;
}

function countCandidates(
  candidates: Array<Record<string, unknown>>,
): AggregatedLmpReport["pipeline"] {
  const lc = (v: unknown) => String(v ?? "").trim().toLowerCase();
  const advanced = (v: unknown) => {
    const x = lc(v);
    return x === "shortlisted" || x === "selected" || x === "passed" || x === "converted";
  };
  let r1 = 0;
  let r2 = 0;
  let r3 = 0;
  let offers = 0;
  let converted = 0;
  const out: AggregatedLmpReport["pipeline"]["candidates"] = [];
  for (const c of candidates) {
    if (advanced(c.r1_status)) r1 += 1;
    if (advanced(c.r2_status)) r2 += 1;
    if (advanced(c.r3_status)) r3 += 1;
    const offer = s(c.offer_status);
    if (offer) offers += 1;
    if (lc(c.pipeline_stage) === "converted" || lc(c.offer_status) === "accepted") converted += 1;
    out.push({
      id: String(c.id ?? ""),
      name: String(c.student_name ?? ""),
      stage: String(c.pipeline_stage ?? ""),
      r1: String(c.r1_status ?? ""),
      r2: String(c.r2_status ?? ""),
      r3: String(c.r3_status ?? ""),
      offer: offer,
    });
  }
  return {
    shortlisted: candidates.length,
    r1, r2, r3, offers, converted,
    candidates: out,
  };
}

// ───────────────────────── Public API ─────────────────────────

export async function getAggregatedLmpData(lmpId: string): Promise<AggregatedLmpReport> {
  const fetchedAt = new Date().toISOString();
  const conflicts: string[] = [];

  // 1. Parallel Supabase fetches.
  const [processRes, candidatesRes, mentorsRes, sessionsRes] = await Promise.all([
    supabase.from("lmp_processes").select("*").eq("id", lmpId).maybeSingle(),
    supabase.from("lmp_candidates").select("*").eq("lmp_id", lmpId),
    supabase.from("lmp_mentors").select("*").eq("lmp_id", lmpId),
    supabase.from("sessions").select("*").eq("lmp_id", lmpId),
  ]);

  if (processRes.error) throw new Error(`lmp_processes: ${processRes.error.message}`);
  const dbProcess = (processRes.data ?? null) as Record<string, unknown> | null;
  const dbCandidates = (candidatesRes.data ?? []) as Array<Record<string, unknown>>;
  const dbMentors = (mentorsRes.data ?? []) as Array<Record<string, unknown>>;
  const dbChecklists: Array<Record<string, unknown>> = [];
  const dbSessions = (sessionsRes.data ?? []) as Array<Record<string, unknown>>;

  // 2. Sheet fetch — best-effort, never throws.
  const sheetRowId =
    s((dbProcess?.metadata as Record<string, unknown> | undefined)?.sheet_row_id) ??
    s((dbProcess as Record<string, unknown> | null)?.sheet_row_id);
  const company = s(dbProcess?.company);
  const role = s(dbProcess?.role);

  // Sheet read path is removed. DB is the source of truth — every field
  // that used to come from the sheet is already mirrored into lmp_processes
  // by the ingest history. Aggregator now skips the sheet round-trip.
  void s;
  void sheetRowId;
  void company;
  void role;
  const sheetMapped: Record<string, string> = {};
  const sheetInfo: AggregatedLmpReport["sheet"] = { found: false, tab: "", raw: null };

  // 3. Pipeline aggregation.
  const pipeline = countCandidates(dbCandidates);

  // 4. Merge process fields (Supabase wins).
  const process: AggregatedLmpReport["process"] = {
    company: pickField(dbProcess?.company, sheetMapped.company, "company", conflicts),
    role: pickField(dbProcess?.role, sheetMapped.role, "role", conflicts),
    domain: pickField(dbProcess?.domain_raw, sheetMapped.domain_raw, "domain", conflicts),
    status: pickField(dbProcess?.status, sheetMapped.status, "status", conflicts),
    type: pickField(dbProcess?.type, sheetMapped.type, "type", conflicts),
    closingDate: pickField(dbProcess?.closing_date, sheetMapped.closing_date, "closing_date", conflicts),
    prepPoc: pickField(dbProcess?.prep_poc, sheetMapped.prep_poc, "prep_poc", conflicts),
    supportPoc: pickField(dbProcess?.support_poc, sheetMapped.support_poc, "support_poc", conflicts),
    outreachPoc: pickField(dbProcess?.outreach_poc, sheetMapped.outreach_poc, "outreach_poc", conflicts),
    admin: pickField(dbProcess?.admin_owner, sheetMapped.admin_owner, "admin_owner", conflicts),
    nextProgressDate: pickField(dbProcess?.next_progress_date, sheetMapped.next_progress_date, "next_progress_date", conflicts),
    nextProgressStatus: pickField(dbProcess?.next_progress_status, sheetMapped.next_progress_status, "next_progress_status", conflicts),
    remarks: pickField(dbProcess?.remarks, sheetMapped.remarks, "remarks", conflicts),
  };

  return {
    lmpId,
    fetchedAt,
    source: { supabase: !!dbProcess, sheet: sheetInfo.found, conflicts },
    process,
    pipeline,
    mentors: dbMentors.map((m) => ({
      id: String(m.id ?? ""),
      mentorId: String(m.mentor_id ?? ""),
      status: String(m.status ?? ""),
      feedbackAvg: Number(m.feedback_avg ?? 0),
      feedbackCount: Number(m.feedback_count ?? 0),
      assignedAt: s(m.assigned_at),
    })),
    sessions: dbSessions.map((sn) => ({
      id: String(sn.id ?? ""),
      type: String(sn.session_type ?? ""),
      status: String(sn.status ?? ""),
      scheduledAt: s(sn.scheduled_at),
      completedAt: s(sn.completed_at),
      mentorRating: sn.mentor_rating != null ? Number(sn.mentor_rating) : null,
      studentRating: sn.student_rating != null ? Number(sn.student_rating) : null,
    })),
    checklists: dbChecklists.map((c) => ({
      key: String(c.item_key ?? ""),
      label: String(c.label ?? ""),
      completed: Boolean(c.completed),
      completedAt: s(c.completed_at),
    })),
    sheet: sheetInfo,
  };
}
