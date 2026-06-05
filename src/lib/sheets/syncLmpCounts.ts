import { supabase } from "@/integrations/supabase/client";

/**
 * Fire-and-forget: refresh the calculated columns (R1/R2/R3 Shortlisted and
 * Mentor Rating) on the LMP Tracker sheet row for a single LMP.
 *
 * The `sync-db-to-sheet` op in the `sheets-lmp` edge function always re-reads
 * `lmp_full_view` for the calculated columns regardless of what's in dbPatch,
 * so passing an empty dbPatch is enough to refresh those cells without
 * touching anything else.
 */
export async function syncLmpCountsToSheet(_lmpId: string): Promise<void> {
  // Google Sheets integration on hold (2026-05). No-op so callers in
  // useDbData.ts continue to compile and the database stays the single source
  // of truth.
  void supabase;
  return;
}
