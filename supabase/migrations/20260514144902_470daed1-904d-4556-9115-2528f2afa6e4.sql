-- 1. Augment poc_profiles
ALTER TABLE public.poc_profiles
  ADD COLUMN IF NOT EXISTS initials text,
  ADD COLUMN IF NOT EXISTS label text,
  ADD COLUMN IF NOT EXISTS color text DEFAULT 'bg-orange-200 text-orange-600',
  ADD COLUMN IF NOT EXISTS max_threshold integer DEFAULT 8,
  ADD COLUMN IF NOT EXISTS behavioral_pool_member boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS skill_tags text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS company_experience text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recruiter_ownership text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz DEFAULT now();

UPDATE public.poc_profiles p
SET
  initials = COALESCE(p.initials, r.initials),
  label = COALESCE(p.label, r.label),
  color = COALESCE(NULLIF(p.color,''), r.color),
  max_threshold = COALESCE(p.max_threshold, r.max_threshold, 8),
  behavioral_pool_member = COALESCE(p.behavioral_pool_member, r.behavioral_pool_member, false),
  skill_tags = COALESCE(NULLIF(p.skill_tags, '{}'), r.skill_tags, '{}'),
  company_experience = COALESCE(NULLIF(p.company_experience, '{}'), r.company_experience, '{}'),
  recruiter_ownership = COALESCE(NULLIF(p.recruiter_ownership, '{}'), r.recruiter_ownership, '{}'),
  last_assigned_at = COALESCE(p.last_assigned_at, r.last_assigned_at, now())
FROM public.poc_registry r
WHERE lower(trim(p.name)) = lower(trim(r.name));

UPDATE public.poc_profiles
SET initials = upper(COALESCE(substring(split_part(name,' ',1) for 1),'') || COALESCE(substring(split_part(name,' ',2) for 1),''))
WHERE initials IS NULL OR initials = '';
UPDATE public.poc_profiles SET label = name WHERE label IS NULL OR label = '';

-- 2. Make profiles.user_id nullable + drop FK so approved-but-not-logged-in users can have a row
ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE table_schema='public' AND table_name='profiles' AND constraint_name='profiles_user_id_fkey') THEN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_user_id_fkey;
  END IF;
END $$;

-- Unique index on email (case-insensitive) so we can claim by email
CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique ON public.profiles (lower(email)) WHERE email IS NOT NULL;

-- 3. Pre-seed profiles from approved_users for any email not already present
INSERT INTO public.profiles (user_id, display_name, email, role, access_status, is_active)
SELECT NULL, au.name, lower(au.email), au.role, au.status, (au.status='active')
FROM public.approved_users au
WHERE au.email IS NOT NULL AND au.email <> ''
  AND NOT EXISTS (SELECT 1 FROM public.profiles pf WHERE lower(pf.email) = lower(au.email));

-- 4. Update handle_new_user trigger to claim by email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_display text;
BEGIN
  SELECT id, display_name INTO v_id, v_display
  FROM public.profiles WHERE lower(email) = lower(NEW.email) LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.profiles
       SET user_id = NEW.id,
           display_name = COALESCE(NEW.raw_user_meta_data->>'full_name', v_display, NEW.email),
           email = NEW.email,
           updated_at = now()
     WHERE id = v_id;
  ELSE
    INSERT INTO public.profiles (user_id, display_name, email, role, access_status, is_active)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email, 'poc', 'approved', true);
  END IF;
  RETURN NEW;
END;
$function$;
