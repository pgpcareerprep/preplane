import { supabase } from "@/integrations/supabase/client";
import { sheets, getHeaderRow, TABS, type TabName } from "@/lib/sheets";
import { useQuery } from "@tanstack/react-query";

/**
 * Queue a sheet write that the user-flow shouldn't block on. The event row is
 * the persistent retry log: if the sheet call fails we leave it in
 * `status='pending'` so a later retry can pick it up. On success we mark it
 * `status='success'`.
 *
 * This is the fix for "Create LMP sheet insert fails with no retry" — instead
 * of fire-and-forget we always have a row to retry from.
 */
/**
 * Google Sheets integration on hold (2026-05). Both functions are no-ops so
 * existing call sites (e.g. createLmpProcess.ts) and any scheduled retry
 * sweepers stop reaching the `sheets-lmp` edge function. The `sheets`,
 * `getHeaderRow`, `TABS`, and `TabName` imports remain so re-enabling later is
 * a single-commit revert.
 */
export async function queueSheetInsert(_args: {
  tab: TabName;
  row: Record<string, unknown>;
  recordId: string;
}): Promise<void> {
  void supabase;
  void sheets;
  void getHeaderRow;
  void TABS;
  return;
}

export async function retryPendingSheetWrites(): Promise<{ attempted: number; succeeded: number }> {
  return { attempted: 0, succeeded: 0 };
}

/** Returns count of pending and failed sheet write jobs for monitoring. */
export function useSheetWriteQueueStatus() {
  return useQuery({
    queryKey: ["sheet-write-queue-status"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sheet_write_queue")
        .select("id, status, created_at, error_message")
        .in("status", ["pending", "failed"])
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) return { pending: 0, failed: 0, items: [] };
      const items = (data ?? []) as Array<{ id: string; status: string; created_at: string; error_message: string | null }>;
      return {
        pending: items.filter((i) => i.status === "pending").length,
        failed: items.filter((i) => i.status === "failed").length,
        items,
      };
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
