import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SheetLinkStatus = "synced" | "pending" | "local";

/**
 * Per LMP record id, decide whether the row has been written to the sheet
 * ("synced"), has an in-flight/unfinished write ("pending"), or has never
 * been pushed ("local").
 *
 * Source of truth (in priority order):
 *  1. Latest sheet_sync_events row for direction=app_to_sheet
 *     - pending or error  → "pending"
 *     - success / other   → "synced"
 *  2. No events at all → fall back to lmp_processes:
 *     - sheet_row_id or lmp_code present → "synced" (legacy write, no event log)
 *     - neither → "local"
 */
export function useLmpSheetLinkStatus(recordIds: string[]) {
  const ids = [...new Set(recordIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ["lmp-sheet-link-status", ids] as const,
    enabled: ids.length > 0,
    queryFn: async () => {
      const [eventsRes, processesRes] = await Promise.all([
        supabase
          .from("sheet_sync_events")
          .select("record_id, status, created_at")
          .in("record_id", ids)
          .eq("direction", "app_to_sheet")
          .order("created_at", { ascending: false }),
        supabase
          .from("lmp_processes")
          .select("id, sheet_row_id, lmp_code")
          .in("id", ids),
      ]);
      if (eventsRes.error) throw eventsRes.error;
      if (processesRes.error) throw processesRes.error;

      // Take only the most recent event per record_id (rows are ordered DESC).
      const latestByRecord = new Map<string, string>();
      for (const r of eventsRes.data ?? []) {
        const rid = r.record_id as string | null;
        if (!rid || latestByRecord.has(rid)) continue;
        latestByRecord.set(rid, (r.status as string) ?? "success");
      }

      const procById = new Map<string, { sheet_row_id: string | null; lmp_code: string | null }>();
      for (const p of processesRes.data ?? []) {
        procById.set(p.id as string, {
          sheet_row_id: (p as any).sheet_row_id ?? null,
          lmp_code: (p as any).lmp_code ?? null,
        });
      }

      const map = new Map<string, SheetLinkStatus>();
      for (const id of ids) {
        const latest = latestByRecord.get(id);
        if (latest === "pending" || latest === "error" || latest === "failed") {
          map.set(id, "pending");
          continue;
        }
        if (latest) {
          map.set(id, "synced");
          continue;
        }
        // No event: rely on the LMP row itself.
        const proc = procById.get(id);
        if (proc && (proc.sheet_row_id || proc.lmp_code)) {
          map.set(id, "synced");
        } else {
          map.set(id, "local");
        }
      }
      return map;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
