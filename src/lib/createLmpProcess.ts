import { supabase } from "@/integrations/supabase/client";
import type { AssignedPoc, AllocationResult } from "@/lib/pocAllocation";
import { TABS, getHeaderRow } from "@/lib/sheets/schema";
import { runInBackground } from "@/lib/utils";
import { toast } from "sonner";

// New LMP processes must be visible on the sheet immediately. Creation writes
// to the database first to get the generated LMP ID, then directly awaits the
// sheet writer instead of waiting for any background queue.

export type ConfirmedPocSelection = {
  prepPoc: AssignedPoc;
  supportPoc?: AssignedPoc | null;
  outreachPoc?: AssignedPoc | null;
  allocation: AllocationResult;
};

export type CreateLmpJdPayload = {
  text?: string;
  url?: string;
  fileName?: string;
  label?: string;
  skills: string[];
  seniority?: string;
  source: "paste" | "file" | "link";
  uploadedBy?: string;
};

export type CreateLmpPayload = {
  company: string;
  role: string;
  domain: string;
  type?: string;
  createdBy?: string;
  selection: ConfirmedPocSelection;
  jd?: CreateLmpJdPayload;
};

async function mirrorCreatedLmpToSheet(lmp: Record<string, unknown>) {
  const company = String(lmp.company ?? "").trim();
  const role = String(lmp.role ?? "").trim();
  const lmpCode = String(lmp.lmp_code ?? "").trim();

  if (!company || !role || !lmpCode) {
    throw new Error("LMP process was saved, but the sheet mirror is missing Company, Role, or LMP ID.");
  }

  const dbPatch = {
    date: lmp.date ?? null,
    company,
    role,
    domain_raw: lmp.domain_raw ?? null,
    status: lmp.status ?? null,
    type: lmp.type ?? null,
    daily_progress: lmp.daily_progress ?? null,
    prep_doc_shared: lmp.prep_doc_shared ?? null,
    mentor_aligned: lmp.mentor_aligned ?? null,
    assignment_review: lmp.assignment_review ?? null,
    one_to_one_mock: lmp.one_to_one_mock ?? null,
    next_progress_date: lmp.next_progress_date ?? null,
    next_progress_type: lmp.next_progress_type ?? null,
    final_convert: lmp.final_convert ?? null,
    convert_names: lmp.convert_names ?? null,
    prep_doc: lmp.prep_doc ?? null,
    prep_poc: lmp.prep_poc ?? null,
    support_poc: lmp.support_poc ?? null,
    outreach_poc: lmp.outreach_poc ?? null,
    closing_date: lmp.closing_date ?? null,
    jd_url: lmp.jd_url ?? null,
    jd_label: lmp.jd_label ?? null,
    allocator: lmp.allocator ?? null,
    admin_owner: lmp.admin_owner ?? null,
    behavioral_status: lmp.behavioral_status ?? null,
    match_tag: lmp.match_tag ?? null,
    allocation_path: lmp.allocation_path ?? null,
    mentor_selected: lmp.mentor_selected ?? null,
    lmp_code: lmpCode,
  };

  const { data, error } = await supabase.functions.invoke("sheets-lmp", {
    headers: { "x-sheet-sweeper": "1" },
    body: {
      op: "sync-db-to-sheet",
      tab: TABS.LMP_TRACKER,
      headerRow: getHeaderRow(TABS.LMP_TRACKER),
      company,
      role,
      lmp_code: lmpCode,
      dbPatch,
    },
  });

  if (error) throw error;
  if ((data as { skipped?: boolean } | null)?.skipped) {
    throw new Error(`Sheet mirror skipped: ${(data as { reason?: string }).reason ?? "unknown reason"}`);
  }
}

export async function createLmpProcess(payload: CreateLmpPayload) {
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // Resolve canonical POC names + domain id in a single parallel batch.
  // Previously: 3 sequential `poc_profiles` lookups + 1 domain lookup = 4 round-trips.
  // Now: 1 batched `in (...)` query + 1 domain lookup, both in parallel.
  const pocIds = [
    payload.selection.prepPoc.pocId,
    payload.selection.supportPoc?.pocId,
    payload.selection.outreachPoc?.pocId,
  ].filter((x): x is string => !!x);

  const [pocRowsRes, domainRes] = await Promise.all([
    pocIds.length
      ? supabase.from("poc_profiles").select("id,name").in("id", pocIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    payload.domain
      ? supabase.from("domains").select("id").ilike("name", payload.domain).limit(1).maybeSingle()
      : Promise.resolve({ data: null as { id?: string } | null, error: null }),
  ]);

  const nameById = new Map<string, string>();
  (pocRowsRes.data ?? []).forEach((r: any) => { if (r?.id && r?.name) nameById.set(r.id, r.name); });

  const resolveName = (p: AssignedPoc | null | undefined): string | null => {
    if (!p) return null;
    if (p.pocId && nameById.has(p.pocId)) return nameById.get(p.pocId)!;
    return p.name;
  };

  const prepName = resolveName(payload.selection.prepPoc) ?? payload.selection.prepPoc.name;
  const supportName = resolveName(payload.selection.supportPoc);
  const outreachName = resolveName(payload.selection.outreachPoc);
  const domainId = (domainRes.data as { id?: string } | null)?.id ?? null;

  const { allocation } = payload.selection;

  // Append a history reason line + capture the tag so it persists on the row
  const histTag = payload.selection.prepPoc.historicalTag ?? null;
  let allocationReason = allocation.allocationReason;
  if (histTag === "Converted Expert") {
    allocationReason += ` 🏆 Converted Expert — ${prepName} previously placed candidates at ${payload.company} for ${payload.role}.`;
  } else if (histTag === "Previously Assigned") {
    allocationReason += ` 📌 Previously Assigned — ${prepName} has handled ${payload.company} / ${payload.role} before.`;
  }

  // 1. Insert into lmp_processes (include JD fields if provided so the
  //    detail page renders the JD immediately without a re-upload).
  const jd = payload.jd;
  const jdInsert = jd
    ? {
        jd_text: jd.text ?? null,
        jd_url: jd.url ?? null,
        jd_label: jd.label ?? jd.fileName ?? null,
        jd_file_name: jd.fileName ?? null,
        jd_skills: jd.skills ?? [],
        jd_seniority: jd.seniority ?? null,
        jd_source: jd.source,
        jd_uploaded_at: new Date().toISOString(),
        jd_uploaded_by: jd.uploadedBy ?? payload.createdBy ?? null,
      }
    : {};

  const { data: lmp, error: lmpError } = await supabase
    .from("lmp_processes")
    .insert({
      company: payload.company,
      role: payload.role,
      domain_raw: payload.domain,
      domain_id: domainId,
      type: payload.type ?? "Full Time",
      status: "not-started",
      date: today,
      prep_poc: prepName,
      support_poc: supportName,
      outreach_poc: outreachName,
      allocator: payload.createdBy ?? null,
      allocation_path: allocation.path,
      allocation_reason: allocationReason,
      match_tag: allocation.tags.join(", "),
      score_breakdown: allocation.prep.scoreBreakdown ?? {},
      historical_tag: histTag,
      sync_source: "system",
      daily_progress: "",
      ...jdInsert,
    })
    .select()
    .single();

  if (lmpError) throw lmpError;

  // Mirror to Google Sheet in the background — the user does NOT wait for
  // Google's API. If it fails, surface a retry toast instead of deleting the row.
  runInBackground(
    () => mirrorCreatedLmpToSheet(lmp as Record<string, unknown>),
    {
      label: "sheet-mirror",
      onError: (err) => {
        const message = err instanceof Error ? err.message : "Unknown sheet sync error";
        toast.error("Sheet sync failed", {
          description: `${message} — the LMP was created but isn't on the sheet yet.`,
        });
      },
    },
  );

  // 2. lmp_poc_links is automatically populated by the trg_lmp_links_after_change
  //    trigger on lmp_processes.

  return lmp;
}
