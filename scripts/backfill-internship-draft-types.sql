-- Task 11: Preview-first backfill for mislabeled internship drafts in lmp_process_drafts.
-- Run Step 1 only first. If count = 0, skip entirely.
-- Only run Step 2 after reviewing Step 1 output on staging/snapshot.

-- ── Step 1: PREVIEW (no mutations) ─────────────────────────────────────────
SELECT
  id,
  company,
  role,
  type AS stored_type,
  parsed_jd->>'processType' AS jd_process_type,
  created_at,
  updated_at
FROM public.lmp_process_drafts
WHERE type = 'Full Time'
  AND COALESCE(parsed_jd->>'processType', '') = 'internship'
ORDER BY updated_at DESC;

SELECT COUNT(*) AS rows_to_fix
FROM public.lmp_process_drafts
WHERE type = 'Full Time'
  AND COALESCE(parsed_jd->>'processType', '') = 'internship';

-- ── Step 2: GATED UPDATE (run only after preview review) ───────────────────
-- BEGIN;
-- UPDATE public.lmp_process_drafts d
-- SET type = 'Internship',
--     updated_at = now()
-- WHERE d.id IN (
--   SELECT id
--   FROM public.lmp_process_drafts
--   WHERE type = 'Full Time'
--     AND COALESCE(parsed_jd->>'processType', '') = 'internship'
-- );
-- COMMIT;

-- ── Step 3: POST-UPDATE VERIFICATION ───────────────────────────────────────
-- SELECT id, company, role, type, parsed_jd->>'processType' AS jd_process_type
-- FROM public.lmp_process_drafts
-- WHERE COALESCE(parsed_jd->>'processType', '') = 'internship'
-- ORDER BY updated_at DESC
-- LIMIT 50;
