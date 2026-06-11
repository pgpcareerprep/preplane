-- =============================================================================
-- LMP Tracker full reconciliation: fix 37 DB / 29 sheet mismatch.
--
-- Problems being fixed:
--   1. 70 failed queue jobs with last_error = DUPLICATE_LMP_ID_ROWS — the
--      sweeper was giving up permanently on this error instead of retrying.
--      Also, many LMPs had MULTIPLE failed jobs (same idempotency key) which
--      cannot all be reset to 'pending' simultaneously (unique index conflict).
--   2. 8 DB LMPs missing from the sheet — their sync jobs all failed.
--   3. sheet_row_id = 15 for all LMPs — never updated after row insertions.
--   4. No row ordering — sheet was unsorted relative to DB created_at order.
--
-- Strategy:
--   1. Mark all DUPLICATE_LMP_ID_ROWS failed jobs as 'done' (resolved by
--      reconcile) — they can't be reset to pending without violating the
--      unique index when multiple exist for the same LMP.
--   2. Enqueue one fresh sync job per unique LMP that had failed jobs — these
--      will serve as accuracy passes AFTER the reconcile runs.
--   3. Enqueue a single lmp-reconcile job that rebuilds the full sheet.
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
  -- Use a distinct idempotency key that won't clash with per-LMP sync keys.
  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by,
     idempotency_key, entity_id, attempt_count, attempts)
  VALUES (
    'LMP Tracker',
    'lmp-reconcile',
    jsonb_build_object('op', 'lmp-reconcile', 'tab', 'LMP Tracker', 'headerRow', 14),
    'pending', now(), 'migration_reconcile',
    'lmp:tracker:full-reconcile', NULL, 0, 0
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET
    payload       = EXCLUDED.payload,
    next_retry_at = now(),
    last_error    = NULL,
    attempts      = 0,
    attempt_count = 0,
    updated_at    = now()
  RETURNING id INTO v_queue_id;

  PERFORM public.dispatch_sheet_retry_sweeper(v_queue_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_reconcile failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lmp_sheet_reconcile() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lmp_sheet_reconcile() TO service_role;


-- ── 2. Mark DUPLICATE_LMP_ID_ROWS failed jobs as done ─────────────────────────
--
-- Multiple failed jobs can exist for the same LMP (same idempotency key).
-- Resetting them all to 'pending' would violate the partial unique index.
-- Mark them 'done' (resolved_by_reconcile) — the lmp-reconcile job handles
-- the full cleanup; after it completes, fresh individual sync jobs are
-- enqueued in step 3.

UPDATE public.sheet_write_queue
SET
  status        = 'done',
  last_error    = 'resolved_by_reconcile',
  completed_at  = now(),
  updated_at    = now()
WHERE tab_name  = 'LMP Tracker'
  AND status    = 'failed'
  AND last_error = 'DUPLICATE_LMP_ID_ROWS';

DO $$
DECLARE n int;
BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Marked % DUPLICATE_LMP_ID_ROWS failed job(s) as done (resolved_by_reconcile)', n;
END $$;


-- ── 3. Enqueue one fresh sync job per affected LMP (after reconcile runs) ─────
--
-- For each LMP that had a failed DUPLICATE_LMP_ID_ROWS job, enqueue a fresh
-- sync-db-to-sheet job scheduled 3 minutes from now (enough time for the
-- reconcile to complete first). This ensures each LMP gets a final accuracy
-- pass with current DB data after the sheet has been cleaned up.

DO $$
DECLARE
  lmp_rec RECORD;
  n int := 0;
BEGIN
  FOR lmp_rec IN
    SELECT DISTINCT (q.payload->>'lmp_code') AS lmp_code, l.id AS lmp_id
    FROM public.sheet_write_queue q
    JOIN public.lmp_processes l ON l.lmp_code = (q.payload->>'lmp_code')
    WHERE q.tab_name    = 'LMP Tracker'
      AND q.status      = 'done'
      AND q.last_error  = 'resolved_by_reconcile'
      AND l.lmp_code IS NOT NULL
  LOOP
    BEGIN
      INSERT INTO public.sheet_write_queue
        (tab_name, operation, payload, status, next_retry_at, enqueued_by,
         idempotency_key, entity_id, attempt_count, attempts)
      SELECT
        'LMP Tracker',
        'sync-db-to-sheet',
        jsonb_build_object(
          'op', 'sync-db-to-sheet', 'tab', 'LMP Tracker', 'headerRow', 14,
          'company', company, 'role', role, 'lmp_code', lmp_code,
          'dbPatch', to_jsonb(lmp_processes)
        ),
        'pending',
        now() + interval '3 minutes',
        'post_reconcile_resync',
        'lmp:' || id::text || ':sync',
        id,
        0, 0
      FROM public.lmp_processes
      WHERE id = lmp_rec.lmp_id
      ON CONFLICT (idempotency_key)
        WHERE idempotency_key IS NOT NULL AND status = 'pending'
      DO UPDATE SET
        next_retry_at = EXCLUDED.next_retry_at,
        updated_at    = now();
      n := n + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Post-reconcile re-enqueue failed for %: %', lmp_rec.lmp_code, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Enqueued % post-reconcile accuracy sync job(s)', n;
END $$;


-- ── 4. Enqueue the full reconcile job ─────────────────────────────────────────

DO $$
BEGIN
  PERFORM public.enqueue_lmp_sheet_reconcile();
  RAISE NOTICE 'Enqueued lmp-reconcile job';
END $$;


-- ── 5. Notify PostgREST ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
