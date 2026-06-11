-- The live LMP Tracker keeps its unique LMP ID identity column at AA, but
-- several visible labels intentionally differ from the canonical registry
-- (line breaks, Prep Doc Link, and Comment). sheets-lmp now reports those
-- differences without blocking safe ID-based writes.
--
-- Only retry rows that failed for the retired full-label equality guard.
-- Missing/moved/duplicate LMP ID headers and duplicate data-row IDs remain
-- failed by the Edge Function and cannot append another row.

UPDATE public.sheet_write_queue
SET status = 'pending',
    attempts = 0,
    attempt_count = 0,
    last_error = NULL,
    next_retry_at = now(),
    completed_at = NULL,
    updated_at = now()
WHERE tab_name = 'LMP Tracker'
  AND status = 'failed'
  AND last_error = 'MISALIGNED_LMP_TRACKER_HEADERS';

SELECT public.dispatch_sheet_retry_sweeper();
