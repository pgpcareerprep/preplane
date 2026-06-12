-- =============================================================================
-- Fix Google Sheet duplicate LMP rows caused by double-dispatch.
--
-- Root cause:
--   Migration 20260611180000 ran `UPDATE lmp_processes SET sync_source =
--   'backfill_prep_doc_link'`. Because 'backfill_prep_doc_link' was not in the
--   trigger guard, the AFTER UPDATE trigger fired AND called
--   dispatch_sheet_retry_sweeper(job_id). The migration DO block then also
--   called enqueue_lmp_sheet_mirror_by_id for the same LMP which, via ON
--   CONFLICT DO UPDATE, returned the same job_id and called
--   dispatch_sheet_retry_sweeper(job_id) a second time.
--
--   Two concurrent sweeper HTTP requests both saw the job as 'pending', both
--   called sheets-lmp, both found "LMP not in sheet", and both inserted a row
--   → duplicates at rows 15+16 (LMP-2026-0051) and 19+20 (LMP-2026-0050).
--
-- Fixes applied:
--   1. Expand trigger guard to include batch sync_source values
--      ('backfill_prep_doc_link', 'resync_comments_prep_doc_link'). These are
--      migration-only values where the DO block already calls
--      enqueue_lmp_sheet_mirror_by_id explicitly — the trigger re-enqueue is
--      redundant and the source of the double dispatch.
--   2. Re-enqueue all LMPs so the next sweep triggers the built-in
--      auto-dedup logic in sheets-lmp (DUPLICATE_LMP_ID_ROWS path) which
--      keeps the richest row and deletes extras.
-- =============================================================================


-- ── 1. Expand trigger guard ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Do NOT enqueue when the UPDATE was initiated by:
  --   'sheet'                         – inbound sheet→DB write (prevents echo-back)
  --   'trigger_mirror'                – edge-function sheet_row_id write-back
  --   'backfill_prep_doc_link'        – migration DO block enqueues explicitly
  --   'resync_comments_prep_doc_link' – migration DO block enqueues explicitly
  IF COALESCE(NEW.sync_source, '') IN (
    'sheet',
    'trigger_mirror',
    'backfill_prep_doc_link',
    'resync_comments_prep_doc_link'
  ) THEN
    RETURN NEW;
  END IF;
  PERFORM public.enqueue_lmp_sheet_mirror_by_id(NEW.id, 'lmp_process_change');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror failed: %', SQLERRM;
  RETURN NEW;
END;
$$;


-- ── 2. Re-enqueue all LMPs to trigger auto-dedup on duplicates ───────────────
--
-- The sheets-lmp DUPLICATE_LMP_ID_ROWS auto-dedup code (lines 1081-1102 of
-- index.ts) fires at the START of every sync-db-to-sheet job. Re-enqueueing
-- all LMPs causes the sweeper to revisit every row; any duplicates found are
-- cleaned up automatically before the update proceeds.

DO $$
DECLARE
  lmp_rec RECORD;
  n int := 0;
BEGIN
  FOR lmp_rec IN
    SELECT id, lmp_code
    FROM public.lmp_processes
    WHERE lmp_code IS NOT NULL
    ORDER BY updated_at DESC
  LOOP
    BEGIN
      PERFORM public.enqueue_lmp_sheet_mirror_by_id(lmp_rec.id, 'dedup_cleanup');
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Re-enqueue failed for % (%): %', lmp_rec.lmp_code, lmp_rec.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Queued % LMP(s) for dedup-cleanup sync', n;
END $$;


-- ── 3. Notify PostgREST ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
