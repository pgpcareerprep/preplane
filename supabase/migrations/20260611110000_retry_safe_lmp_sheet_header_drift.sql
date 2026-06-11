-- The live LMP Tracker keeps its unique LMP ID identity column at AA, but
-- several visible labels intentionally differ from the canonical registry
-- (line breaks, Prep Doc Link, and Comment). sheets-lmp now reports those
-- differences without blocking safe ID-based writes.
--
-- Only retry rows that failed for the retired full-label equality guard.
-- Missing/moved/duplicate LMP ID headers and duplicate data-row IDs remain
-- failed by the Edge Function and cannot append another row.

WITH retryable AS (
  SELECT DISTINCT ON (COALESCE(idempotency_key, id::text))
    id
  FROM public.sheet_write_queue failed
  WHERE failed.tab_name = 'LMP Tracker'
    AND failed.status = 'failed'
    AND failed.last_error = 'MISALIGNED_LMP_TRACKER_HEADERS'
    AND NOT EXISTS (
      SELECT 1
      FROM public.sheet_write_queue pending
      WHERE pending.status = 'pending'
        AND pending.idempotency_key IS NOT NULL
        AND pending.idempotency_key = failed.idempotency_key
    )
  ORDER BY COALESCE(idempotency_key, id::text), created_at DESC
)
UPDATE public.sheet_write_queue queue
SET status = 'pending',
    attempts = 0,
    attempt_count = 0,
    last_error = NULL,
    next_retry_at = now(),
    completed_at = NULL,
    updated_at = now()
FROM retryable
WHERE queue.id = retryable.id;

SELECT public.dispatch_sheet_retry_sweeper();
