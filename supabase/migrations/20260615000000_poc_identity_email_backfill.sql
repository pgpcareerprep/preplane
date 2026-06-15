-- =============================================================================
-- POC Identity: backfill poc_profiles.email from linked profiles rows.
--
-- poc_profiles.approved_user_id → profiles.id is the canonical FK.
-- When that link exists, use profiles.email as the poc_profiles.email so
-- that email-based identity resolution in rolesContext.tsx always finds a
-- match without falling back to fragile first-name matching.
--
-- Also adds a partial unique index on poc_profiles.email (non-null values)
-- so each auth user maps to exactly one poc_profiles row.
-- =============================================================================


-- ── 1. Backfill email from profiles where approved_user_id is set ─────────────

UPDATE public.poc_profiles pp
SET email = pr.email
FROM public.profiles pr
WHERE pp.approved_user_id = pr.id
  AND pp.email IS NULL
  AND pr.email IS NOT NULL;

DO $$
DECLARE n int;
BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Backfilled email for % poc_profiles row(s) from profiles via approved_user_id', n;
END $$;


-- ── 2. Backfill approved_user_id from profiles where email matches ─────────────
-- Covers cases where the FK wasn't set but emails already match.

UPDATE public.poc_profiles pp
SET approved_user_id = pr.id
FROM public.profiles pr
WHERE pp.email = pr.email
  AND pp.approved_user_id IS NULL
  AND pr.id IS NOT NULL;

DO $$
DECLARE n int;
BEGIN
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Backfilled approved_user_id for % poc_profiles row(s) from profiles via email match', n;
END $$;


-- ── 3. Add partial unique index on email (non-null) ───────────────────────────
-- Prevents two poc_profiles rows from sharing an email (which would cause
-- .maybeSingle() to throw on identity lookup).

CREATE UNIQUE INDEX IF NOT EXISTS poc_profiles_email_unique
  ON public.poc_profiles (email)
  WHERE email IS NOT NULL;


-- ── 4. Notify PostgREST ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
