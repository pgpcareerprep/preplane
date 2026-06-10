-- Post-deployment recovery for queue rows that exhausted retries while the
-- worker-to-sheets-lmp gateway call was failing with Invalid JWT.

UPDATE public.sheet_write_queue q
SET status = 'pending',
    attempts = 0,
    attempt_count = 0,
    last_error = NULL,
    next_retry_at = now(),
    completed_at = NULL,
    updated_at = now()
WHERE q.status = 'failed'
  AND q.last_error ILIKE '%Invalid JWT%'
  AND NOT EXISTS (
    SELECT 1
    FROM public.sheet_write_queue pending
    WHERE pending.status = 'pending'
      AND pending.idempotency_key IS NOT DISTINCT FROM q.idempotency_key
      AND pending.id <> q.id
  );

SELECT public.dispatch_sheet_retry_sweeper();
