import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_ROUNDS, type Round } from "@/lib/lmpProcessMutations";

const keyFor = (lmpId: string) => `lmp.${lmpId}.rounds`;
const qKey = (lmpId?: string) => ["lmp-rounds", lmpId ?? null] as const;

/**
 * Fetch persisted interview rounds for a given LMP from `system_settings`.
 * Falls back to DEFAULT_ROUNDS when nothing has been saved yet.
 */
export function useLmpRounds(lmpId?: string) {
  return useQuery({
    queryKey: qKey(lmpId),
    enabled: !!lmpId,
    staleTime: 60_000,
    queryFn: async (): Promise<Round[]> => {
      if (!lmpId) return DEFAULT_ROUNDS;
      const { data, error } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", keyFor(lmpId))
        .maybeSingle();
      if (error) throw error;
      const rounds = (data?.value as any)?.rounds;
      if (Array.isArray(rounds) && rounds.length > 0) return rounds as Round[];
      return DEFAULT_ROUNDS;
    },
  });
}

export function useSaveLmpRounds(lmpId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rounds: Round[]) => {
      if (!lmpId) throw new Error("Missing LMP id; rounds cannot be persisted yet.");
      const { error } = await supabase
        .from("system_settings")
        .upsert(
          { key: keyFor(lmpId), value: { rounds } as any, updated_at: new Date().toISOString() },
          { onConflict: "key" },
        );
      if (error) throw error;
      return rounds;
    },
    onMutate: async (rounds) => {
      await qc.cancelQueries({ queryKey: qKey(lmpId) });
      const prev = qc.getQueryData<Round[]>(qKey(lmpId));
      qc.setQueryData(qKey(lmpId), rounds);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qKey(lmpId), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qKey(lmpId) });
    },
  });
}
