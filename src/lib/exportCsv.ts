import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { LmpRecord } from "@/lib/lmpTypes";

const PAGE = 1000;

function escapeCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (typeof v === "object") {
    try { s = JSON.stringify(v); } catch { s = String(v); }
  } else {
    s = String(v);
  }
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], headers?: string[]) {
  const cols = headers && headers.length
    ? headers
    : Array.from(rows.reduce<Set<string>>((acc, r) => {
        Object.keys(r || {}).forEach((k) => acc.add(k));
        return acc;
      }, new Set<string>()));
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCell(row?.[c])).join(","));
  }
  const csv = lines.join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportTableToCsv(
  table: string,
  filename: string,
  opts?: { columns?: string; orderBy?: string },
): Promise<void> {
  const t = toast.loading(`Exporting ${table}…`);
  try {
    const cols = opts?.columns ?? "*";
    let all: Record<string, unknown>[] = [];
    let from = 0;
     
    while (true) {
      let q = (supabase as any).from(table).select(cols).range(from, from + PAGE - 1);
      if (opts?.orderBy) q = q.order(opts.orderBy, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      const batch = (data ?? []) as Record<string, unknown>[];
      all = all.concat(batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    if (!all.length) {
      toast.dismiss(t);
      toast.message("Nothing to export", { description: `${table} has no rows.` });
      return;
    }
    downloadCsv(filename, all);
    toast.dismiss(t);
    toast.success(`Exported ${all.length.toLocaleString()} rows`);
  } catch (e: any) {
    toast.dismiss(t);
    toast.error("Export failed", { description: e?.message || String(e) });
  }
}

export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Export the already-loaded, already-filtered board LmpRecord[] as CSV.
 *
 * This function NEVER runs a new database query — it operates on the records
 * already authorised and scoped by the board (View As, board scope, domain/
 * status/text/overdue filters all already applied).
 *
 * It is therefore safe to call during View As: it can only export what is
 * currently visible, not the full lmp_processes table.
 */
const LMP_BOARD_CSV_HEADERS = [
  "lmp_code", "company", "role", "domain", "status", "type",
  "process_date", "closing_date",
  "admin_owner", "allocator", "prep_poc", "support_poc", "outreach_poc",
  "candidate_count",
  "daily_progress", "prep_progress", "placement_progress",
  "r1_names", "r2_names", "r3_names",
  "final_converted_numbers", "final_converted_names",
  "next_progress_date", "next_progress_type",
  "jd_url",
  "prep_doc_link",
  "mentor_aligned",
  "assignment_review",
  "remarks",
  "created_at",
  "updated_at",
];

function sanitiseFilename(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function exportLmpBoardCsv(records: LmpRecord[], scopeLabel: string): void {
  if (!records.length) {
    toast.message("No records to export", { description: "The current filtered list is empty." });
    return;
  }

  const firstDocUrl = (r: LmpRecord): string => {
    if (!r.documents?.length) return typeof r.prepDoc === "string" && r.prepDoc.startsWith("http") ? r.prepDoc : "";
    return r.documents[0]?.url ?? "";
  };

  const rows = records.map((r) => ({
    lmp_code: r.lmpCode ?? r.reqId ?? "",
    company: r.company ?? "",
    role: r.role ?? "",
    domain: r.domain ?? "",
    status: r.status ?? "",
    type: r.type ?? "",
    process_date: r.createdAt ? r.createdAt.slice(0, 10) : "",
    closing_date: r.closingDate ?? "",
    admin_owner: r.adminOwner ?? "",
    allocator: r.allocator ?? "",
    prep_poc: r.prepPoc?.name ?? r.domainPrepPoc?.name ?? "",
    support_poc: r.supportPoc?.name ?? r.behavioralPrepPoc?.name ?? "",
    outreach_poc: r.outreachPoc?.name ?? "",
    candidate_count: r.candidates ?? 0,
    daily_progress: r.dailyProgress ?? "",
    prep_progress: r.prepProgress ?? "",
    placement_progress: r.placementProgress ?? "",
    r1_names: r.r1Names ?? "",
    r2_names: r.r2Names ?? "",
    r3_names: r.r3Names ?? "",
    final_converted_numbers: r.finalConvertedNumbers ?? "",
    final_converted_names: r.finalConvertedNames ?? "",
    next_progress_date: r.nextExpectedProgress ?? "",
    next_progress_type: r.nextExpectedType ?? "",
    jd_url: r.jdUrl ?? "",
    prep_doc_link: firstDocUrl(r),
    mentor_aligned: r.mentorAligned != null ? String(r.mentorAligned) : "",
    assignment_review: r.assignmentReview != null ? String(r.assignmentReview) : "",
    remarks: r.reason ?? "",
    created_at: r.createdAt ?? "",
    updated_at: r.lastActivity ?? "",
  }));

  const filename = `lmp_${sanitiseFilename(scopeLabel)}_${dateStamp()}.csv`;
  downloadCsv(filename, rows, LMP_BOARD_CSV_HEADERS);
  toast.success(`Exported ${rows.length.toLocaleString()} rows`);
}

// ---------- LMP Processes: cleaned export ----------
const LMP_CLEAN_HEADERS = [
  "lmp_code", "company", "role", "domain", "status", "type",
  "date", "closing_date",
  "admin_owner", "allocator", "prep_poc", "support_poc", "outreach_pocs",
  "daily_progress", "prep_progress", "placement_progress",
  "r1_names", "r2_names", "r3_names", "final_converted_numbers", "final_converted_names",
  "next_progress_date", "next_progress_type", "next_progress_status",
  "jd_file_name", "jd_url", "jd_uploaded_by", "jd_uploaded_at",
  "prep_doc_link",
  "mentor_aligned", "mentor_selected", "mentor_rating", "mentor_suggestions",
  "match_tag", "allocation_reason", "score_total", "score_skill", "score_source", "score_prestige", "score_seniority",
  "assignment_review", "one_to_one_mock", "behavioral_status",
  "remarks", "created_at", "updated_at",
];

function asObj(v: any): any {
  if (v == null) return null;
  if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } }
  return v;
}

function joinNames(v: any): string {
  const o = asObj(v);
  if (!o) return "";
  const arr = Array.isArray(o) ? o : [o];
  return arr.map((m: any) => m?.name || m?.label || "").filter(Boolean).join(", ");
}

export async function exportLmpProcessesCsv(filename: string): Promise<void> {
  const t = toast.loading("Exporting LMP processes…");
  try {
    // Lookups
    const [{ data: domains }, { data: pocs }] = await Promise.all([
      (supabase as any).from("domains").select("id,name"),
      (supabase as any).from("poc_profiles").select("id,name"),
    ]);
    const domainName = new Map<string, string>((domains ?? []).map((d: any) => [d.id, d.name]));
    const pocName = new Map<string, string>((pocs ?? []).map((p: any) => [p.id, p.name]));
    const resolvePoc = (id: any, fallback: any) => (id && pocName.get(id)) || fallback || "";
    const resolvePocList = (ids: any, fallback: any) => {
      const arr = Array.isArray(ids) ? ids : (asObj(ids) || []);
      const names = (Array.isArray(arr) ? arr : []).map((x: any) => pocName.get(x)).filter(Boolean);
      if (names.length) return names.join(", ");
      return typeof fallback === "string" ? fallback : "";
    };

    // Fetch all processes
    let all: any[] = [];
    let from = 0;
    while (true) {
      const { data, error } = await (supabase as any)
        .from("lmp_processes").select("*").order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const batch = data ?? [];
      all = all.concat(batch);
      if (batch.length < PAGE) break;
      from += PAGE;
    }
    if (!all.length) {
      toast.dismiss(t);
      toast.message("Nothing to export", { description: "lmp_processes has no rows." });
      return;
    }

    const rows = all.map((r: any) => {
      const prepDoc = asObj(r.prep_doc);
      const score = asObj(r.score_breakdown) || {};
      return {
        lmp_code: r.lmp_code,
        company: r.company,
        role: r.role,
        domain: domainName.get(r.domain_id) || r.domain_raw || "",
        status: r.status,
        type: r.type,
        date: r.date,
        closing_date: r.closing_date,
        admin_owner: r.admin_owner,
        allocator: r.allocator,
        prep_poc: resolvePoc(r.prep_poc_id, r.prep_poc),
        support_poc: resolvePoc(r.support_poc_id, r.support_poc),
        outreach_pocs: resolvePocList(r.outreach_poc_ids, r.outreach_poc),
        daily_progress: r.daily_progress,
        prep_progress: r.prep_progress,
        placement_progress: r.placement_progress,
        r1_names: r.r1_names,
        r2_names: r.r2_names,
        r3_names: r.r3_names,
        final_converted_numbers: r.final_converted_numbers,
        final_converted_names: r.final_converted_names,
        next_progress_date: r.next_progress_date,
        next_progress_type: r.next_progress_type,
        next_progress_status: r.next_progress_status,
        jd_file_name: r.jd_file_name || r.jd_label || "",
        jd_url: r.jd_url || "",
        jd_uploaded_by: r.jd_uploaded_by || "",
        jd_uploaded_at: r.jd_uploaded_at || "",
        prep_doc_link: (prepDoc && (prepDoc.url || prepDoc.link)) || (typeof r.prep_doc === "string" && r.prep_doc.startsWith("http") ? r.prep_doc : ""),
        mentor_aligned: r.mentor_aligned,
        mentor_selected: joinNames(r.mentor_selected),
        mentor_rating: r.mentor_rating,
        mentor_suggestions: joinNames(r.mentor_suggestions),
        match_tag: r.match_tag,
        allocation_reason: r.allocation_reason,
        score_total: score.total ?? "",
        score_skill: score.skill ?? "",
        score_source: score.source ?? "",
        score_prestige: score.prestige ?? "",
        score_seniority: score.seniority ?? "",
        assignment_review: r.assignment_review,
        one_to_one_mock: r.one_to_one_mock,
        behavioral_status: r.behavioral_status,
        remarks: r.remarks,
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    downloadCsv(filename, rows, LMP_CLEAN_HEADERS);
    toast.dismiss(t);
    toast.success(`Exported ${rows.length.toLocaleString()} rows`);
  } catch (e: any) {
    toast.dismiss(t);
    toast.error("Export failed", { description: e?.message || String(e) });
  }
}

