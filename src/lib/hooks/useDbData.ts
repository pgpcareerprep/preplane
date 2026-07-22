import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { isEligiblePrepPocProfile, isOutreachOnlyPoc } from "@/lib/prepPocEligibility";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { rowToALUMentor, _setAlumniCache, type ALUMentor } from "@/lib/alumniStore";
import { syncLmpCountsToSheet } from "@/lib/sheets/syncLmpCounts";
import { TABS } from "@/lib/sheets/schema";
import { ACTIVE_LMP_STATUSES, normalizeLmpStatus } from "@/lib/config/lmpStatus";

// TanStack Query already dedupes in-flight requests and honors staleTime,
// so callers invalidate via queryClient instead of this cache now.
export function clearCachePrefix(_prefix: string) {}

// ─── Students ───

export function useStudents(filters?: { domain?: string; status?: string; search?: string }) {
  const queryKey = ["db-students", filters] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Bump explicit limit past Supabase's 1000 default so 1k+ students render.
      let q = supabase.from("students").select("*").order("name").limit(5000);
      if (filters?.domain) q = q.eq("primary_domain", filters.domain);
      if (filters?.status) q = q.eq("placement_status", filters.status);
      if (filters?.search) q = q.or(`name.ilike.%${filters.search}%,roll_no.ilike.%${filters.search}%,email.ilike.%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

export function useStudentById(rollNo: string) {
  const queryKey = ["db-student", rollNo] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("roll_no", rollNo)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!rollNo,
  });
}

// ─── LMP Processes ───

/**
 * Explicit list columns for LMP process reads. Avoid `select(*)` — comments,
 * JD blobs, and unused text columns dominate PostgREST egress on list pages.
 * Keep in sync with `dbLmpToRecord` / dashboard KPI field needs.
 */
export const LMP_PROCESS_LIST_SELECT = [
  "id",
  "company",
  "role",
  "status",
  "type",
  "domain_raw",
  "domain_id",
  "prep_poc",
  "support_poc",
  "outreach_poc",
  "prep_poc_id",
  "support_poc_id",
  "outreach_poc_ids",
  "created_at",
  "updated_at",
  "date",
  "closing_date",
  "placement_progress",
  "prep_progress",
  "pool_names",
  "r1_names",
  "r2_names",
  "r3_names",
  "final_converted_numbers",
  "final_converted_names",
  "prep_doc",
  "prep_doc_shared",
  "assignment_review",
  "daily_progress",
  "mentor_aligned",
  "mentor_selected",
  "mentor_rating",
  "one_to_one_mock",
  "next_progress_date",
  "next_progress_type",
  "next_progress_reminder_type",
  "last_progress_updated_at",
  "sheet_row_id",
  "lmp_code",
  "feedback_by_outreach",
  "allocator",
  "admin_owner",
  "behavioral_status",
  "match_tag",
  "allocation_path",
  "jd_url",
  "jd_label",
  "domains(name, slug)",
].join(", ");

export function useLmpProcesses(
  filters?: {
    domain?: string;
    status?: string;
    pocName?: string;
    pocId?: string;
    search?: string;
    includeArchived?: boolean;
  },
  options?: { enabled?: boolean },
) {
  const queryKey = ["db-lmp-processes", filters] as const;
  return useQuery({
    queryKey,
    enabled: options?.enabled ?? true,
    queryFn: async () => {
      // Bump explicit limit past Supabase's 1000 default so all 344+ LMP processes render.
      let q = supabase.from("lmp_processes").select(LMP_PROCESS_LIST_SELECT).order("created_at", { ascending: false }).limit(5000);
      if (filters?.status) {
        q = q.eq("status", filters.status);
      } else if (!filters?.includeArchived) {
        q = q.neq("status", "archived");
      }
      if (filters?.pocName) q = q.or(`prep_poc.eq.${filters.pocName},support_poc.eq.${filters.pocName}`);
      if (filters?.pocId) q = q.or(`prep_poc_id.eq.${filters.pocId},support_poc_id.eq.${filters.pocId}`);
      if (filters?.search) q = q.or(`company.ilike.%${filters.search}%,role.ilike.%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      if (filters?.domain && data) {
        return data.filter((r: any) => r.domains?.slug === filters.domain);
      }
      return data;
    },
    staleTime: 60_000,
  });
}

export function useLmpProcessById(id: string) {
  const queryKey = ["db-lmp-process", id] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_processes")
        .select(LMP_PROCESS_LIST_SELECT)
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });
}

// ─── Domains ───

export function useDomains() {
  const queryKey = ["db-domains"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 120_000,
  });
}

// ─── POC Profiles ───

export function usePocProfiles(filters?: { roleType?: string; domain?: string }) {
  const queryKey = ["db-poc-profiles", filters] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("poc_profiles").select("*").order("name");
      if (filters?.roleType) q = q.eq("role_type", filters.roleType);
      const { data, error } = await q;
      if (error) throw error;
      if (filters?.domain && data) {
        return data.filter((p: any) => p.domain_tags?.includes(filters.domain));
      }
      return data;
    },
    staleTime: 60_000,
  });
}

// ─── POC-LMP Assignments (canonical: lmp_poc_links + poc_profiles) ───

/** Get unique individual POC names with their LMP-link counts (primary=prep, secondary=support, outreach). */
export function usePocSwitcherList() {
  const queryKey = ["db-poc-switcher-list"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Operational roles only — outreach is display metadata, not a switcher POC.
      const { data, error } = await (supabase as any)
        .from("lmp_poc_links")
        .select("lmp_id, role, poc:poc_profiles!inner(id, name)")
        .eq("is_active", true)
        .in("role", ["prep", "support"])
        .limit(10000);
      if (error) throw error;

      // Deduplicate by lmp_id per POC so a person holding both prep and
      // support on the same LMP counts as one LMP in total.
      type PocEntry = { primary: number; secondary: number; outreach: number; lmpIds: Set<string> };
      const map = new Map<string, PocEntry>();
      for (const row of (data as any[]) || []) {
        const name: string | undefined = row.poc?.name;
        const lmpId: string | undefined = row.lmp_id;
        if (!name || !lmpId) continue;
        if (!map.has(name)) map.set(name, { primary: 0, secondary: 0, outreach: 0, lmpIds: new Set() });
        const entry = map.get(name)!;
        entry.lmpIds.add(lmpId);
        if (row.role === "prep") entry.primary++;
        else if (row.role === "support") entry.secondary++;
        else if (row.role === "outreach") entry.outreach++;
      }

      return [...map.entries()].map(([name, counts]) => ({
        name,
        initials: name.split(/\s+/).map(w => w[0]).join("").toUpperCase().slice(0, 2),
        primary: counts.primary,
        secondary: counts.secondary,
        outreach: counts.outreach,
        total: counts.lmpIds.size,  // distinct LMP count, not row count
      })).sort((a, b) => a.name.localeCompare(b.name));
    },
    staleTime: 60_000,
  });
}

// ─── LMP Candidates (student-LMP links) ───

export function useLmpCandidates(lmpId?: string) {
  const queryKey = ["db-lmp-candidates", lmpId] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("lmp_candidates").select("*").order("created_at", { ascending: false });
      if (lmpId) q = q.eq("lmp_id", lmpId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!lmpId,
    staleTime: 0,
  });
}

/** Fetch candidate counts grouped by lmp_id (single query, no N+1). */
export function useLmpCandidateCounts() {
  const queryKey = ["db-lmp-candidate-counts"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_candidates")
        .select("lmp_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.lmp_id] = (counts[row.lmp_id] || 0) + 1;
      }
      return counts;
    },
    staleTime: 0,
  });
}

/**
 * Recompute the LMP-level pipeline fields that mirror to the sheet columns:
 * Pool N/O, R1 P/Q, R2 R/S, R3 T/U, Converted V/W.
 */
async function recomputePipelineStageFields(lmpId: string) {
  if (!lmpId) return;
  try {
    const { data, error } = await supabase
      .from("lmp_candidates")
      .select("student_name, pipeline_stage, offer_status")
      .eq("lmp_id", lmpId);
    if (error) throw error;

    const buckets: Record<"pool" | "r1" | "r2" | "r3" | "converted", string[]> = {
      pool: [],
      r1: [],
      r2: [],
      r3: [],
      converted: [],
    };

    for (const row of data ?? []) {
      const name = String((row as any).student_name || "").trim();
      if (!name) continue;
      const stage = String((row as any).pipeline_stage ?? "").trim().toLowerCase();
      const hasOffer = String((row as any).offer_status ?? "").trim() !== "";
      const target =
        hasOffer || ["converted", "offer", "final", "accepted"].includes(stage) ? "converted" :
        ["r3", "r3_shortlisted", "round_3", "round3"].includes(stage) ? "r3" :
        ["r2", "r2_shortlisted", "round_2", "round2"].includes(stage) ? "r2" :
        ["r1", "r1_shortlisted", "round_1", "round1"].includes(stage) ? "r1" :
        "pool";
      buckets[target].push(name);
    }

    for (const names of Object.values(buckets)) {
      names.sort((a, b) => a.localeCompare(b));
    }

    const { data: updated, error: updateError } = await supabase
      .from("lmp_processes")
      .update({
        pool_names: buckets.pool.join(", ") || null,
        r1_names: buckets.r1.join(", ") || null,
        r2_names: buckets.r2.join(", ") || null,
        r3_names: buckets.r3.join(", ") || null,
        final_converted_names: buckets.converted.join(", ") || null,
        final_converted_numbers: buckets.converted.length > 0 ? String(buckets.converted.length) : null,
      })
      .eq("id", lmpId)
      .select("id");
    if (updateError) throw updateError;
    if (!updated || updated.length === 0) {
      throw new Error(
        "PERMISSION_DENIED_OR_ROW_MISSING: You are not linked as an " +
        "operational POC for this LMP. Ask an admin to verify your POC " +
        "mapping and LMP assignment."
      );
    }
  } catch (e) {
    console.warn("[recomputePipelineStageFields] failed", e);
  }
}


/** User-facing message when candidate insert/update is blocked by RLS. */
export function formatCandidateAddError(err: unknown): string {
  const msg = String((err as { message?: string })?.message ?? err ?? "");
  if (/row-level security|row level security|violates.*policy|\brls\b|42501/i.test(msg)) {
    return "You are not linked as an operational POC for this LMP. Please ask an admin to verify your POC profile mapping and LMP assignment.";
  }
  return msg || "Unknown error";
}

export function useAddLmpCandidates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (candidates: {
      lmp_id: string;
      student_name: string;
      student_id?: string;
      roll_no?: string;
      pipeline_stage?: string;
      metadata?: Record<string, unknown>;
    }[]) => {
      if (!candidates.length) return { inserted: [], skipped: 0 };
      // Use merge upsert (no ignoreDuplicates) so the DB returns rows and we
      // can detect silent drops. Unique constraint (lmp_id, student_name)
      // ensures re-adds update instead of failing.
      const { data, error } = await supabase
        .from("lmp_candidates")
        .upsert(candidates, { onConflict: "lmp_id,student_name" })
        .select();
      if (error) throw error;
      const inserted = data ?? [];
      const skipped = candidates.length - inserted.length;
      // Cross-check by reading back what's now on the LMP, so the user sees
      // an accurate count even when upsert reports partial results.
      const lmpId = candidates[0]?.lmp_id;
      if (lmpId) {
        const { data: present } = await supabase
          .from("lmp_candidates")
          .select("student_name")
          .eq("lmp_id", lmpId)
          .in("student_name", candidates.map((c) => c.student_name));
        const presentSet = new Set((present ?? []).map((r: any) => r.student_name));
        const missing = candidates.filter((c) => !presentSet.has(c.student_name));
        if (missing.length) {
          console.warn("[useAddLmpCandidates] not persisted:", missing.map((m) => m.student_name));
        }
      }
      return { inserted, skipped };
    },
    onSuccess: async (result, variables) => {
      const lmpId = variables[0]?.lmp_id;
      clearCachePrefix('["db-lmp-candidates');
      clearCachePrefix('["db-lmp-candidate-counts');
      clearCachePrefix('["db-lmp-processes');
      clearCachePrefix('["db-students');
      if (lmpId) {
        qc.invalidateQueries({ queryKey: ["db-lmp-candidates", lmpId] });
        await qc.refetchQueries({ queryKey: ["db-lmp-candidates", lmpId] });
      }
      qc.invalidateQueries({ queryKey: ["db-lmp-candidates"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-candidate-counts"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-students-with-load"] });
      qc.invalidateQueries({ queryKey: ["db-students"] });
      qc.invalidateQueries({ queryKey: ["lmp_candidates_live"] });
      qc.invalidateQueries({ queryKey: ["lmp-cohort-program-summaries"] });
      if (lmpId) qc.invalidateQueries({ queryKey: ["lmp_candidates_live", lmpId] });
      qc.refetchQueries({ queryKey: ["db-lmp-candidate-counts"] });
      if (lmpId) {
        await recomputePipelineStageFields(lmpId);
        void syncLmpCountsToSheet(lmpId);
      }
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["poc-directory"] });
      qc.invalidateQueries({ queryKey: ["db-all-poc-profiles"] });
      clearCachePrefix('["poc-directory');
      clearCachePrefix('["db-all-poc-profiles');
      const total = variables.length;
      const added = result.inserted.length;
      if (added === total) {
        toast({ title: "Candidates added", description: `${added} candidate${added === 1 ? "" : "s"} linked to LMP process` });
      } else {
        toast({
          title: `${added}/${total} candidates added`,
          description: added === 0
            ? formatCandidateAddError(new Error("blocked by access rules"))
            : `${total - added} were already linked or blocked.`,
        });
      }
    },
    onError: (e: Error) => {
      toast({
        title: "Failed to add candidates",
        description: formatCandidateAddError(e),
        variant: "destructive",
      });
    },
  });
}

export function useDeleteLmpCandidate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; lmp_id?: string }) => {
      const { error } = await supabase.from("lmp_candidates").delete().eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: async (_id, variables) => {
      clearCachePrefix('["db-lmp-candidates');
      clearCachePrefix('["db-lmp-candidate-counts');
      if (variables.lmp_id) {
        qc.invalidateQueries({ queryKey: ["db-lmp-candidates", variables.lmp_id] });
        await qc.refetchQueries({ queryKey: ["db-lmp-candidates", variables.lmp_id] });
      }
      qc.invalidateQueries({ queryKey: ["db-lmp-candidates"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-candidate-counts"] });
      qc.invalidateQueries({ queryKey: ["lmp_candidates_live"] });
      if (variables.lmp_id) qc.invalidateQueries({ queryKey: ["lmp_candidates_live", variables.lmp_id] });
      qc.refetchQueries({ queryKey: ["db-lmp-candidate-counts"] });
      if (variables.lmp_id) {
        await recomputePipelineStageFields(variables.lmp_id);
        void syncLmpCountsToSheet(variables.lmp_id);
      }
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["poc-directory"] });
      qc.invalidateQueries({ queryKey: ["db-all-poc-profiles"] });
      clearCachePrefix('["poc-directory');
      clearCachePrefix('["db-all-poc-profiles');
      toast({ title: "Candidate removed", description: "Unlinked from this LMP process." });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to remove candidate", description: e.message, variant: "destructive" });
    },
  });
}

export function useUpdateLmpCandidateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pipeline_stage }: { id: string; pipeline_stage: string; lmp_id?: string }) => {
      const { error } = await supabase
        .from("lmp_candidates")
        .update({ pipeline_stage })
        .eq("id", id);
      if (error) throw error;
      return id;
    },
    onSuccess: async (_id, variables) => {
      clearCachePrefix('["db-lmp-candidates');
      if (variables.lmp_id) {
        qc.invalidateQueries({ queryKey: ["db-lmp-candidates", variables.lmp_id] });
        await qc.refetchQueries({ queryKey: ["db-lmp-candidates", variables.lmp_id] });
      }
      qc.invalidateQueries({ queryKey: ["db-lmp-candidates"] });
      qc.invalidateQueries({ queryKey: ["lmp_candidates_live"] });
      if (variables.lmp_id) qc.invalidateQueries({ queryKey: ["lmp_candidates_live", variables.lmp_id] });
      if (variables.lmp_id) {
        await recomputePipelineStageFields(variables.lmp_id);
        void syncLmpCountsToSheet(variables.lmp_id);
      }
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["poc-directory"] });
      qc.invalidateQueries({ queryKey: ["db-all-poc-profiles"] });
      clearCachePrefix('["db-lmp-processes');
      clearCachePrefix('["poc-directory');
      clearCachePrefix('["db-all-poc-profiles');
    },
    onError: (e: Error) => {
      toast({ title: "Failed to move candidate", description: e.message, variant: "destructive" });
    },
  });
}

export function useDeleteLmpProcess() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: async (lmpId: string) => {
      // DB-only delete. The AFTER DELETE trigger
      // (`tg_lmp_process_delete_sheet_sync`) enqueues a `sheet_write_queue`
      // row that the `sheets-retry-sweeper` cron drains.
      const sheetStatus: "deleted" | "queued" | "not_found" | "error" = "queued";
      const sheetError: string | undefined = undefined;
      const { error } = await supabase.from("lmp_processes").delete().eq("id", lmpId);
      if (error) throw error;
      return { lmpId, sheetStatus, sheetError };
    },
    onSuccess: ({ lmpId, sheetStatus, sheetError }) => {
      // 1. Redirect away from the deleted detail route BEFORE we wipe its cache
      //    so the LMP detail page never tries to render against an empty row.
      if (typeof window !== "undefined") {
        const path = window.location.pathname;
        const onDeletedDetail =
          path === `/lmp/${lmpId}` ||
          path.startsWith(`/lmp/${lmpId}/`) ||
          path === `/processes/${lmpId}` ||
          path.startsWith(`/processes/${lmpId}/`) ||
          path.includes(encodeURIComponent(lmpId));
        if (onDeletedDetail) {
          if (navigate) navigate("/lmp?view=cards", { replace: true });
          else window.location.replace("/lmp?view=cards");
        }
      }

      // 2. Drop the specific deleted row from every cache layer.
      qc.removeQueries({ queryKey: ["db-lmp-process", lmpId] });
      clearCachePrefix(`["db-lmp-process",${JSON.stringify(lmpId)}`);
      clearCachePrefix('["db-lmp-process"');

      // 3. Invalidate lists / counts so the board updates instantly.
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-candidates"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-candidate-counts"] });
      qc.invalidateQueries({ queryKey: ["db-poc-switcher-list"] });
      qc.invalidateQueries({ queryKey: ["sheets", TABS.LMP_TRACKER] });
      qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
      clearCachePrefix('["db-lmp-processes');
      clearCachePrefix('["db-lmp-candidates');
      clearCachePrefix('["db-poc-switcher-list');

      const short = lmpId.slice(0, 8);
      void sheetStatus;
      void sheetError;
      toast({
        title: "LMP process deleted",
        description: `Removed ${short}… from the database. Sheet will update within ~2 min.`,
      });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to delete LMP process", description: e.message, variant: "destructive" });
    },
  });
}

// ─── Student LMP Connections ───

export function useStudentLmpLinks(studentName?: string) {
  const queryKey = ["db-student-lmp-links", studentName] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("lmp_candidates").select("*").order("created_at", { ascending: false });
      if (studentName) q = q.ilike("student_name", `%${studentName}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!studentName,
    staleTime: 60_000,
  });
}

export function useLmpProcessesByIds(ids: string[]) {
  const queryKey = ["db-lmp-processes-by-ids", ids] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from("lmp_processes")
        .select("id, company, role, status, domain_raw, prep_poc, support_poc, outreach_poc")
        .in("id", ids);
      if (error) throw error;
      return data;
    },
    enabled: ids.length > 0,
    staleTime: 60_000,
  });
}

// ─── Unmapped Items ───

export function useUnmappedItems() {
  const queryKey = ["db-unmapped-items"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("unmapped_items")
        .select("*")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

// ─── Sync stubs (DB is now the source of truth) ───
//
// Sheets → DB ingest and Smart Sync are retired. DB changes are mirrored by
// the authoritative sheet_write_queue worker.

export function useSyncIngest() {
  return useMutation({
    mutationFn: async (_scope: "full" | "lmp" | "students" | "poc" = "full") => {
      return { skipped: true, message: "Sync disabled — database is the source of truth." };
    },
    onSuccess: () => {
      toast({
        title: "Sync not needed",
        description: "The database is the source of truth. Sheet updates flow from DB automatically.",
      });
    },
  });
}

export function useSmartLmpSync() {
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase as any).rpc("enqueue_all_lmp_sheet_mirrors");
      if (error) throw error;
      return { queued: Number(data ?? 0) };
    },
    onSuccess: ({ queued }) => {
      toast({
        title: "Sheet mirror queued",
        description: `${queued} LMP records queued for the authenticated Sheet worker.`,
      });
    },
  });
}


// ─── Mentors ───

export function useMentorStats(source?: string) {
  const queryKey = ["db-mentor-stats", source] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("mentors").select("id", { count: "exact", head: true });
      if (source) q = q.eq("source", source);
      const { count, error } = await q;
      if (error) throw error;

      const { data: logData } = await supabase
        .from("activity_log")
        .select("created_at, metadata")
        .eq("entity_type", "mentor_upload")
        .order("created_at", { ascending: false })
        .limit(1);

      const lastSync = logData?.[0]?.created_at ?? null;

      return { count: count ?? 0, lastSync };
    },
    staleTime: 30_000,
  });
}

export function useMentorPreview(source?: string, limit = 3) {
  const queryKey = ["db-mentor-preview", source, limit] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase.from("mentors").select("name, designation, company, rating, skill_tags").order("rating", { ascending: false }).limit(limit);
      if (source) q = q.eq("source", source);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((m) => ({
        name: m.name,
        role: m.designation || "—",
        company: m.company || "—",
        rating: Number(m.rating) || 0,
        skills: (m.skill_tags || []).slice(0, 2),
      }));
    },
    staleTime: 30_000,
  });
}

// ─── Data Source Status / History (centralized DB hub) ───

export type DataSourceType = "mentor_union" | "alumni_db" | "student_db" | "poc_db";

export function useDataSourceStatus(source: DataSourceType) {
  const queryKey = ["db-data-source-status", source] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_source_status")
        .select("*")
        .eq("source_type", source)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useUploadHistory(source: "all" | DataSourceType) {
  const queryKey = ["db-upload-history", source] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("data_source_sync_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (source !== "all") q = q.eq("source_type", source);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    staleTime: 15_000,
  });
}

/**
 * Returns the most recent failure reason (validation_summary.errors[0]) for a
 * data source, or null if the latest sync succeeded / source is clean.
 */
export function useLastSyncFailure(source: DataSourceType) {
  return useQuery({
    queryKey: ["db-last-failure", source] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_source_sync_history")
        .select("status,validation_summary,created_at,file_name")
        .eq("source_type", source)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data || data.status !== "failed") return null;
      const errs = ((data.validation_summary as any)?.errors as string[] | undefined) ?? [];
      return {
        message: errs[0] ?? "Sync failed for an unknown reason.",
        all: errs,
        when: data.created_at as string,
        file: (data.file_name as string | null) ?? null,
      };
    },
    staleTime: 30_000,
  });
}

export function useAllAlumni() {
  const queryKey = ["db-all-alumni"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alumni_records")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

/**
 * React hook: loads alumni from Supabase, mirrors them into the in-memory
 * ALU cache (so synchronous consumers like the matcher keep working), and
 * returns the typed ALUMentor list for UI use.
 */
export function useAlumniMentors(): { mentors: ALUMentor[]; loading: boolean } {
  const { data, isLoading } = useAllAlumni();
  const mentors = useMemo(() => (data || []).map(rowToALUMentor), [data]);
  useEffect(() => {
    _setAlumniCache(mentors);
  }, [mentors]);
  return { mentors, loading: isLoading };
}

export function invalidateDataSourceCaches(qc: ReturnType<typeof useQueryClient>, source: DataSourceType) {
  qc.invalidateQueries({ queryKey: ["db-data-source-status", source] });
  qc.invalidateQueries({ queryKey: ["db-data-source-status"] });
  qc.invalidateQueries({ queryKey: ["db-upload-history", source] });
  qc.invalidateQueries({ queryKey: ["db-upload-history"] });
  if (source === "mentor_union") {
    qc.invalidateQueries({ queryKey: ["db-mentor-stats"] });
    qc.invalidateQueries({ queryKey: ["db-mentor-preview"] });
    qc.invalidateQueries({ queryKey: ["db-all-mentors"] });
  } else if (source === "alumni_db") {
    qc.invalidateQueries({ queryKey: ["db-all-alumni"] });
    // Alumni rows mirror into mentors via DB trigger (source='ALU'),
    // so any alumni write should also invalidate mentor caches.
    qc.invalidateQueries({ queryKey: ["db-mentor-stats"] });
    qc.invalidateQueries({ queryKey: ["db-all-mentors"] });
  } else if (source === "student_db") {
    qc.invalidateQueries({ queryKey: ["db-students"] });
    qc.invalidateQueries({ queryKey: ["db-student"] });
    qc.invalidateQueries({ queryKey: ["db-students-with-load"] });
    qc.invalidateQueries({ queryKey: ["students-dataset"] });
    qc.invalidateQueries({ queryKey: ["cohorts"] });
    qc.invalidateQueries({ queryKey: ["programs"] });
    qc.invalidateQueries({ queryKey: ["students_total_count"] });
    qc.invalidateQueries({ queryKey: ["students_roster_full"] });
      qc.invalidateQueries({ queryKey: ["lmp_candidates_all"] });
      qc.invalidateQueries({ queryKey: ["lmp_candidates_scoped"] });
      qc.invalidateQueries({ queryKey: ["admin_dashboard_snapshot"] });
      qc.invalidateQueries({ queryKey: ["lmp-cohort-program-summaries"] });
    qc.invalidateQueries({ queryKey: ["prep_poc_heatmap_v3"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
    qc.invalidateQueries({ queryKey: ["dashboard-kpis"] });
    qc.invalidateQueries({ queryKey: ["lmp_candidates_live"] });
    clearCachePrefix('["db-students');
    clearCachePrefix('["db-student"');
  }
  // Cross-cutting: dashboard KPIs, analytics rollups, and LMP-derived views all
  // depend on these source counts, so refetch them after every upload/mutation.
  qc.invalidateQueries({ queryKey: ["analytics"] });
  qc.invalidateQueries({ queryKey: ["db-lmp"] });
  qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
  qc.invalidateQueries({ queryKey: ["db-mentors"] });
  clearCachePrefix('["db-mentor-');
  clearCachePrefix('["db-all-');
  clearCachePrefix('["db-data-source-');
  clearCachePrefix('["db-upload-history');
  clearCachePrefix('["db-lmp');
}

// ─── All Mentors (for Mentors page) ───

export type DbMentorRow = {
  id: string;
  name: string;
  designation: string | null;
  company: string | null;
  source: string;
  rating: number;
  reviews: number;
  skill_tags: string[];
  seniority: string | null;
  functional_domain: string | null;
  industry: string | null;
  rate: number;
  linkedin: string | null;
  availability: string;
  email: string | null;
  phone: string | null;
  updated_at: string;
};

/**
 * Fetch mentors. Pass `mentorUnionOnly: true` to scope to Mentor Union members,
 * which applies the score-ranked top-200 cap (OPTIMISED rule #2).
 */
export function useAllMentors(opts?: { mentorUnionOnly?: boolean }) {
  const mentorUnionOnly = !!opts?.mentorUnionOnly;
  const queryKey = ["db-all-mentors", { mentorUnionOnly }] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      // Phase 3: read from mentors_union_view so consumers get is_alumni_mirror + source_label.
      let q = (supabase as any)
        .from("mentors_union_view")
        .select("id, name, designation, company, source, rating, reviews, skill_tags, seniority, functional_domain, industry, rate, currency, years_of_experience, linkedin, availability, email, phone, updated_at, sync_source, is_alumni_mirror, source_label, mentor_code");
      if (mentorUnionOnly) {
        q = q.eq("mentor_union", true).order("overall_score", { ascending: false }).limit(200);
      } else {
        q = q.order("name", { ascending: true });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as DbMentorRow[];
    },
    staleTime: 30_000,
  });
}

// ─── Phase 3: View-backed previews (read-only, includes derived counts) ───

export function useStudentsWithLoad(limit = 200) {
  const queryKey = ["db-students-with-load", limit] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("students_with_load")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function usePocProfilesWithLoad() {
  const queryKey = ["db-poc-profiles-with-load"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("poc_profiles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

export function useLmpProcessesOverview(limit = 200) {
  const queryKey = ["db-lmp-processes-overview", limit] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("lmp_processes_overview")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
}

/** Fetch a single mentor by id from the live `mentors` table. */
export function useMentorById(id: string | undefined) {
  const queryKey = ["db-mentor-by-id", id] as const;
  return useQuery({
    queryKey,
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select("*")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

// ─── Domain DB / POC DB (Data Sources hub) ───

export function useAllDomains() {
  const queryKey = ["db-all-domains"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("domains").select("*").order("name");
      if (error) throw error;
      return (data ?? []).filter((d: any) => d.slug !== "general-management");
    },
    staleTime: 30_000,
  });
}

export function useAllPocProfiles() {
  const queryKey = ["db-all-poc-profiles"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.from("poc_profiles").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });
}


/** Strip honorifics (Dr., Mr., Ms.) and extract the lowercased first token of a name. */
function firstToken(raw: string): string {
  const cleaned = raw.trim().replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "");
  return (cleaned.split(/\s+/)[0] || "").toLowerCase();
}

/**
 * Build a resolver that maps any sheet POC name (e.g. "Vidit", "Dr. Gopika")
 * to the canonical POC name ("Vidit Sinha", "Gopika Kumar").
 *
 * Resolution order:
 *  1. Exact case-insensitive full-name match.
 *  2. First-name match — only if exactly one canonical POC shares that first token.
 *  3. Otherwise unresolved (returns null) and is logged once for visibility.
 */
function buildPocNameResolver(
  pocs: Array<{ name: string; aliases?: string[] | null }>,
) {
  const exact = new Map<string, string>();
  const byFirst = new Map<string, string[]>();
  for (const p of pocs) {
    const n = p.name;
    if (!n) continue;
    exact.set(n.toLowerCase().trim(), n);
    for (const a of p.aliases ?? []) {
      const k = (a || "").toLowerCase().trim();
      if (k && !exact.has(k)) exact.set(k, n);
    }
    const f = firstToken(n);
    if (!f) continue;
    const list = byFirst.get(f) ?? [];
    if (!list.includes(n)) list.push(n);
    byFirst.set(f, list);
  }
  const warned = new Set<string>();
  return (raw?: string | null): string | null => {
    if (!raw) return null;
    const key = raw.trim().toLowerCase();
    if (!key) return null;
    if (exact.has(key)) return exact.get(key)!;
    const stripped = key.replace(/^(dr\.?|mr\.?|ms\.?|mrs\.?)\s+/i, "").trim();
    if (stripped !== key && exact.has(stripped)) return exact.get(stripped)!;
    const f = firstToken(raw);
    const candidates = byFirst.get(f);
    if (candidates && candidates.length === 1) return candidates[0];
    if (candidates && candidates.length > 1 && !warned.has(key)) {
      warned.add(key);
       
      console.warn(`[POC load] "${raw}" is ambiguous — matches: ${candidates.join(", ")}`);
    } else if (!candidates && !warned.has(key)) {
      warned.add(key);
       
      console.warn(`[POC load] "${raw}" did not match any canonical POC`);
    }
    return null;
  };
}

export type PocLoadBreakdown = {
  prep: number;
  support: number;
  outreach: number;
  total: number;
  /** All-time count of LMPs this POC has been associated with, in any status. */
  historicalTotal: number;
  /** Count of LMPs in a "converted" status this POC was associated with. */
  converted: number;
};

export function usePocLiveLoads() {
  return useQuery({
    queryKey: ["db-poc-live-loads"] as const,
    queryFn: async () => {
      const [{ data: lmps, error: lmpErr }, { data: pocs, error: pocErr }] = await Promise.all([
        supabase
          .from("lmp_processes")
          .select("status,prep_poc,support_poc,outreach_poc"),
        supabase.from("poc_profiles").select("name,aliases").not("email", "is", null).neq("email", ""),
      ]);
      if (lmpErr) throw lmpErr;
      if (pocErr) throw pocErr;

      const pocList = (pocs ?? []).filter((p: any) => p.name) as Array<{ name: string; aliases?: string[] | null }>;
      const resolve = buildPocNameResolver(pocList);

      const byPoc: Record<string, PocLoadBreakdown> = {};
      const ensure = (name: string) =>
        (byPoc[name] ??= { prep: 0, support: 0, outreach: 0, total: 0, historicalTotal: 0, converted: 0 });

      const bumpActive = (raw: string | null | undefined, field: "prep" | "support" | "outreach") => {
        const canonical = resolve(raw);
        if (!canonical) return;
        const slot = ensure(canonical);
        slot[field] += 1;
        slot.total += 1;
      };
      const bumpOnce = (raw: string | null | undefined, seen: Set<string>, field: "historicalTotal" | "converted") => {
        const canonical = resolve(raw);
        if (!canonical || seen.has(canonical)) return;
        seen.add(canonical);
        ensure(canonical)[field] += 1;
      };

      for (const r of (lmps ?? []) as any[]) {
        const prep = r.prep_poc?.trim() || null;
        const sup = r.support_poc?.trim() || null;
        const out = r.outreach_poc?.trim() || null;
        const status = (r.status ?? "") as string;
        const isActive = ACTIVE_LMP_STATUSES.includes(status);
        const isConverted = normalizeLmpStatus(status) === "converted";

        if (isActive) {
          bumpActive(prep, "prep");
          if (sup && sup.toLowerCase() !== (prep ?? "").toLowerCase()) bumpActive(sup, "support");
          bumpActive(out, "outreach");
        }

        // Historical: count each distinct POC at most once per LMP row.
        const histSeen = new Set<string>();
        bumpOnce(prep, histSeen, "historicalTotal");
        bumpOnce(sup, histSeen, "historicalTotal");
        bumpOnce(out, histSeen, "historicalTotal");

        if (isConverted) {
          const convSeen = new Set<string>();
          bumpOnce(prep, convSeen, "converted");
          bumpOnce(sup, convSeen, "converted");
          bumpOnce(out, convSeen, "converted");
        }
      }

      // Convenience flat maps (kept for backwards-compat callers).
      const prepLoad: Record<string, number> = {};
      const outreachLoad: Record<string, number> = {};
      const totalLoad: Record<string, number> = {};
      const historicalLoad: Record<string, number> = {};
      const convertedLoad: Record<string, number> = {};
      for (const [name, b] of Object.entries(byPoc)) {
        prepLoad[name] = b.prep + b.support;
        outreachLoad[name] = b.outreach;
        totalLoad[name] = b.total;
        historicalLoad[name] = b.historicalTotal;
        convertedLoad[name] = b.converted;
      }

      return { byPoc, prepLoad, outreachLoad, totalLoad, historicalLoad, convertedLoad };
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain → POC mappings (DERIVED LIVE from poc_profiles)
// ─────────────────────────────────────────────────────────────────────────────
// The legacy `poc_allocation_mappings` lookup table was dropped in Phase 5.
// Mappings are now derived live from `poc_profiles.primary_domain` and
// `poc_profiles.domain_tags`, ordered by current active_load (least loaded
// first). The shape returned matches the old table so existing callers keep
// working without code changes.

export type DerivedAllocationMapping = {
  id: string;
  domain_slug: string;
  poc_id: string;
  poc_name: string;
  priority: number;
  is_active: boolean;
};

async function fetchAllPocsForMapping() {
  const { data, error } = await supabase
    .from("poc_profiles")
    .select("id,name,primary_domain,domain_tags,active_load,status,role_type")
    .order("active_load", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    name: string;
    primary_domain: string | null;
    domain_tags: string[] | null;
    active_load: number | null;
    status: string | null;
    role_type: string | null;
  }>;
}

/**
 * Build a name/alias → canonical slug map from the live `domains` table.
 * POC profiles store domain values as display names ("FO/COS", "Marketing")
 * while the domains table is keyed by slug ("fo-cos", "marketing"). This
 * resolver bridges both, plus any configured aliases.
 */
async function fetchDomainSlugResolver(): Promise<(raw: string) => string | null> {
  const { data, error } = await supabase
    .from("domains")
    .select("slug,name,aliases");
  if (error) throw new Error(error.message);
  const map = new Map<string, string>();
  for (const d of (data ?? []) as Array<{ slug: string; name: string; aliases: string[] | null }>) {
    const slug = String(d.slug).toLowerCase();
    map.set(slug, slug);
    if (d.name) map.set(d.name.toLowerCase().trim(), slug);
    for (const a of d.aliases ?? []) {
      const k = String(a).toLowerCase().trim();
      if (k) map.set(k, slug);
    }
  }
  return (raw: string) => map.get((raw || "").toLowerCase().trim()) ?? null;
}

async function fetchPrepSupportLinkPocIds(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("lmp_poc_links")
    .select("poc_id")
    .in("role", ["prep", "support"]);
  if (error) throw new Error(error.message);
  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row.poc_id) ids.add(row.poc_id as string);
  }
  return ids;
}

function deriveMappingsForSlug(
  pocs: Awaited<ReturnType<typeof fetchAllPocsForMapping>>,
  slug: string,
  prepSupportLinkIds: ReadonlySet<string>,
  resolve?: (raw: string) => string | null,
): DerivedAllocationMapping[] {
  const target = slug.toLowerCase();
  const resolveSlug = resolve ?? ((s: string) => (s || "").toLowerCase().trim() || null);
  const primary: typeof pocs = [];
  const secondary: typeof pocs = [];
  for (const p of pocs) {
    if (p.status && p.status !== "active") continue;
    if (isOutreachOnlyPoc(p.role_type)) continue;
    if (!isEligiblePrepPocProfile(
      {
        id: p.id,
        status: p.status,
        role_type: p.role_type,
        primary_domain: p.primary_domain,
        domain_tags: p.domain_tags,
      },
      prepSupportLinkIds,
    )) continue;
    const primarySlug = p.primary_domain ? resolveSlug(p.primary_domain) : null;
    const tagSlugs = (p.domain_tags ?? [])
      .map((t) => resolveSlug(String(t)))
      .filter(Boolean) as string[];
    const isPrimary = primarySlug === target;
    const isSecondary = !isPrimary && tagSlugs.includes(target);
    if (isPrimary) primary.push(p);
    else if (isSecondary) secondary.push(p);
  }
  const sortByLoad = (a: typeof pocs[number], b: typeof pocs[number]) =>
    (a.active_load ?? 0) - (b.active_load ?? 0);
  primary.sort(sortByLoad);
  secondary.sort(sortByLoad);
  const ordered = [...primary, ...secondary];
  return ordered.map((p, i) => ({
    id: `derived:${slug}:${p.id}`,
    domain_slug: slug,
    poc_id: p.id,
    poc_name: p.name,
    priority: i + 1,
    is_active: true,
  }));
}

export function useMappedPocCountsByDomain() {
  const queryKey = ["db-mapped-poc-counts"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const [pocs, resolve, prepSupportLinkIds] = await Promise.all([
        fetchAllPocsForMapping(),
        fetchDomainSlugResolver(),
        fetchPrepSupportLinkPocIds(),
      ]);
      const counts: Record<string, number> = {};
      for (const p of pocs) {
        if (p.status && p.status !== "active") continue;
        if (!isEligiblePrepPocProfile(
          {
            id: p.id,
            status: p.status,
            role_type: p.role_type,
            primary_domain: p.primary_domain,
            domain_tags: p.domain_tags,
          },
          prepSupportLinkIds,
        )) continue;
        const seen = new Set<string>();
        if (p.primary_domain) {
          const s = resolve(p.primary_domain);
          if (s) seen.add(s);
        }
        for (const t of p.domain_tags ?? []) {
          const s = resolve(String(t));
          if (s) seen.add(s);
        }
        for (const slug of seen) counts[slug] = (counts[slug] || 0) + 1;
      }
      return counts;
    },
    staleTime: 60_000,
  });
}

/**
 * Resolve a domain identifier (slug OR display name) to its canonical
 * slug and return the derived POC mappings for it (priority-ordered:
 * primary_domain matches first by load, then domain_tags matches by load).
 */
export function usePocDomainMappings(domainKey?: string) {
  return useQuery({
    queryKey: ["poc_domain_mappings", "by-key", domainKey?.toLowerCase()],
    queryFn: async (): Promise<DerivedAllocationMapping[]> => {
      if (!domainKey) return [];
      const raw = domainKey.trim();
      const lower = raw.toLowerCase();

      // Resolve to canonical slug.
      let slug = lower;
      const { data: bySlug } = await supabase
        .from("domains").select("slug").eq("slug", lower).maybeSingle();
      if (bySlug?.slug) {
        slug = bySlug.slug;
      } else {
        const { data: byName } = await supabase
          .from("domains").select("slug").ilike("name", raw).maybeSingle();
        if (byName?.slug) slug = byName.slug;
      }

      const [pocs, prepSupportLinkIds] = await Promise.all([
        fetchAllPocsForMapping(),
        fetchPrepSupportLinkPocIds(),
      ]);
      return deriveMappingsForSlug(pocs, slug, prepSupportLinkIds);
    },
    enabled: !!domainKey,
    staleTime: 60_000,
  });
}

export function useAllPocDomainMappings() {
  return useQuery({
    queryKey: ["poc_domain_mappings", "all"],
    queryFn: async (): Promise<DerivedAllocationMapping[]> => {
      const [pocs, domainsRes, prepSupportLinkIds] = await Promise.all([
        fetchAllPocsForMapping(),
        supabase.from("domains").select("slug"),
        fetchPrepSupportLinkPocIds(),
      ]);
      if (domainsRes.error) throw new Error(domainsRes.error.message);
      const slugs = (domainsRes.data ?? []).map((d: any) => String(d.slug).toLowerCase());
      const out: DerivedAllocationMapping[] = [];
      for (const slug of slugs) out.push(...deriveMappingsForSlug(pocs, slug, prepSupportLinkIds));
      return out;
    },
    staleTime: 30_000,
  });
}

export function useLmpTrackerSyncHistory() {
  const queryKey = ["db-lmp-tracker-sync-history"] as const;
  return useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sheet_sync_events")
        .select("*")
        .eq("tab_name", "sync-ingest")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}

// ─── LMP Full View (joined view for tracker table) ───

export function useLmpFullView() {
  return useQuery({
    queryKey: ["db-lmp-full-view"] as const,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_full_view" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
    staleTime: 30_000,
  });
}

export function useLmpCandidatesByProcess(lmpId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["db-lmp-candidates-by-process", lmpId] as const,
    enabled: Boolean(lmpId) && enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_candidates")
        .select("id, student_name, roll_no, r1_status, r2_status, r3_status, offer_status, pipeline_stage")
        .eq("lmp_id", lmpId!);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 15_000,
  });
}
