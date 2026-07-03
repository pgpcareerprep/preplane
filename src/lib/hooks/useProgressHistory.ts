/**
 * Hook for DB-backed progress history + reminder management.
 * Works with lmp_progress_history, lmp_progress_reminders, and lmp_processes tables.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";
import { normalizeNextProgressType } from "@/lib/nextProgressType";

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
  const invalidateProgressSurfaces = (lmpId: string) => {
    qc.invalidateQueries({ queryKey: ["lmp_progress_history", lmpId] });
    qc.invalidateQueries({ queryKey: ["exec_progress", lmpId] });
    qc.invalidateQueries({ queryKey: ["exec_timeline", lmpId] });
    qc.invalidateQueries({ queryKey: ["lmp_timeline_recent"] });
    qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
    qc.invalidateQueries({ queryKey: ["db-lmp-process", lmpId] });
    qc.invalidateQueries({ queryKey: ["sheets", "LMP Tracker"] });
  };

  return useMutation({
    mutationFn: async (params: { entryId: string; lmpId: string; text: string }) => {
      const trimmed = params.text.trim();
      if (!trimmed) throw new Error("Progress text cannot be blank.");
      const { data, error } = await (supabase as any).rpc("update_lmp_daily_progress_entry", {
        p_entry_id: params.entryId,
        p_text: trimmed,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidateProgressSurfaces(vars.lmpId);
    },
  });
}

export function useDeleteProgressEntry() {
  const qc = useQueryClient();
  const invalidateProgressSurfaces = (lmpId: string) => {
    qc.invalidateQueries({ queryKey: ["lmp_progress_history", lmpId] });
    qc.invalidateQueries({ queryKey: ["exec_progress", lmpId] });
    qc.invalidateQueries({ queryKey: ["exec_timeline", lmpId] });
    qc.invalidateQueries({ queryKey: ["lmp_timeline_recent"] });
    qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
    qc.invalidateQueries({ queryKey: ["db-lmp-process", lmpId] });
    qc.invalidateQueries({ queryKey: ["sheets", "LMP Tracker"] });
  };

  return useMutation({
    mutationFn: async (params: { entryId: string; lmpId: string }) => {
      const { error } = await (supabase as any).rpc("delete_lmp_daily_progress_entry", {
        p_entry_id: params.entryId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      invalidateProgressSurfaces(vars.lmpId);
    },
  });
}

export function useAddProgressEntry() {
  const qc = useQueryClient();
  const { user } = useRole();
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
      const authorName = entry.createdBy || user.pocProfileName || user.name || "POC";
      const authorEmail = user.email || null;
      const reminderChip = normalizeNextProgressType(entry.reminderTypeSnapshot);
      const { error } = await (supabase as any).from("lmp_daily_logs").insert({
        lmp_id: entry.lmpId,
        entry_type: "progress",
        text: entry.progressText,
        author_name: authorName,
        author_email: authorEmail,
        chips: reminderChip ? [reminderChip] : [],
        metadata: {
          progress_type: entry.progressType,
          next_progress_date: entry.nextProgressDateSnapshot || null,
          source: "ui",
          author_name: authorName,
          author_email: authorEmail,
          author_user_id: user.id || null,
          author_poc_id: user.pocProfileId || null,
        },
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp_progress_history", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["exec_progress", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["exec_timeline", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["lmp_timeline_recent"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-full-view"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-process", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["sheets", "LMP Tracker"] });
    },
  });
}

export function useSaveNextProgressDate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      lmpId: string;
      nextDate: string | null;
      reminderType?: string | null;
      pocEmail?: string;
      skipReminder?: boolean;
    }) => {
      if (!isUuid(params.lmpId)) return 0;
      const nextDate = params.nextDate && String(params.nextDate).trim() !== ""
        ? params.nextDate
        : null;
      const normalizedType = normalizeNextProgressType(params.reminderType);
      const typeToSave = normalizedType || null;

      const { data: current } = await supabase
        .from("lmp_processes")
        .select("reminder_version" as any)
        .eq("id", params.lmpId)
        .single();

      const newVersion = (((current as any)?.reminder_version as number) || 0) + 1;

      const updatePayload: Record<string, any> = nextDate
        ? {
            next_progress_date: nextDate,
            next_progress_type: typeToSave,
            next_progress_reminder_type: typeToSave,
            next_progress_status: "pending",
            reminder_version: newVersion,
          }
        : {
            next_progress_date: null,
            next_progress_type: null,
            next_progress_reminder_type: null,
            next_progress_status: null,
            reminder_version: newVersion,
          };

      const { error } = await supabase
        .from("lmp_processes")
        .update(updatePayload as any)
        .eq("id", params.lmpId);
      if (error) {
        console.warn("Failed to update lmp_processes next progress:", error.message);
        throw error;
      }

      await (supabase as any)
        .from("lmp_progress_reminders")
        .update({ status: "cancelled" })
        .eq("lmp_id", params.lmpId)
        .eq("status", "pending");

      if (nextDate && !params.skipReminder) {
        await (supabase as any).from("lmp_progress_reminders").insert({
          lmp_id: params.lmpId,
          poc_email: params.pocEmail || null,
          next_progress_date: nextDate,
          reminder_version: newVersion,
          reminder_type: typeToSave,
          status: "pending",
        });

        const { error: emailError, data: emailData } = await supabase.functions.invoke(
          "send-progress-confirmation-email",
          {
            body: {
              lmp_id: params.lmpId,
              next_date: nextDate,
              ...(normalizedType ? { reminder_type: normalizedType } : {}),
              ...(params.pocEmail ? { to_email: params.pocEmail } : {}),
            },
          },
        );
        if (emailError || (emailData && !emailData.ok)) {
          toast.error("Reminder saved, but confirmation email failed.");
          console.error("[progress-email] send failed:", emailError ?? emailData);
        }
      }

      return newVersion;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp_processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-process", vars.lmpId] });
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
