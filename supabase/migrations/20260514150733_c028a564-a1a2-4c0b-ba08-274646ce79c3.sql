
-- Phase 6 final: drop legacy tables and clean up has_role()

-- 1. Update has_role() to use profiles only
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = _role::text
  )
$$;

-- 2. Drop alias-maintenance helpers (poc_aliases / domain_aliases going away)
DROP FUNCTION IF EXISTS public.sync_poc_aliases() CASCADE;
DROP FUNCTION IF EXISTS public.trg_alias_backfill() CASCADE;

-- 3. Drop legacy tables (CASCADE removes any leftover policies/FKs)
DROP TABLE IF EXISTS public.poc_lmp_assignments CASCADE;
DROP TABLE IF EXISTS public.poc_aliases CASCADE;
DROP TABLE IF EXISTS public.domain_aliases CASCADE;
DROP TABLE IF EXISTS public.poc_registry CASCADE;
DROP TABLE IF EXISTS public.user_roles CASCADE;
DROP TABLE IF EXISTS public.approved_users CASCADE;
