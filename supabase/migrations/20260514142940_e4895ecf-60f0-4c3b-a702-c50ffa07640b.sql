
-- ============ Phase 1.1: profiles ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS access_status text DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS permissions jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

-- Backfill role from user_roles
UPDATE public.profiles p
SET role = ur.role::text
FROM public.user_roles ur
WHERE ur.user_id = p.user_id AND p.role IS NULL;

-- Backfill role + access_status from approved_users by email
UPDATE public.profiles p
SET role = COALESCE(p.role, au.role),
    access_status = COALESCE(p.access_status, au.status),
    last_login_at = COALESCE(p.last_login_at, au.last_login_at)
FROM public.approved_users au
WHERE lower(au.email) = lower(p.email);

-- Default role for any profile still missing one
UPDATE public.profiles SET role = 'poc' WHERE role IS NULL;

-- Make has_role() recognise the merged column too (keeps signature/RLS intact)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  ) OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id AND role = _role::text
  )
$$;

-- ============ Phase 1.2: poc_profiles.aliases ============
ALTER TABLE public.poc_profiles
  ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}'::text[];

UPDATE public.poc_profiles p
SET aliases = sub.al
FROM (
  SELECT poc_id, array_agg(DISTINCT alias_norm) AS al
  FROM public.poc_aliases
  GROUP BY poc_id
) sub
WHERE sub.poc_id = p.id;

-- Ensure each POC has its own name + first name in aliases
UPDATE public.poc_profiles
SET aliases = (
  SELECT array_agg(DISTINCT a) FROM unnest(
    aliases || ARRAY[lower(trim(name)), lower(split_part(trim(name),' ',1))]
  ) a WHERE a IS NOT NULL AND a <> ''
);

CREATE INDEX IF NOT EXISTS idx_poc_profiles_aliases ON public.poc_profiles USING GIN (aliases);

-- ============ Phase 2.1: domains.aliases ============
ALTER TABLE public.domains
  ADD COLUMN IF NOT EXISTS aliases text[] DEFAULT '{}'::text[];

UPDATE public.domains d
SET aliases = sub.al
FROM (
  SELECT canonical_domain_id, array_agg(DISTINCT lower(alias)) AS al
  FROM public.domain_aliases
  GROUP BY canonical_domain_id
) sub
WHERE sub.canonical_domain_id = d.id;

CREATE INDEX IF NOT EXISTS idx_domains_aliases ON public.domains USING GIN (aliases);

-- ============ Phase 4: snapshot columns + history ============
ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS prep_poc_id uuid,
  ADD COLUMN IF NOT EXISTS support_poc_id uuid,
  ADD COLUMN IF NOT EXISTS outreach_poc_ids uuid[] DEFAULT '{}'::uuid[];

ALTER TABLE public.lmp_poc_links
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS removed_at timestamptz,
  ADD COLUMN IF NOT EXISTS assignment_source text DEFAULT 'sheet',
  ADD COLUMN IF NOT EXISTS raw_sheet_value text;

CREATE INDEX IF NOT EXISTS idx_lmp_poc_links_active
  ON public.lmp_poc_links (lmp_id, role) WHERE is_active = true;

-- New resolver: reads aliases from poc_profiles, maintains history + snapshot
CREATE OR REPLACE FUNCTION public.resolve_lmp_poc_links(_lmp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_prep uuid;
  v_support uuid;
  v_outreach uuid[];
BEGIN
  SELECT prep_poc, support_poc, outreach_poc INTO r
  FROM public.lmp_processes WHERE id = _lmp_id;

  -- Soft-close all currently active links for this LMP
  UPDATE public.lmp_poc_links
    SET is_active = false, removed_at = now()
    WHERE lmp_id = _lmp_id AND is_active = true;

  -- Helper inline: resolve text → poc_id via poc_profiles.aliases (fall back to poc_aliases for soak)
  IF r.prep_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
    SELECT _lmp_id, p.id, 'prep', true, now(), 'sheet', r.prep_poc
    FROM regexp_split_to_table(r.prep_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_profiles p
      ON lower(trim(raw)) = ANY(p.aliases)
      OR lower(trim(p.name)) = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  IF r.support_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
    SELECT _lmp_id, p.id, 'support', true, now(), 'sheet', r.support_poc
    FROM regexp_split_to_table(r.support_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_profiles p
      ON lower(trim(raw)) = ANY(p.aliases)
      OR lower(trim(p.name)) = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  IF r.outreach_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
    SELECT _lmp_id, p.id, 'outreach', true, now(), 'sheet', r.outreach_poc
    FROM regexp_split_to_table(r.outreach_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_profiles p
      ON lower(trim(raw)) = ANY(p.aliases)
      OR lower(trim(p.name)) = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT DO NOTHING;
  END IF;

  -- Snapshot back into lmp_processes
  SELECT poc_id INTO v_prep
    FROM public.lmp_poc_links
    WHERE lmp_id = _lmp_id AND role = 'prep' AND is_active = true
    ORDER BY assigned_at LIMIT 1;
  SELECT poc_id INTO v_support
    FROM public.lmp_poc_links
    WHERE lmp_id = _lmp_id AND role = 'support' AND is_active = true
    ORDER BY assigned_at LIMIT 1;
  SELECT array_agg(poc_id) INTO v_outreach
    FROM public.lmp_poc_links
    WHERE lmp_id = _lmp_id AND role = 'outreach' AND is_active = true;

  UPDATE public.lmp_processes
    SET prep_poc_id = v_prep,
        support_poc_id = v_support,
        outreach_poc_ids = COALESCE(v_outreach, '{}'::uuid[])
    WHERE id = _lmp_id;
END;
$$;

-- Re-resolve everything once with new logic (history kicks in from now on)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.lmp_processes LOOP
    PERFORM public.resolve_lmp_poc_links(r.id);
  END LOOP;
END $$;

-- ============ Phase 5: full view ============
CREATE OR REPLACE VIEW public.lmp_process_full_view AS
SELECT
  l.*,
  pp.name  AS prep_poc_name,
  ps.name  AS support_poc_name,
  (SELECT array_agg(p.name)
     FROM public.poc_profiles p
     WHERE p.id = ANY(l.outreach_poc_ids)) AS outreach_poc_names,
  (SELECT jsonb_agg(jsonb_build_object(
            'id', c.id, 'student_name', c.student_name,
            'pipeline_stage', c.pipeline_stage, 'offer_status', c.offer_status))
     FROM public.lmp_candidates c WHERE c.lmp_id = l.id) AS candidates,
  (SELECT jsonb_agg(jsonb_build_object(
            'id', m.id, 'mentor_id', m.mentor_id, 'status', m.status))
     FROM public.lmp_mentors m WHERE m.lmp_id = l.id) AS mentors,
  (SELECT jsonb_build_object(
            'text', d.text, 'author_name', d.author_name,
            'created_at', d.created_at, 'entry_type', d.entry_type)
     FROM public.lmp_daily_logs d
     WHERE d.lmp_id = l.id
     ORDER BY d.created_at DESC LIMIT 1) AS latest_log
FROM public.lmp_processes l
LEFT JOIN public.poc_profiles pp ON pp.id = l.prep_poc_id
LEFT JOIN public.poc_profiles ps ON ps.id = l.support_poc_id;

-- ============ Phase 2.2: drop empty/dead tables ============
DROP TABLE IF EXISTS public.lmp_students CASCADE;
DROP TABLE IF EXISTS public.sheets_sync_log CASCADE;
