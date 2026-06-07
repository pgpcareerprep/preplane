import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

// DB → Sheet mirror is server-side. "Keep system" resolutions enqueue a
// `sheet_write_queue` row instead of pushing from the browser.

/** Most-recent open sync conflict (for the admin "Last sync conflict" panel). */
export function useLastSyncConflict() {
  return useQuery({
    queryKey: ["sync_conflicts", "last"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sync_conflicts")
        .select("*")
        .order("detected_at", { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as SyncConflict | null;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Aggregated sync health for the page header dot.
 *  - "synced":   every data_source row is `synced` and there are no open conflicts
 *  - "pending":  any source is awaiting first sync / changes haven't pushed yet
 *  - "conflict": any open conflict exists OR a source is in `failed`
 */
export type GlobalSyncStatus = "synced" | "pending" | "conflict" | "loading";

export function useGlobalSyncStatus(): {
  status: GlobalSyncStatus;
  conflictCount: number;
  pendingSources: string[];
  lastUpdatedAt: string | null;
} {
  const { data: sources, isLoading } = useQuery({
    queryKey: ["db-data-source-status", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("data_source_status")
        .select("source_type, current_status, updated_at");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  const { data: conflicts } = useSyncConflicts();
  const conflictCount = conflicts?.length ?? 0;

  if (isLoading) {
    return { status: "loading", conflictCount: 0, pendingSources: [], lastUpdatedAt: null };
  }

  const failed = (sources ?? []).filter((s: any) => s.current_status === "failed");
  const pending = (sources ?? []).filter((s: any) =>
    s.current_status === "awaiting_first_sync" || s.current_status === "pending",
  );
  const lastUpdatedAt = (sources ?? [])
    .map((s: any) => s.updated_at)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null;

  let status: GlobalSyncStatus = "synced";
  if (conflictCount > 0 || failed.length > 0) status = "conflict";
  else if (pending.length > 0) status = "pending";

  return {
    status,
    conflictCount,
    pendingSources: pending.map((s: any) => s.source_type),
    lastUpdatedAt,
  };
}


export type ConflictResolution = "keep_system" | "use_sheet" | "skip";

export interface SyncConflict {
  id: string;
  table_name: string;
  record_id: string | null;
  record_key: Record<string, string>;
  field_name: string;
  system_value: string | null;
  sheet_value: string | null;
  sheet_tab: string;
  sheet_row_number: number | null;
  detected_at: string;
  status: "open" | "resolved";
}

// Map of DB field → sheet header column (per table) for push-back when "Keep System".
const SHEET_HEADER_MAP: Record<string, Record<string, string>> = {
  lmp_processes: {
    company: "Company",
    role: "Role",
    status: "Status",
    type: "Type",
    date: "Date",
    closing_date: "Closing Date",
    prep_poc: "Prep POC",
    outreach_poc: "Outreach POC",
    daily_progress: "Daily Progress",
    r1_shortlisted: "R1\nShortlisted",
    r2_shortlisted: "R2\nShortlisted",
    r3_shortlisted: "R3\nShortlisted",
    final_convert: "Converted\nNames",
    convert_names: "Convert\nName(s)",
    prep_doc: "Prep Doc",
    domain_raw: "Domain",
  },
  students: {
    name: "Name",
    email: "Email",
    phone: "Phone",
    primary_domain: "Primary Domain",
    secondary_domain: "Secondary Domain",
  },
};

export function useSyncConflicts() {
  return useQuery({
    queryKey: ["sync_conflicts", "open"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sync_conflicts")
        .select("*")
        .eq("status", "open")
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SyncConflict[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/**
 * Returns conflicts related to LMPs where the current user is assigned as POC.
 * Used to show POCs when their edits failed to sync.
 */
export function useMySyncConflicts(lmpIds: string[]) {
  return useQuery({
    queryKey: ["sync_conflicts", "my", lmpIds],
    enabled: lmpIds.length > 0,
    queryFn: async () => {
      if (!lmpIds.length) return [];
      const { data, error } = await (supabase as any)
        .from("sync_conflicts")
        .select("*")
        .eq("status", "open")
        .eq("table_name", "lmp_processes")
        .in("record_id", lmpIds)
        .order("detected_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SyncConflict[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useResolveConflict() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      conflict: SyncConflict;
      resolution: ConflictResolution;
      actorEmail?: string;
    }) => {
      const { conflict, resolution, actorEmail } = params;

      if (resolution === "use_sheet" && conflict.record_id) {
        const patch: Record<string, unknown> = {
          [conflict.field_name]: conflict.sheet_value,
          sync_source: "sheet",
        };
        const { error } = await (supabase as any)
          .from(conflict.table_name)
          .update(patch)
          .eq("id", conflict.record_id);
        if (error) throw error;
      } else if (resolution === "keep_system" && conflict.record_id) {
        const header =
          SHEET_HEADER_MAP[conflict.table_name]?.[conflict.field_name];
        if (header) {
          // Enqueue a sheet mirror so the cron pushes DB → Sheet.
          await (supabase as any).from("sheet_write_queue").insert({
            tab_name: conflict.sheet_tab,
            operation: "update",
            status: "pending",
            enqueued_by: "conflict_resolution",
            payload: {
              op: "update",
              tab: conflict.sheet_tab,
              id: conflict.record_id,
              rowNumber: conflict.sheet_row_number ?? undefined,
              findBy: conflict.record_key,
              patch: { [header]: conflict.system_value ?? "" },
            },
          });
        }
      }

      const { error: rErr } = await (supabase as any)
        .from("sync_conflicts")
        .update({
          resolved_at: new Date().toISOString(),
          resolved_by: actorEmail ?? "unknown",
          resolution,
          status: "resolved",
        })
        .eq("id", conflict.id);
      if (rErr) throw rErr;

      return { conflict, resolution };
    },
    onSuccess: ({ conflict }) => {
      qc.invalidateQueries({ queryKey: ["sync_conflicts"] });
      qc.invalidateQueries({ queryKey: [`db-${conflict.table_name}`] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-students"] });
      toast({ title: "Conflict resolved" });
    },
    onError: (e: Error) => {
      toast({
        title: "Could not resolve conflict",
        description: e.message,
        variant: "destructive",
      });
    },
  });
}
