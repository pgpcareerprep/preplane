import { useEffect, useId, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/lib/rolesContext";

export type DbLmpComment = {
  id: string;
  lmp_id: string;
  author_user_id: string | null;
  author_name: string;
  author_initials: string | null;
  author_color: string | null;
  body: string;
  source: string | null;
  ts: string;
  created_at: string;
};

export function useLmpComments(lmpId: string | null) {
  const qc = useQueryClient();
  const instanceId = useId();
  const queryKey = useMemo(() => ["lmp-comments", lmpId ?? ""] as const, [lmpId]);

  const query = useQuery({
    queryKey,
    enabled: !!lmpId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lmp_comments")
        .select("*")
        .eq("lmp_id", lmpId!)
        .order("ts", { ascending: true });
      if (error) throw error;
      return (data ?? []) as DbLmpComment[];
    },
  });

  useEffect(() => {
    if (!lmpId) return;
    const ch = supabase
      .channel(`lmp_comments_${lmpId}_${instanceId.replace(/:/g, "")}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "lmp_comments", filter: `lmp_id=eq.${lmpId}` },
        () => qc.invalidateQueries({ queryKey }),
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [lmpId, qc, instanceId, queryKey]);

  return query;
}

function pad2(n: number) { return n.toString().padStart(2, "0"); }
function nowHHMM() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function usePostLmpComment() {
  const qc = useQueryClient();
  const { user } = useRole();

  return useMutation({
    mutationFn: async ({ lmpId, body }: { lmpId: string; body: string }) => {
      const trimmed = body.trim();
      if (!trimmed) throw new Error("Empty comment");

      const authorName = user.name || "Anonymous";
      const authorInitials = user.initials || authorName.slice(0, 2).toUpperCase();

      // Atomic backend write: inserts into lmp_comments AND prepends to
      // lmp_processes.comments in a single SECURITY DEFINER function so the
      // Comments column stays in sync regardless of the caller's POC role.
      const { error } = await supabase.rpc("post_lmp_comment", {
        _lmp_id: lmpId,
        _author_name: authorName,
        _author_initials: authorInitials,
        _author_color: "bg-orange-200 text-orange-600",
        _body: trimmed,
      });
      if (error) throw error;

      return { ok: true };
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["lmp-comments", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["lmp-process-comment", vars.lmpId] });
      qc.invalidateQueries({ queryKey: ["lmp_processes"] });
      qc.invalidateQueries({ queryKey: ["lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-processes"] });
      qc.invalidateQueries({ queryKey: ["db-lmp-full-view"] });
    },
  });
}
