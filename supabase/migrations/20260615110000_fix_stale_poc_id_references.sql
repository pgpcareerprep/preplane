-- =============================================================================
-- Fix stale poc_profiles references caused by duplicate identity rows.
--
-- Background: the reconcile / roster-linking migrations created poc_profiles
-- rows with first-name-only values (e.g. name = "Sonali") before the
-- canonical row (name = "Sonali Awasthi") was linked via email. When
-- *_poc_id columns were back-filled, some rows were linked to the stale
-- UUID (the "Sonali" row) rather than the canonical UUID (the "Sonali
-- Awasthi" row). Sonali's login resolves to the canonical row via email
-- → pocProfileId = UUID_canonical, but Octave Intelligence has
-- prep_poc_id = UUID_stale → mismatch → read-only.
--
-- Symptoms:
--   • Avatar shows "S" (makePoc("Sonali") → 1 initial)
--   • Permission check: UUID_canonical ≠ UUID_stale → false → read-only
--   • RLS:  prep_poc_id = current_poc_id() → also fails
--
-- This migration:
--   1. Identifies "stale" poc_profiles rows: first-name-only name, no email
--      linked to auth, AND a canonical row exists that starts with the same
--      first name and HAS an email (linked to auth).
--   2. Re-points all lmp_processes *_poc_id columns from stale → canonical.
--   3. Normalizes the corresponding *_poc text fields to the canonical name.
--   4. Replaces the resolve_lmp_poc_ids trigger with an upgraded version that
--      (a) resolves ID from name when *_poc_id IS NULL (existing behavior), AND
--      (b) syncs the *_poc text field from the canonical poc_profiles.name when
--          *_poc_id IS ALREADY SET — so future reconcile writes that bring back
--          the first-name-only value are silently corrected on every DB write.
-- =============================================================================


-- ── 0. Preview: which rows will be migrated ───────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT stale.id AS stale_id, stale.name AS stale_name,
           canonical.id AS canonical_id, canonical.name AS canonical_name
    FROM   public.poc_profiles stale
    JOIN   public.poc_profiles canonical
           ON  lower(canonical.name) LIKE lower(stale.name) || ' %'
           AND canonical.email IS NOT NULL
           AND canonical.id <> stale.id
    WHERE  position(' ' IN stale.name) = 0
    AND    stale.email IS NULL
    -- Exactly one canonical match
    AND 1 = (
      SELECT COUNT(*) FROM public.poc_profiles c2
      WHERE  lower(c2.name) LIKE lower(stale.name) || ' %'
        AND  c2.email IS NOT NULL
        AND  c2.id <> stale.id
    )
  LOOP
    RAISE NOTICE 'Will merge: stale=% (%) → canonical=% (%)',
      r.stale_name, r.stale_id, r.canonical_name, r.canonical_id;
  END LOOP;
END $$;


-- ── 1. Re-point prep_poc_id + normalize prep_poc text ────────────────────────
WITH stale_to_canonical AS (
  SELECT
    stale.id           AS stale_id,
    canonical.id       AS canonical_id,
    canonical.name     AS canonical_name
  FROM   public.poc_profiles stale
  JOIN   public.poc_profiles canonical
         ON  lower(canonical.name) LIKE lower(stale.name) || ' %'
         AND canonical.email IS NOT NULL
         AND canonical.id <> stale.id
  WHERE  position(' ' IN stale.name) = 0
  AND    stale.email IS NULL
  AND 1 = (
    SELECT COUNT(*) FROM public.poc_profiles c2
    WHERE  lower(c2.name) LIKE lower(stale.name) || ' %'
      AND  c2.email IS NOT NULL
      AND  c2.id <> stale.id
  )
)
UPDATE public.lmp_processes lp
SET    prep_poc_id = s.canonical_id,
       prep_poc    = s.canonical_name
FROM   stale_to_canonical s
WHERE  lp.prep_poc_id = s.stale_id;

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'prep_poc_id: re-pointed % row(s) from stale → canonical UUID', n;
END $$;


-- ── 2. Re-point support_poc_id + normalize support_poc text ──────────────────
WITH stale_to_canonical AS (
  SELECT stale.id AS stale_id, canonical.id AS canonical_id, canonical.name AS canonical_name
  FROM   public.poc_profiles stale
  JOIN   public.poc_profiles canonical
         ON  lower(canonical.name) LIKE lower(stale.name) || ' %'
         AND canonical.email IS NOT NULL
         AND canonical.id <> stale.id
  WHERE  position(' ' IN stale.name) = 0
  AND    stale.email IS NULL
  AND 1 = (
    SELECT COUNT(*) FROM public.poc_profiles c2
    WHERE  lower(c2.name) LIKE lower(stale.name) || ' %'
      AND  c2.email IS NOT NULL
      AND  c2.id <> stale.id
  )
)
UPDATE public.lmp_processes lp
SET    support_poc_id = s.canonical_id,
       support_poc    = s.canonical_name
FROM   stale_to_canonical s
WHERE  lp.support_poc_id = s.stale_id;

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'support_poc_id: re-pointed % row(s) from stale → canonical UUID', n;
END $$;


-- ── 3. Re-point outreach_poc_ids (array column) ──────────────────────────────
-- Replace stale UUIDs inside the outreach_poc_ids array with canonical UUIDs.
-- We update one stale→canonical pair at a time to handle any permutation.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT stale.id AS stale_id, canonical.id AS canonical_id
    FROM   public.poc_profiles stale
    JOIN   public.poc_profiles canonical
           ON  lower(canonical.name) LIKE lower(stale.name) || ' %'
           AND canonical.email IS NOT NULL
           AND canonical.id <> stale.id
    WHERE  position(' ' IN stale.name) = 0
    AND    stale.email IS NULL
    AND 1 = (
      SELECT COUNT(*) FROM public.poc_profiles c2
      WHERE  lower(c2.name) LIKE lower(stale.name) || ' %'
        AND  c2.email IS NOT NULL
        AND  c2.id <> stale.id
    )
  LOOP
    UPDATE public.lmp_processes
    SET    outreach_poc_ids = array_replace(outreach_poc_ids, r.stale_id, r.canonical_id)
    WHERE  r.stale_id = ANY(outreach_poc_ids);
    GET DIAGNOSTICS n = n + ROW_COUNT;
  END LOOP;
  RAISE NOTICE 'outreach_poc_ids: re-pointed % row(s)', n;
END $$;


-- ── 4. Upgrade the resolve_lmp_poc_ids trigger ───────────────────────────────
-- Now adds a "sync from ID" path: when *_poc_id is already set, the trigger
-- always rewrites the *_poc text field to the canonical poc_profiles.name.
-- This ensures that even if the reconcile edge function writes a first-name-only
-- value from the Google Sheet, the DB text is immediately corrected to the
-- full canonical name on the same write — keeping initials correct (SA not S).

CREATE OR REPLACE FUNCTION public.resolve_lmp_poc_ids()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  matched_id   uuid;
  matched_name text;
BEGIN

  -- ── prep_poc ──────────────────────────────────────────────────────────────
  IF NEW.prep_poc IS NOT NULL AND NEW.prep_poc <> '' THEN
    IF NEW.prep_poc_id IS NULL THEN
      -- Resolve UUID from name (exact or first-name-only prefix)
      SELECT id, name INTO matched_id, matched_name
      FROM   public.poc_profiles
      WHERE  lower(name) = lower(NEW.prep_poc)
          OR (position(' ' IN NEW.prep_poc) = 0 AND lower(name) LIKE lower(NEW.prep_poc) || ' %')
      ORDER  BY (lower(name) = lower(NEW.prep_poc)) DESC
      LIMIT  1;
      IF matched_id IS NOT NULL THEN
        NEW.prep_poc_id := matched_id;
        NEW.prep_poc    := matched_name;
      END IF;
    ELSE
      -- UUID already set: sync text to canonical name (corrects first-name-only values)
      SELECT name INTO matched_name
      FROM   public.poc_profiles
      WHERE  id = NEW.prep_poc_id;
      IF matched_name IS NOT NULL AND matched_name <> NEW.prep_poc THEN
        NEW.prep_poc := matched_name;
      END IF;
    END IF;
  END IF;

  -- ── support_poc ───────────────────────────────────────────────────────────
  IF NEW.support_poc IS NOT NULL AND NEW.support_poc <> '' THEN
    IF NEW.support_poc_id IS NULL THEN
      SELECT id, name INTO matched_id, matched_name
      FROM   public.poc_profiles
      WHERE  lower(name) = lower(NEW.support_poc)
          OR (position(' ' IN NEW.support_poc) = 0 AND lower(name) LIKE lower(NEW.support_poc) || ' %')
      ORDER  BY (lower(name) = lower(NEW.support_poc)) DESC
      LIMIT  1;
      IF matched_id IS NOT NULL THEN
        NEW.support_poc_id := matched_id;
        NEW.support_poc    := matched_name;
      END IF;
    ELSE
      SELECT name INTO matched_name
      FROM   public.poc_profiles
      WHERE  id = NEW.support_poc_id;
      IF matched_name IS NOT NULL AND matched_name <> NEW.support_poc THEN
        NEW.support_poc := matched_name;
      END IF;
    END IF;
  END IF;

  -- ── outreach_poc ──────────────────────────────────────────────────────────
  IF NEW.outreach_poc IS NOT NULL AND NEW.outreach_poc <> '' THEN
    IF NEW.outreach_poc_ids IS NULL OR cardinality(NEW.outreach_poc_ids) = 0 THEN
      SELECT id, name INTO matched_id, matched_name
      FROM   public.poc_profiles
      WHERE  lower(name) = lower(NEW.outreach_poc)
          OR (position(' ' IN NEW.outreach_poc) = 0 AND lower(name) LIKE lower(NEW.outreach_poc) || ' %')
      ORDER  BY (lower(name) = lower(NEW.outreach_poc)) DESC
      LIMIT  1;
      IF matched_id IS NOT NULL THEN
        NEW.outreach_poc_ids := ARRAY[matched_id];
        NEW.outreach_poc     := matched_name;
      END IF;
    ELSE
      -- At least one UUID set: sync text to canonical name of the first UUID
      SELECT name INTO matched_name
      FROM   public.poc_profiles
      WHERE  id = (NEW.outreach_poc_ids)[1];
      IF matched_name IS NOT NULL AND matched_name <> NEW.outreach_poc THEN
        NEW.outreach_poc := matched_name;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create trigger (function is replaced in-place; DROP+CREATE ensures clean state)
DROP TRIGGER IF EXISTS trg_resolve_lmp_poc_ids ON public.lmp_processes;
CREATE TRIGGER trg_resolve_lmp_poc_ids
  BEFORE INSERT OR UPDATE ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.resolve_lmp_poc_ids();


-- ── 5. One-pass: normalize any remaining text/ID mismatches via trigger ───────
-- Touch every lmp_processes row where *_poc text doesn't match the canonical
-- name for the linked *_poc_id — the trigger will correct them.
UPDATE public.lmp_processes lp
SET    updated_at = lp.updated_at          -- no-op value change; triggers still fire
WHERE  (
         (prep_poc_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.poc_profiles pp
           WHERE pp.id = lp.prep_poc_id AND pp.name <> lp.prep_poc
         ))
         OR
         (support_poc_id IS NOT NULL AND EXISTS (
           SELECT 1 FROM public.poc_profiles pp
           WHERE pp.id = lp.support_poc_id AND pp.name <> lp.support_poc
         ))
       );

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Text/ID sync pass: touched % lmp_processes row(s) for canonical name correction', n;
END $$;


-- ── 6. Final diagnostics ─────────────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  -- Stale poc_profiles rows still linked in lmp_processes
  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.prep_poc_id
  WHERE  position(' ' IN pp.name) = 0 AND pp.email IS NULL;
  RAISE NOTICE 'prep_poc_id still pointing to first-name-only stale poc_profiles: %', n;

  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.support_poc_id
  WHERE  position(' ' IN pp.name) = 0 AND pp.email IS NULL;
  RAISE NOTICE 'support_poc_id still pointing to first-name-only stale poc_profiles: %', n;

  -- Text/ID mismatches remaining
  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.prep_poc_id
  WHERE  pp.name <> lp.prep_poc;
  RAISE NOTICE 'prep_poc text/ID mismatches remaining: %', n;

  SELECT COUNT(*) INTO n
  FROM   public.lmp_processes lp
  JOIN   public.poc_profiles pp ON pp.id = lp.support_poc_id
  WHERE  pp.name <> lp.support_poc;
  RAISE NOTICE 'support_poc text/ID mismatches remaining: %', n;
END $$;


NOTIFY pgrst, 'reload schema';
