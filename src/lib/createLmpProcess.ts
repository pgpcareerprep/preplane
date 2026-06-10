import { supabase } from "@/integrations/supabase/client";
import type { AssignedPoc, AllocationResult } from "@/lib/pocAllocation";

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
  createdById?: string;
  createdByName?: string;
  selection: ConfirmedPocSelection;
  jd?: CreateLmpJdPayload;
};

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
        jd_uploaded_by: jd.uploadedBy ?? payload.createdByName ?? null,
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
      allocator: payload.createdByName ?? null,
      created_by: payload.createdById ?? null,
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

  // The DB trigger enqueues the authoritative Sheet mirror job.
  // lmp_poc_links is automatically populated by trg_lmp_links_after_change.
  //    trigger on lmp_processes.

  return lmp;
}
