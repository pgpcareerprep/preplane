/**
 * Hook for DB-backed progress history + reminder management.
 * Works with lmp_progress_history, lmp_progress_reminders, and lmp_processes tables.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | undefined | null) => !!v && UUID_RE.test(v);

export type ProgressHistoryEntry = {
  id: string;
  lmp_id: string;
  progress_text: string;
  progress_type: "progress_update" | "no_update";
  created_by: string | null;
  author_email: string | null;
  created_at: string;
  edited_at: string | null;
  next_progress_date_snapshot: string | null;
  reminder_type_snapshot: string | null;
};

export function useProgressHistory(lmpId: string) {
  return useQuery({
    queryKey: ["lmp_progress_history", lmpId],
    queryFn: async () => {
      // New canonical source: lmp_daily_logs filtered to entry_type='progress'.
      const { data, error } = await (supabase as any)
        .from("lmp_daily_logs")
        .select("id, lmp_id, text, chips, metadata, author_name, author_email, created_at, entry_type")
        .eq("lmp_id", lmpId)
        .eq("entry_type", "progress")
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("lmp_daily_logs progress query failed:", error.message);
        return [] as ProgressHistoryEntry[];
      }
      return ((data ?? []) as any[]).map((row) => ({
        id: row.id,
        lmp_id: row.lmp_id,
        progress_text: row.text ?? "",
        progress_type: (row.metadata?.progress_type as any) || "progress_update",
        created_by: row.author_name ?? null,
        author_email: row.author_email ?? row.metadata?.author_email ?? null,
        created_at: row.created_at,
        edited_at: row.metadata?.edited_at ?? null,
        next_progress_date_snapshot: row.metadata?.next_progress_date ?? null,
        reminder_type_snapshot: Array.isArray(row.chips) && row.chips.length > 0 ? row.chips[0] : null,
      })) as ProgressHistoryEntry[];
    },
    enabled: isUuid(lmpId),
    staleTime: 30_000,
  });
}

export function useUpdateProgressEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { entryId: string; lmpId: string; text: string }) => {
      const trimmed = params.text.trim();
      if (!trimmed) return;
      const { data: row } = await (supabase as any)
        .from("lmp_daily_logs")
        .select("metadata")
        .eq("id", params.entryId)
        .maybeSingle();
      const meta = (row?.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, any>;
      const nextMeta = { ...meta, edited_at: new Date().toISOString() };
      const { error } = await (supabase as any)
        .from("lmp_daily_logs")
        .update({ text: trimmed, metadata: nextMeta })
        .eq("id", params.entryId);
      if (error) console.warn("Failed to update progress entry:", error.message);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp_progress_history", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["exec_progress", vars.lmpId] });
    },
  });
}

export function useDeleteProgressEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { entryId: string; lmpId: string }) => {
      const { error } = await (supabase as any)
        .from("lmp_daily_logs")
        .delete()
        .eq("id", params.entryId);
      if (error) console.warn("Failed to delete progress entry:", error.message);
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp_progress_history", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["exec_progress", vars.lmpId] });
    },
  });
}

export function useAddProgressEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: {
      lmpId: string;
      progressText: string;
      progressType: "progress_update" | "no_update";
      createdBy?: string;
      nextProgressDateSnapshot?: string | null;
      reminderTypeSnapshot?: string | null;
    }) => {
      if (!isUuid(entry.lmpId)) return;
      const { error } = await (supabase as any).from("lmp_daily_logs").insert({
        lmp_id: entry.lmpId,
        entry_type: "progress",
        text: entry.progressText,
        author_name: entry.createdBy || "POC",
        chips: entry.reminderTypeSnapshot ? [entry.reminderTypeSnapshot] : [],
        metadata: {
          progress_type: entry.progressType,
          next_progress_date: entry.nextProgressDateSnapshot || null,
          source: "ui",
        },
      });
      if (error) {
        console.warn("Failed to insert progress entry into lmp_daily_logs:", error.message);
      }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp_progress_history", vars.lmpId] });
    },
  });
}

export function useSaveNextProgressDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      lmpId: string;
      nextDate: string | null;
      reminderType: string;
      pocEmail?: string;
      skipReminder?: boolean;
    }) => {
      if (!isUuid(params.lmpId)) return 0;
      // Coerce empty/whitespace strings to null — Postgres rejects "" for date columns
      const nextDate = params.nextDate && String(params.nextDate).trim() !== ""
        ? params.nextDate
        : null;
      // Get current reminder_version
      const { data: current } = await supabase
        .from("lmp_processes")
        .select("reminder_version" as any)
        .eq("id", params.lmpId)
        .single();

      const newVersion = (((current as any)?.reminder_version as number) || 0) + 1;

      const updatePayload: Record<string, any> = {
        next_progress_date: nextDate,
        next_progress_reminder_type: params.reminderType,
        next_progress_status: nextDate ? "pending" : null,
        reminder_version: newVersion,
      };

      const { error } = await supabase
        .from("lmp_processes")
        .update(updatePayload as any)
        .eq("id", params.lmpId);
      if (error) {
        console.warn("Failed to update lmp_processes next progress:", error.message);
      }

      // Always cancel old pending reminders (avoid stale sends after toggling off)
      await (supabase as any)
        .from("lmp_progress_reminders")
        .update({ status: "cancelled" })
        .eq("lmp_id", params.lmpId)
        .eq("status", "pending");

      // Only create a new pending reminder if a date is set AND scheduled email is enabled
      if (nextDate && !params.skipReminder) {
        await (supabase as any).from("lmp_progress_reminders").insert({
          lmp_id: params.lmpId,
          poc_email: params.pocEmail || null,
          next_progress_date: nextDate,
          reminder_version: newVersion,
          status: "pending",
        });
        supabase.functions.invoke("send-progress-confirmation-email", {
          body: {
            lmp_id: params.lmpId,
            next_date: nextDate,
            reminder_type: params.reminderType || "Follow-up",
            ...(params.pocEmail ? { to_email: params.pocEmail } : {}),
          },
        }).then(({ error, data }) => {
          if (error) console.error("[progress-email] invoke error:", error);
          else if (data && !data.ok) console.warn("[progress-email] send failed:", data);
        });
      }

      return newVersion;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp_processes"] });
    },
  });
}

export function useUpdateLastProgressAt() {
  return useMutation({
    mutationFn: async (lmpId: string) => {
      if (!isUuid(lmpId)) return;
      const { error } = await supabase
        .from("lmp_processes")
        .update({ last_progress_updated_at: new Date().toISOString() } as any)
        .eq("id", lmpId);
      if (error) {
        console.warn("Failed to update last_progress_updated_at:", error.message);
      }
    },
  });
}
