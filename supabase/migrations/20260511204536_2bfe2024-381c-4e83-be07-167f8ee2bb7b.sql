-- Phase A: Universal entity registry for Copilot resolution

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS public.entity_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('student','poc','mentor','alumni','lmp','company','jd','domain','status','cohort')),
  entity_id text NOT NULL,
  display_name text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  email text,
  phone text,
  domain text,
  source_table text NOT NULL,
  source_priority int NOT NULL DEFAULT 50,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_registry_type_name
  ON public.entity_registry (entity_type, lower(display_name));
CREATE INDEX IF NOT EXISTS idx_entity_registry_email
  ON public.entity_registry (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_entity_registry_name_trgm
  ON public.entity_registry USING gin (display_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_entity_registry_domain
  ON public.entity_registry (domain) WHERE domain IS NOT NULL;

ALTER TABLE public.entity_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read entity_registry"
  ON public.entity_registry FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages entity_registry"
  ON public.entity_registry FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER trg_entity_registry_updated_at
  BEFORE UPDATE ON public.entity_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.rebuild_entity_registry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s_count int := 0; p_count int := 0; m_count int := 0;
  a_count int := 0; l_count int := 0; c_count int := 0;
  d_count int := 0; st_count int := 0;
BEGIN
  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, email, phone, domain, source_table, source_priority, metadata)
  SELECT 'student', s.id::text, s.name,
         NULLIF(s.email,''), NULLIF(s.phone,''),
         COALESCE(s.primary_domain, s.actual_domain),
         'students', 70,
         jsonb_build_object('roll_no', s.roll_no, 'cohort', s.cohort, 'composite', s.composite_primary, 'risk_flag', s.interview_risk_flag, 'placement_status', s.placement_status)
  FROM public.students s
  WHERE s.name IS NOT NULL AND s.name <> ''
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email, phone = EXCLUDED.phone,
    domain = EXCLUDED.domain, metadata = EXCLUDED.metadata, updated_at = now();
  GET DIAGNOSTICS s_count = ROW_COUNT;

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, email, domain, source_table, source_priority, metadata)
  SELECT 'poc', p.id::text, p.name, NULLIF(p.email,''), p.primary_domain,
         'poc_profiles', 80,
         jsonb_build_object('role_type', p.role_type, 'active_load', p.active_load, 'domain_tags', p.domain_tags, 'conversion_rate', p.conversion_rate)
  FROM public.poc_profiles p
  WHERE p.name IS NOT NULL AND p.name <> ''
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email, domain = EXCLUDED.domain,
    metadata = EXCLUDED.metadata, updated_at = now();
  GET DIAGNOSTICS p_count = ROW_COUNT;

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, email, phone, domain, source_table, source_priority, metadata)
  SELECT 'mentor', m.id::text, m.name, NULLIF(m.email,''), NULLIF(m.phone,''),
         COALESCE(m.functional_domain, m.industry),
         'mentors', 60,
         jsonb_build_object('source', m.source, 'company', m.company, 'role', m.role, 'availability', m.availability, 'rating', m.rating)
  FROM public.mentors m
  WHERE m.name IS NOT NULL AND m.name <> ''
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email, phone = EXCLUDED.phone,
    domain = EXCLUDED.domain, metadata = EXCLUDED.metadata, updated_at = now();
  GET DIAGNOSTICS m_count = ROW_COUNT;

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, email, domain, source_table, source_priority, metadata)
  SELECT 'alumni', a.id::text, a.student_name, NULLIF(a.mu_email_id,''),
         COALESCE(a.domain_1, a.domain_2),
         'alumni_records', 50,
         jsonb_build_object('cohort', a.cohort, 'company', a.current_company, 'role', a.current_role_title, 'industry', a.industry)
  FROM public.alumni_records a
  WHERE a.student_name IS NOT NULL AND a.student_name <> ''
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, email = EXCLUDED.email, domain = EXCLUDED.domain,
    metadata = EXCLUDED.metadata, updated_at = now();
  GET DIAGNOSTICS a_count = ROW_COUNT;

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, domain, source_table, source_priority, metadata)
  SELECT 'lmp', l.id::text,
         (l.company || ' - ' || l.role),
         l.domain_raw,
         'lmp_processes', 90,
         jsonb_build_object('company', l.company, 'role', l.role, 'status', l.status, 'type', l.type, 'prep_poc', l.prep_poc, 'support_poc', l.support_poc, 'outreach_poc', l.outreach_poc)
  FROM public.lmp_processes l
  WHERE l.company IS NOT NULL AND l.role IS NOT NULL
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, domain = EXCLUDED.domain,
    metadata = EXCLUDED.metadata, updated_at = now();
  GET DIAGNOSTICS l_count = ROW_COUNT;

  -- Companies: dedupe by lowercased key (avoids ON CONFLICT collisions for casing variants)
  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, source_table, source_priority, metadata)
  SELECT 'company', lower(company_norm), company_norm, 'lmp_processes', 40,
         jsonb_build_object('process_count', cnt)
  FROM (
    SELECT min(company) AS company_norm, count(*) AS cnt
    FROM public.lmp_processes
    WHERE company IS NOT NULL AND company <> ''
    GROUP BY lower(company)
  ) g
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, metadata = EXCLUDED.metadata, updated_at = now();
  GET DIAGNOSTICS c_count = ROW_COUNT;

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, source_table, source_priority)
  SELECT 'domain', d.slug, d.name, 'domains', 30 FROM public.domains d
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, updated_at = now();
  GET DIAGNOSTICS d_count = ROW_COUNT;

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, source_table, source_priority)
  VALUES
    ('status','ongoing','Ongoing','static',20),
    ('status','dormant','Dormant','static',20),
    ('status','on_hold','On Hold','static',20),
    ('status','converted','Converted','static',20),
    ('status','not_converted','Not Converted','static',20),
    ('status','offer_received','Offer Received','static',20),
    ('status','closed','Closed','static',20)
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, updated_at = now();
  GET DIAGNOSTICS st_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'students', s_count, 'pocs', p_count, 'mentors', m_count,
    'alumni', a_count, 'lmps', l_count, 'companies', c_count,
    'domains', d_count, 'statuses', st_count, 'rebuilt_at', now()
  );
END;
$$;

SELECT public.rebuild_entity_registry();