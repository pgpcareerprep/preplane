-- Keep access identities and the POC allocation roster linked without making
-- every application user an allocation POC.

DROP TRIGGER IF EXISTS trg_sync_profile_to_poc ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_to_poc();

CREATE OR REPLACE FUNCTION public.sync_poc_to_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  -- Removing a POC from the allocation roster must not remove login access.
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  v_email := nullif(btrim(NEW.email), '');
  IF v_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- Existing access identities retain their role, access status, and active
  -- state. Only create a POC access identity when no case-insensitive email
  -- match exists.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.email) = lower(v_email)
  ) THEN
    INSERT INTO public.profiles (
      display_name,
      email,
      role,
      access_status,
      is_active
    )
    VALUES (
      NEW.name,
      v_email,
      'poc',
      'approved',
      coalesce(NEW.status, 'active') = 'active'
    )
    ON CONFLICT (lower(email)) WHERE email IS NOT NULL AND email <> ''
    DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_poc_to_profile ON public.poc_profiles;
CREATE TRIGGER trg_sync_poc_to_profile
  AFTER INSERT OR UPDATE ON public.poc_profiles
  FOR EACH ROW
  WHEN (pg_trigger_depth() < 1)
  EXECUTE FUNCTION public.sync_poc_to_profile();

COMMENT ON FUNCTION public.sync_poc_to_profile() IS
  'Ensures a POC roster row has a case-insensitive matching access profile without overwriting existing profile authority or deleting profiles.';
