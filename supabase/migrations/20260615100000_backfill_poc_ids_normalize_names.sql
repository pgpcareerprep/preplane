-- =============================================================================
-- Backfill *_poc_id UUIDs and normalize first-name-only POC text values.
--
-- Root cause: lmp_processes rows with prep_poc = "Sonali" (first name only)
-- instead of "Sonali Awasthi" cause:
--   a) initials computed as "S" instead of "SA" in the UI
--   b) exact-match name checks in permissions.ts to fail → record is read-only
--   c) prep_poc_id = NULL → RLS `prep_poc_id = current_poc_id()` blocks writes
--
-- This migration:
--   1. Normalizes first-name-only text fields to the canonical poc_profiles.name
--   2. Backfills *_poc_id for every lmp_processes row that has a text-field match
--   3. Installs a BEFORE INSERT OR UPDATE trigger so future reconcile writes
--      (which may come from the Google Sheet with first-name-only values) are
--      auto-resolved — making the fix durable without touching the edge function.
-- =============================================================================


-- ── 1. Normalize first-name-only prep_poc → full name ─────────────────────────
-- Only touches rows where the stored value has no space (single word = first-
-- name-only) and exactly one poc_profiles row starts with that word.
UPDATE public.lmp_processes lp
SET    prep_poc = pp.name
FROM   public.poc_profiles pp
WHERE  lp.prep_poc IS NOT NULL
  AND  lp.prep_poc <> ''
  AND  position(' ' IN lp.prep_poc) = 0
  AND  lower(pp.name) LIKE lower(lp.prep_poc) || ' %'
  AND  lp.prep_poc_id IS NULL;

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'prep_poc: normalized % first-name-only value(s) to full name', n;
END $$;


-- ── 2. Backfill prep_poc_id (exact match after step 1 normalization) ───────────
UPDATE public.lmp_processes lp
SET    prep_poc_id = pp.id
FROM   public.poc_profiles pp
WHERE  lp.prep_poc_id IS NULL
  AND  lp.prep_poc IS NOT NULL
  AND  lp.prep_poc <> ''
  AND  lower(pp.name) = lower(lp.prep_poc);

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'prep_poc_id: backfilled % row(s)', n;
END $$;


-- ── 3. Normalize first-name-only support_poc → full name ──────────────────────
UPDATE public.lmp_processes lp
SET    support_poc = pp.name
FROM   public.poc_profiles pp
WHERE  lp.support_poc IS NOT NULL
  AND  lp.support_poc <> ''
  AND  position(' ' IN lp.support_poc) = 0
  AND  lower(pp.name) LIKE lower(lp.support_poc) || ' %'
  AND  lp.support_poc_id IS NULL;

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'support_poc: normalized % first-name-only value(s) to full name', n;
END $$;


-- ── 4. Backfill support_poc_id ────────────────────────────────────────────────
UPDATE public.lmp_processes lp
SET    support_poc_id = pp.id
FROM   public.poc_profiles pp
WHERE  lp.support_poc_id IS NULL
  AND  lp.support_poc IS NOT NULL
  AND  lp.support_poc <> ''
  AND  lower(pp.name) = lower(lp.support_poc);

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'support_poc_id: backfilled % row(s)', n;
END $$;


-- ── 5. Normalize first-name-only outreach_poc → full name ─────────────────────
UPDATE public.lmp_processes lp
SET    outreach_poc = pp.name
FROM   public.poc_profiles pp
WHERE  lp.outreach_poc IS NOT NULL
  AND  lp.outreach_poc <> ''
  AND  position(' ' IN lp.outreach_poc) = 0
  AND  lower(pp.name) LIKE lower(lp.outreach_poc) || ' %'
  AND  (lp.outreach_poc_ids IS NULL OR cardinality(lp.outreach_poc_ids) = 0);

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'outreach_poc: normalized % first-name-only value(s) to full name', n;
END $$;


-- ── 6. Backfill outreach_poc_ids ──────────────────────────────────────────────
-- outreach_poc_ids is uuid[] — cast pp.id directly (no ::text needed).
UPDATE public.lmp_processes lp
SET    outreach_poc_ids = ARRAY[pp.id]
FROM   public.poc_profiles pp
WHERE  (lp.outreach_poc_ids IS NULL OR cardinality(lp.outreach_poc_ids) = 0)
  AND  lp.outreach_poc IS NOT NULL
  AND  lp.outreach_poc <> ''
  AND  lower(pp.name) = lower(lp.outreach_poc);

DO $$ DECLARE n int; BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'outreach_poc_ids: backfilled % row(s)', n;
END $$;


-- ── 7. Durable trigger: auto-resolve future writes ────────────────────────────
-- When the reconcile edge function writes a first-name-only value from the
-- Google Sheet, this trigger intercepts the write, resolves the canonical
-- poc_profiles.name, and fills *_poc_id — so the DB is always consistent even
-- between full reconcile runs. Exact match is preferred over prefix match.
--
-- Safety: the trigger only fires when *_poc_id IS NULL, so already-linked rows
-- are not touched. Admin/allocator writes that supply the ID directly are also
-- unaffected. The field-protection trigger (guard_lmp_poc_fields) that blocks
-- POC users from changing ownership fields is not circumvented here because:
--   a) POC users cannot write prep_poc / support_poc / outreach_poc (management fields)
--   b) The reconcile runs as service role → guard_lmp_poc_fields skips (is_poc_user() = false)

CREATE OR REPLACE FUNCTION public.resolve_lmp_poc_ids()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  matched_id   uuid;
  matched_name text;
BEGIN
  -- prep_poc → prep_poc_id + normalize name
  IF NEW.prep_poc IS NOT NULL AND NEW.prep_poc <> '' AND NEW.prep_poc_id IS NULL THEN
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
  END IF;

  -- support_poc → support_poc_id + normalize name
  IF NEW.support_poc IS NOT NULL AND NEW.support_poc <> '' AND NEW.support_poc_id IS NULL THEN
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
  END IF;

  -- outreach_poc → outreach_poc_ids + normalize name
  IF NEW.outreach_poc IS NOT NULL AND NEW.outreach_poc <> ''
    AND (NEW.outreach_poc_ids IS NULL OR cardinality(NEW.outreach_poc_ids) = 0)
  THEN
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
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resolve_lmp_poc_ids ON public.lmp_processes;
CREATE TRIGGER trg_resolve_lmp_poc_ids
  BEFORE INSERT OR UPDATE ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.resolve_lmp_poc_ids();


-- ── 8. Post-migration diagnostics ─────────────────────────────────────────────
DO $$
DECLARE n int;
BEGIN
  SELECT COUNT(*) INTO n FROM public.lmp_processes
  WHERE prep_poc_id IS NULL AND prep_poc IS NOT NULL AND prep_poc <> '';
  RAISE NOTICE 'After backfill — prep_poc rows still missing prep_poc_id: %', n;

  SELECT COUNT(*) INTO n FROM public.lmp_processes
  WHERE support_poc_id IS NULL AND support_poc IS NOT NULL AND support_poc <> '';
  RAISE NOTICE 'After backfill — support_poc rows still missing support_poc_id: %', n;

  SELECT COUNT(*) INTO n FROM public.lmp_processes
  WHERE (outreach_poc_ids IS NULL OR cardinality(outreach_poc_ids) = 0)
    AND outreach_poc IS NOT NULL AND outreach_poc <> '';
  RAISE NOTICE 'After backfill — outreach_poc rows still missing outreach_poc_ids: %', n;
END $$;


NOTIFY pgrst, 'reload schema';
