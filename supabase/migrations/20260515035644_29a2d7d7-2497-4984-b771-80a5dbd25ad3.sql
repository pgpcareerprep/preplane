-- Cleanup: drop unused & duplicate DB objects
-- Safe to drop (zero references / superseded by newer views)

DROP VIEW IF EXISTS public.lmp_process_full_view;
DROP VIEW IF EXISTS public.student_lmp_stats;
DROP VIEW IF EXISTS public.poc_lmp_stats;

-- Drop unused tables (0 rows, code paths now removed)
DROP TABLE IF EXISTS public.lmp_remarks;
DROP TABLE IF EXISTS public.lmp_checklists;
DROP TABLE IF EXISTS public.copilot_messages;

-- entity_registry hygiene: drop derivable rows
DELETE FROM public.entity_registry WHERE entity_type IN ('company','status');

-- Stop rebuild_entity_registry() from re-seeding company/status rows
CREATE OR REPLACE FUNCTION public.rebuild_entity_registry()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s_count int := 0; p_count int := 0; m_count int := 0;
  a_count int := 0; l_count int := 0; d_count int := 0;
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

  INSERT INTO public.entity_registry (entity_type, entity_id, display_name, source_table, source_priority)
  SELECT 'domain', d.slug, d.name, 'domains', 30 FROM public.domains d
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name, updated_at = now();
  GET DIAGNOSTICS d_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'students', s_count, 'pocs', p_count, 'mentors', m_count,
    'alumni', a_count, 'lmps', l_count, 'domains', d_count,
    'rebuilt_at', now()
  );
END;
$function$;