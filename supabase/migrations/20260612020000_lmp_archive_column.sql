-- =============================================================================
-- Add is_archived column to lmp_processes.
--
-- Purpose: Allow soft-deletion of test/stale LMP records without hard-deleting
-- production data. Archived LMPs are excluded from the LMP Tracker sheet sync
-- (reconcile query filters WHERE is_archived IS NOT TRUE).
--
-- LMP-2026-0047 (company="testing", role="data") was a test record that was
-- never meant to appear in the live sheet. Marking it is_archived = true
-- excludes it from all future reconcile runs.
-- =============================================================================


-- ── 1. Add column ─────────────────────────────────────────────────────────────

ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false;

-- Backfill: existing rows get false from the DEFAULT, but make it explicit.
UPDATE public.lmp_processes
SET is_archived = false
WHERE is_archived IS NULL;


-- ── 2. Archive the test record ────────────────────────────────────────────────

UPDATE public.lmp_processes
SET is_archived = true
WHERE lmp_code = 'LMP-2026-0047';

DO $$
DECLARE n int;
BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Marked % LMP(s) as archived', n;
END $$;


-- ── 3. Re-trigger full reconcile to remove archived LMP from sheet ─────────────

DO $$
BEGIN
  PERFORM public.enqueue_lmp_sheet_reconcile();
  RAISE NOTICE 'Enqueued lmp-reconcile job to remove archived LMPs from sheet';
END $$;


-- ── 4. Notify PostgREST ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
