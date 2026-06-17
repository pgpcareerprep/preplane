-- Build a safe, database-level bidirectional link between
-- public.poc_profiles and public.profiles.
--
-- After this migration:
--   • poc_profiles.profile_id reliably points to the matching profiles row
--   • Changing poc_profiles.access_level → profiles.role updates instantly
--   • Changing profiles.role → poc_profiles.access_level updates instantly
--   • Both triggers guard against recursive calls via pg_trigger_depth()
--
-- Constraints respected:
--   • Additive only (no columns removed, no tables dropped)
--   • RLS is NOT disabled
--   • No production data deleted
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Add profile_id column ────────────────────────────────────────────────
ALTER TABLE public.poc_profiles
  ADD COLUMN IF NOT EXISTS profile_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_poc_profiles_profile_id
  ON public.poc_profiles(profile_id);

-- ── 2. Backfill profile_id via exact email match ────────────────────────────
-- Use email match as the canonical backfill path (email already backfilled by
-- 20260615000000_poc_identity_email_backfill.sql)
UPDATE public.poc_profiles pp
SET    profile_id = pr.id
FROM   public.profiles pr
WHERE  pp.profile_id IS NULL
  AND  pp.email IS NOT NULL
  AND  trim(pp.email) <> ''
  AND  lower(trim(pp.email)) = lower(trim(pr.email));

-- ── 3. Forward trigger: poc_profiles → profiles ──────────────────────────────
-- Runs BEFORE INSERT OR UPDATE so we can set NEW.profile_id on the row.
-- On access_level change (or INSERT) also syncs profiles.role.

DROP TRIGGER IF EXISTS trg_sync_poc_to_profile ON public.poc_profiles;
DROP FUNCTION IF EXISTS public.sync_poc_to_profile();

CREATE OR REPLACE FUNCTION public.sync_poc_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email      text;
  v_profile_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- Resolve a stable email to look up the profile
  v_email := nullif(btrim(NEW.email), '');

  -- Start with the FK already on the row (fastest path)
  v_profile_id := NEW.profile_id;

  -- If not set, look up by email
  IF v_profile_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_profile_id
    FROM   public.profiles
    WHERE  lower(trim(email)) = lower(v_email)
    LIMIT  1;
  END IF;

  IF v_profile_id IS NOT NULL THEN
    -- Bind the FK on the row being written
    NEW.profile_id := v_profile_id;

    -- Sync role when access_level is new or has changed
    IF TG_OP = 'INSERT'
      OR NEW.access_level IS DISTINCT FROM OLD.access_level
    THEN
      UPDATE public.profiles
      SET    role = NEW.access_level
      WHERE  id   = v_profile_id
        AND  role IS DISTINCT FROM NEW.access_level;
    END IF;

  ELSIF v_email IS NOT NULL THEN
    -- No profile exists yet — create one (same as old behaviour, now
    -- also sets correct role from access_level)
    INSERT INTO public.profiles (display_name, email, role, access_status, is_active)
    VALUES (
      NEW.name,
      v_email,
      COALESCE(NEW.access_level, 'poc'),
      'approved',
      COALESCE(NEW.status, 'active') = 'active'
    )
    ON CONFLICT (lower(email)) WHERE email IS NOT NULL AND email <> ''
    DO NOTHING
    RETURNING id INTO v_profile_id;

    -- ON CONFLICT fired (row already existed but email lookup above missed it) —
    -- fetch the id so we can still set the FK
    IF v_profile_id IS NULL THEN
      SELECT id INTO v_profile_id
      FROM   public.profiles
      WHERE  lower(trim(email)) = lower(v_email)
      LIMIT  1;
    END IF;

    IF v_profile_id IS NOT NULL THEN
      NEW.profile_id := v_profile_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_poc_to_profile
  BEFORE INSERT OR UPDATE ON public.poc_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 1)
  EXECUTE FUNCTION public.sync_poc_to_profile();

COMMENT ON FUNCTION public.sync_poc_to_profile() IS
  'Keeps profiles.role in sync with poc_profiles.access_level and ensures profile_id FK is always populated.';

-- ── 4. Reverse trigger: profiles → poc_profiles ─────────────────────────────
-- Fires AFTER UPDATE OF role so we only pay the cost when role changes.

DROP TRIGGER IF EXISTS trg_sync_profile_role_to_poc ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_role_to_poc();

CREATE OR REPLACE FUNCTION public.sync_profile_role_to_poc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when role actually changed
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Primary path: reliable FK link
  UPDATE public.poc_profiles
  SET    access_level = NEW.role
  WHERE  profile_id   = NEW.id
    AND  access_level IS DISTINCT FROM NEW.role;

  -- Fallback: email match for rows whose profile_id is not yet populated
  IF NEW.email IS NOT NULL AND trim(NEW.email) <> '' THEN
    UPDATE public.poc_profiles
    SET    access_level = NEW.role
    WHERE  profile_id   IS NULL
      AND  email        IS NOT NULL
      AND  lower(trim(email)) = lower(trim(NEW.email))
      AND  access_level IS DISTINCT FROM NEW.role;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_profile_role_to_poc
  AFTER UPDATE OF role ON public.profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 1)
  EXECUTE FUNCTION public.sync_profile_role_to_poc();

COMMENT ON FUNCTION public.sync_profile_role_to_poc() IS
  'Keeps poc_profiles.access_level in sync whenever profiles.role is changed from User Management.';

-- ── 5. Atomic RPC for frontend mutations ─────────────────────────────────────
-- Wraps an INSERT or UPDATE of poc_profiles inside SECURITY DEFINER so the
-- triggered profile sync always succeeds regardless of caller RLS.
-- Returns the updated poc_profiles row.

DROP FUNCTION IF EXISTS public.upsert_poc_with_profile_sync(
  uuid, text, text, text, text, text, text[], int, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.upsert_poc_with_profile_sync(
  p_id             uuid    DEFAULT NULL,
  p_name           text    DEFAULT NULL,
  p_email          text    DEFAULT NULL,
  p_role_type      text    DEFAULT 'prep_poc',
  p_status         text    DEFAULT 'active',
  p_primary_domain text    DEFAULT NULL,
  p_domain_tags    text[]  DEFAULT '{}',
  p_max_threshold  int     DEFAULT 8,
  p_access_level   text    DEFAULT 'poc',
  p_initials       text    DEFAULT NULL,
  p_label          text    DEFAULT NULL,
  p_color          text    DEFAULT NULL
)
RETURNS SETOF public.poc_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_id IS NOT NULL THEN
    RETURN QUERY
    UPDATE public.poc_profiles SET
      name           = p_name,
      email          = p_email,
      role_type      = p_role_type,
      status         = p_status,
      primary_domain = p_primary_domain,
      domain_tags    = COALESCE(p_domain_tags, '{}'),
      max_threshold  = COALESCE(p_max_threshold, 8),
      access_level   = COALESCE(p_access_level, 'poc'),
      initials       = COALESCE(p_initials, initials),
      label          = COALESCE(p_label, label),
      color          = COALESCE(p_color, color)
    WHERE id = p_id
    RETURNING *;
  ELSE
    RETURN QUERY
    INSERT INTO public.poc_profiles (
      name, email, role_type, status, primary_domain, domain_tags,
      max_threshold, access_level, initials, label, color
    )
    VALUES (
      p_name, p_email, p_role_type, p_status, p_primary_domain,
      COALESCE(p_domain_tags, '{}'), COALESCE(p_max_threshold, 8),
      COALESCE(p_access_level, 'poc'), COALESCE(p_initials, ''),
      COALESCE(p_label, ''), COALESCE(p_color, '')
    )
    RETURNING *;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_poc_with_profile_sync(
  uuid, text, text, text, text, text, text[], int, text, text, text, text
) TO authenticated;

-- ── 6. Add both tables to Supabase Realtime publication ─────────────────────
-- Safe to run repeatedly (DO NOTHING on conflict)
DO $$
BEGIN
  -- profiles
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;

  -- poc_profiles (may already be in publication)
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'poc_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.poc_profiles;
  END IF;
END $$;

-- ── 7. Mismatch repair: set profiles.role from poc_profiles.access_level ──────
-- Run once to fix any existing rows where the two values diverged.
-- Uses poc_profiles as source of truth (per spec).
UPDATE public.profiles pr
SET    role = pp.access_level
FROM   public.poc_profiles pp
WHERE  pp.profile_id = pr.id
  AND  pr.role IS DISTINCT FROM pp.access_level;

-- Fallback via email for rows without profile_id yet
UPDATE public.profiles pr
SET    role = pp.access_level
FROM   public.poc_profiles pp
WHERE  pp.profile_id IS NULL
  AND  pp.email IS NOT NULL
  AND  lower(trim(pp.email)) = lower(trim(pr.email))
  AND  pr.role IS DISTINCT FROM pp.access_level;
