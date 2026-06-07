/**
 * useRealtimeInvalidate
 * ---------------------
 * Subscribes to Postgres changes on a table and invalidates one or more
 * react-query keys whenever a row event fires. Cleans up automatically.
 *
 * Usage:
 *   useRealtimeInvalidate("lmp_processes", [["db-lmp-processes"]]);
 *   useRealtimeInvalidate(
 *     "lmp_candidates",
 *     [["db-lmp-candidates"], ["db-lmp-candidate-counts"]],
 *     { filter: `lmp_id=eq.${lmpId}` }
 *   );
 */
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clearCachePrefix } from "./useDbData";

type RealtimeTable =
  | "lmp_processes"
  | "lmp_candidates"
  | "sessions"
  | "session_student_feedbacks"
  | "lmp_mentors"
  | "lmp_daily_logs"
  | "lmp_poc_links"
  | "mentors"
  | "students"
  | "alumni_records"
  | "poc_profiles"
  | "domains"
  | "profiles"
  | "feedback_templates"
  | "activity_log"
  | "upload_history"
  | "lmp_guide_manual"
  | "lmp_guide_nodes"
  | "lmp_drafts"
  | "sync_conflicts"
  | "copilot_messages";

interface Options {
  /** PostgREST-style filter, e.g. `lmp_id=eq.xxx`. */
  filter?: string;
  /** Default `*` (insert/update/delete). */
  event?: "INSERT" | "UPDATE" | "DELETE" | "*";
  /** Skip subscription entirely (e.g. while a key prop is missing). */
  enabled?: boolean;
  /**
   * Optional in-memory cache prefixes (from useDbData's __queryCache) to wipe
   * on each event, so the subsequent refetch isn't served a stale snapshot.
   */
  cachePrefixes?: string[];
}

export function useRealtimeInvalidate(
  table: RealtimeTable,
  queryKeys: QueryKey[],
  options: Options = {},
): void {
  const qc = useQueryClient();
  const keysRef = useRef(queryKeys);
  keysRef.current = queryKeys;
  const prefixesRef = useRef(options.cachePrefixes);
  prefixesRef.current = options.cachePrefixes;

  const { filter, event = "*", enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;
    const channelName = `rt-${table}-${filter ?? "all"}-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        () => {
          for (const prefix of prefixesRef.current ?? []) {
            clearCachePrefix(prefix);
          }
          for (const key of keysRef.current) {
            qc.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();

    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, [qc, table, filter, event, enabled]);
}
