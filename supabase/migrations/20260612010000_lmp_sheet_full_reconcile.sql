-- =============================================================================
-- LMP Tracker full reconciliation: fix 37 DB / 29 sheet mismatch.
--
-- Problems being fixed:
--   1. 70 failed queue jobs with last_error = DUPLICATE_LMP_ID_ROWS — the
--      sweeper was giving up permanently on this error instead of retrying.
--   2. 8 DB LMPs missing from the sheet — their sync jobs all failed.
--   3. sheet_row_id = 15 for all LMPs — never updated after row insertions.
--   4. No row ordering — sheet was unsorted relative to DB created_at order.
--
-- Fixes applied:
--   1. Reset all DUPLICATE_LMP_ID_ROWS failed jobs → pending so the sweeper
--      retries them (sweeper code no longer gives up on this error).
--   2. Enqueue a single lmp-reconcile job that performs a full rebuild:
--        - dedup duplicate LMP rows in-sheet
--        - delete orphan rows not in DB
--        - compact blank rows
--        - insert missing LMPs
--        - reorder all rows newest-first by writing sorted values
--        - update sheet_row_id to real row numbers in DB
-- =============================================================================


-- ── 1. Add enqueue_lmp_sheet_reconcile helper ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_reconcile()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by,
     idempotency_key, entity_id, attempt_count, attempts)
  VALUES (
    'LMP Tracker',
    'lmp-reconcile',
    jsonb_build_object('op', 'lmp-reconcile', 'tab', 'LMP Tracker', 'headerRow', 14),
    'pending', now(), 'migration_reconcile',
    'lmp:reconcile:full', NULL, 0, 0
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET
    payload    = EXCLUDED.payload,
    next_retry_at = now(),
    last_error = NULL,
    attempts   = 0,
    attempt_count = 0,
    updated_at = now()
  RETURNING id INTO v_queue_id;

  PERFORM public.dispatch_sheet_retry_sweeper(v_queue_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_reconcile failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lmp_sheet_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lmp_sheet_reconcile() TO service_role;


-- ── 2. Reset DUPLICATE_LMP_ID_ROWS failed jobs → pending ─────────────────────
--
-- The sweeper was marking these as permanently failed. Now that the sweeper
-- no longer gives up on DUPLICATE_LMP_ID_ROWS, these can be retried. However,
-- the lmp-reconcile job (enqueued below) will handle the full cleanup first,
-- so these individual retries serve as a final accuracy pass.

UPDATE public.sheet_write_queue
SET
  status        = 'pending',
  last_error    = NULL,
  attempts      = 0,
  attempt_count = 0,
  next_retry_at = now() + interval '5 minutes',  -- give reconcile time to finish first
  updated_at    = now()
WHERE tab_name = 'LMP Tracker'
  AND status   = 'failed'
  AND last_error = 'DUPLICATE_LMP_ID_ROWS';

DO $$
DECLARE n int;
BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Reset % failed DUPLICATE_LMP_ID_ROWS job(s) to pending', n;
END $$;


-- ── 3. Enqueue the full reconcile job ─────────────────────────────────────────

DO $$
BEGIN
  PERFORM public.enqueue_lmp_sheet_reconcile();
  RAISE NOTICE 'Enqueued lmp-reconcile job';
END $$;


-- ── 4. Notify PostgREST ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
