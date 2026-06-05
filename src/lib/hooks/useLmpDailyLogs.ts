import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LmpDailyLogEntryType =
  | "progress"
  | "no_update"
  | "comment"
  | "checklist"
  | "mentor"
  | "candidate_move";

export interface LmpDailyLog {
  id: string;
  lmp_id: string;
  entry_type: LmpDailyLogEntryType;
  author_name: string;
  author_email: string | null;
  text: string;
  chips: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  _optimistic?: boolean;
}

const KEY = (lmpId: string) => ["lmp_daily_logs", lmpId] as const;

export function useLmpDailyLogs(lmpId: string | undefined) {
  return useQuery({
    queryKey: KEY(lmpId ?? ""),
    enabled: !!lmpId,
    queryFn: async (): Promise<LmpDailyLog[]> => {
      const { data, error } = await supabase
        .from("lmp_daily_logs")
        .select("*")
        .eq("lmp_id", lmpId!)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as LmpDailyLog[];
    },
  });
}

export interface AddProgressLogInput {
  text: string;
  chips?: string[];
  entry_type?: LmpDailyLogEntryType;
  author_name: string;
  author_email?: string | null;
  metadata?: Record<string, unknown>;
}

export function useAddProgressLog(lmpId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddProgressLogInput): Promise<LmpDailyLog> => {
      const { data, error } = await supabase
        .from("lmp_daily_logs")
        .insert({
          lmp_id: lmpId,
          entry_type: input.entry_type ?? "progress",
          author_name: input.author_name,
          author_email: input.author_email ?? null,
          text: input.text,
          chips: input.chips ?? [],
          metadata: (input.metadata ?? {}) as never,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as LmpDailyLog;
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: KEY(lmpId) });
      const prev = qc.getQueryData<LmpDailyLog[]>(KEY(lmpId)) ?? [];
      const optimistic: LmpDailyLog = {
        id: `optimistic-${Date.now()}`,
        lmp_id: lmpId,
        entry_type: input.entry_type ?? "progress",
        author_name: input.author_name,
        author_email: input.author_email ?? null,
        text: input.text,
        chips: input.chips ?? [],
        metadata: input.metadata ?? {},
        created_at: new Date().toISOString(),
        _optimistic: true,
      };
      qc.setQueryData<LmpDailyLog[]>(KEY(lmpId), [optimistic, ...prev]);
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY(lmpId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEY(lmpId) });
    },
  });
}
