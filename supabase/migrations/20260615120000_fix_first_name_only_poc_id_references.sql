-- =============================================================================
-- Fix lmp_processes rows where *_poc_id points to a first-name-only
-- poc_profiles row when a full-name (canonical) poc_profiles row exists.
--
-- Previous migration (20260615110000) required canonical.email IS NOT NULL to
-- identify the canonical row — but that condition fails when Sonali's email
-- was never backfilled into poc_profiles (approved_user_id was null).
--
-- This migration uses a purely structural approach:
--   "stale" = poc_profiles row with a single-word name (no space)
--   "canonical" = poc_profiles row whose name STARTS WITH the stale name + space
--
-- When prep_poc_id points to a stale row AND exactly one canonical row exists,
-- we re-point to the canonical UUID and normalize the text field.
-- No email condition — works regardless of whether email was backfilled.
-- =============================================================================


-- ── Preview ───────────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    WITH needs_fix AS (
      SELECT
        lp.lmp_code,
        stale.name  AS stale_name,
        stale.id    AS stale_id,
        canonical.name AS canonical_name,
        canonical.id   AS canonical_id,
        'prep' AS field
      FROM public.lmp_processes lp
      JOIN public.poc_profiles stale     ON stale.id = lp.prep_poc_id
      JOIN public.poc_profiles canonical
           ON lower(canonical.name) LIKE lower(stale.name) || ' %'
          AND canonical.id <> stale.id
      WHERE position(' ' IN stale.name) = 0
      AND 1 = (
        SELECT COUNT(*) FROM public.poc_profiles c2
        WHERE lower(c2.name) LIKE lower(stale.name) || ' %'
          AND c2.id <> stale.id
      )
      UNION ALL
      SELECT
        lp.lmp_code,
        stale.name, stale.id,
        canonical.name, canonical.id,
        'support'
      FROM public.lmp_processes lp
      JOIN public.poc_profiles stale     ON stale.id = lp.support_poc_id
      JOIN public.poc_profiles canonical
           ON lower(canonical.name) LIKE lower(stale.name) || ' %'
          AND canonical.id <> stale.id
      WHERE position(' ' IN stale.name) = 0
      AND 1 = (
        SELECT COUNT(*) FROM public.poc_profiles c2
        WHERE lower(c2.name) LIKE lower(stale.name) || ' %'
          AND c2.id <> stale.id
      )
    )
    SELECT * FROM needs_fix
  LOOP
    RAISE NOTICE '[%] %_poc_id: % (%) → % (%)',
      r.lmp_code, r.field, r.stale_name, r.stale_id, r.canonical_name, r.canonical_id;
  END LOOP;
END $$;


-- ── 1. Fix prep_poc_id references ─────────────────────────────────────────────
UPDATE public.lmp_processes lp
SET    prep_poc_id = canonical.id,
       prep_poc    = canonical.name
FROM   public.poc_profiles stale
JOIN   public.poc_profiles canonical
       ON lower(canonical.name) LIKE lower(stale.name) || ' %'
      AND canonical.id <> stale.id
WHERE  lp.prep_poc_id = stale.id
  AND  position(' ' IN stale.name) = 0
  AND  1 = (
    SELECT COUNT(*) FROM public.poc_profiles c2
    WHERE lower(c2.name) LIKE lower(stale.name) || ' %'
      AND c2.id <> stale.id
  );

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'prep_poc_id: re-pointed % row(s) to canonical full-name UUID', n;
END $$;


-- ── 2. Fix support_poc_id references ──────────────────────────────────────────
UPDATE public.lmp_processes lp
SET    support_poc_id = canonical.id,
       support_poc    = canonical.name
FROM   public.poc_profiles stale
JOIN   public.poc_profiles canonical
       ON lower(canonical.name) LIKE lower(stale.name) || ' %'
      AND canonical.id <> stale.id
WHERE  lp.support_poc_id = stale.id
  AND  position(' ' IN stale.name) = 0
  AND  1 = (
    SELECT COUNT(*) FROM public.poc_profiles c2
    WHERE lower(c2.name) LIKE lower(stale.name) || ' %'
      AND c2.id <> stale.id
  );

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'support_poc_id: re-pointed % row(s) to canonical full-name UUID', n;
END $$;


-- ── 3. Fix outreach_poc_ids references (array) ────────────────────────────────
DO $$
DECLARE
  stale_row   record;
  cnt         int;
  total       int := 0;
BEGIN
  FOR stale_row IN
    SELECT stale.id AS stale_id, canonical.id AS canonical_id
    FROM   public.poc_profiles stale
    JOIN   public.poc_profiles canonical
           ON lower(canonical.name) LIKE lower(stale.name) || ' %'
          AND canonical.id <> stale.id
    WHERE  position(' ' IN stale.name) = 0
    AND 1 = (
      SELECT COUNT(*) FROM public.poc_profiles c2
      WHERE lower(c2.name) LIKE lower(stale.name) || ' %'
        AND c2.id <> stale.id
    )
  LOOP
    UPDATE public.lmp_processes
    SET    outreach_poc_ids = array_replace(outreach_poc_ids, stale_row.stale_id, stale_row.canonical_id)
    WHERE  stale_row.stale_id = ANY(outreach_poc_ids);
    GET DIAGNOSTICS cnt = ROW_COUNT;
    total := total + cnt;
  END LOOP;
  RAISE NOTICE 'outreach_poc_ids: re-pointed % row(s) to canonical full-name UUID', total;
END $$;


-- ── 4. Normalize prep_poc / support_poc text that is still first-name-only ────
-- (for rows where *_poc_id now correctly points to the canonical row but the
--  text field wasn't touched in steps 1–2 because they were already canonical)
UPDATE public.lmp_processes lp
SET    prep_poc = pp.name
FROM   public.poc_profiles pp
WHERE  lp.prep_poc_id = pp.id
  AND  lower(pp.name) <> lower(lp.prep_poc);

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'prep_poc text: normalized % row(s) to canonical name', n;
END $$;

UPDATE public.lmp_processes lp
SET    support_poc = pp.name
FROM   public.poc_profiles pp
WHERE  lp.support_poc_id = pp.id
  AND  lower(pp.name) <> lower(lp.support_poc);

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'support_poc text: normalized % row(s) to canonical name', n;
END $$;


-- ── 5. Final check ────────────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.prep_poc_id
  WHERE  position(' ' IN pp.name) = 0;
  RAISE NOTICE 'prep_poc_id still pointing to single-word poc_profiles name: %', n;

  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.support_poc_id
  WHERE  position(' ' IN pp.name) = 0;
  RAISE NOTICE 'support_poc_id still pointing to single-word poc_profiles name: %', n;

  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.prep_poc_id
  WHERE  lower(pp.name) <> lower(lp.prep_poc);
  RAISE NOTICE 'prep_poc text/ID mismatches remaining: %', n;
END $$;


NOTIFY pgrst, 'reload schema';
