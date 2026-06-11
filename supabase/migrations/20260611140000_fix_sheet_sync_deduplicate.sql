-- =============================================================================
-- Fix sheet sync: force-re-enqueue all LMPs with daily_progress so the
-- daily_progress field (and other updated fields) reflect correctly in the
-- Google Sheet.
--
-- Root cause: duplicate sheet rows for some LMPs caused DUPLICATE_LMP_ID_ROWS
-- errors blocking the write queue. The sheets-lmp Edge Function now auto-dedupes
-- on sync (2026-06-11). This migration re-enqueues affected LMPs so they get
-- processed with the new dedup logic.
--
-- Uses the live enqueue_lmp_sheet_mirror_by_id() function which:
--   - Sets idempotency_key = 'lmp:{uuid}:sync'
--   - Uses ON CONFLICT DO UPDATE (safe to call for already-pending entries)
--   - Fires the sweeper immediately via dispatch_sheet_retry_sweeper()
-- =============================================================================

DO $$
DECLARE
  lmp_rec RECORD;
BEGIN
  FOR lmp_rec IN
    SELECT id, lmp_code, company, daily_progress
    FROM public.lmp_processes
    WHERE lmp_code IS NOT NULL
      AND (
        -- LMPs with daily_progress that need to be reflected in the sheet
        (daily_progress IS NOT NULL AND daily_progress != '')
        -- Plus any LMP where a previous sync failed with DUPLICATE_LMP_ID_ROWS
        OR id IN (
          SELECT DISTINCT entity_id
          FROM public.sheet_write_queue
          WHERE last_error = 'DUPLICATE_LMP_ID_ROWS'
            AND entity_id IS NOT NULL
        )
      )
  LOOP
    BEGIN
      PERFORM public.enqueue_lmp_sheet_mirror_by_id(lmp_rec.id, 'dedup_daily_progress_fix');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Re-enqueue failed for % (%): %', lmp_rec.lmp_code, lmp_rec.id, SQLERRM;
    END;
  END LOOP;
END $$;
