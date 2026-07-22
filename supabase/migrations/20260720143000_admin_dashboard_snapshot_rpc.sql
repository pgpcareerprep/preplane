-- Single-round-trip bootstrap payload for the admin LMP dashboard.
-- Bundles students, LMP processes, candidates, cohort/program masters, and POC capacity.

CREATE OR REPLACE FUNCTION public.get_admin_dashboard_snapshot(
  p_cohort_ids uuid[] DEFAULT NULL,
  p_program_ids uuid[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'allocator'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'students', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'email', s.email,
          'name', s.name,
          'cohort', s.cohort,
          'cohort_id', s.cohort_id,
          'program_id', s.program_id,
          'primary_domain', s.primary_domain,
          'secondary_domain', s.secondary_domain,
          'lmp_count', s.lmp_count,
          'active_lmp_count', s.active_lmp_count,
          'placement_status', s.placement_status,
          'roll_no', s.roll_no,
          'student_code', s.student_code,
          'phone', s.phone
        )
        ORDER BY s.name
      )
      FROM public.students s
      WHERE (
        p_cohort_ids IS NULL
        OR cardinality(p_cohort_ids) = 0
        OR s.cohort_id = ANY (p_cohort_ids)
      )
      AND (
        p_program_ids IS NULL
        OR cardinality(p_program_ids) = 0
        OR s.program_id = ANY (p_program_ids)
      )
    ), '[]'::jsonb),
    'lmp_processes', COALESCE((
      SELECT jsonb_agg(proc_row ORDER BY proc_row->>'created_at' DESC)
      FROM (
        SELECT jsonb_build_object(
          'id', lp.id,
          'company', lp.company,
          'role', lp.role,
          'status', lp.status,
          'type', lp.type,
          'domain_raw', lp.domain_raw,
          'domain_id', lp.domain_id,
          'prep_poc', lp.prep_poc,
          'support_poc', lp.support_poc,
          'outreach_poc', lp.outreach_poc,
          'prep_poc_id', lp.prep_poc_id,
          'support_poc_id', lp.support_poc_id,
          'created_at', lp.created_at,
          'updated_at', lp.updated_at,
          'date', lp.date,
          'closing_date', lp.closing_date,
          'placement_progress', lp.placement_progress,
          'prep_progress', lp.prep_progress,
          'pool_names', lp.pool_names,
          'r1_names', lp.r1_names,
          'r2_names', lp.r2_names,
          'r3_names', lp.r3_names,
          'final_converted_numbers', lp.final_converted_numbers,
          'final_converted_names', lp.final_converted_names,
          'prep_doc', lp.prep_doc,
          'daily_progress', lp.daily_progress,
          'mentor_aligned', lp.mentor_aligned,
          'one_to_one_mock', lp.one_to_one_mock,
          'next_progress_date', lp.next_progress_date,
          'next_progress_type', lp.next_progress_type,
          'next_progress_reminder_type', lp.next_progress_reminder_type,
          'last_progress_updated_at', lp.last_progress_updated_at,
          'sheet_row_id', lp.sheet_row_id,
          'lmp_code', lp.lmp_code,
          'domains', CASE
            WHEN d.id IS NOT NULL THEN jsonb_build_object('name', d.name, 'slug', d.slug)
            ELSE NULL
          END
        ) AS proc_row
        FROM public.lmp_processes lp
        LEFT JOIN public.domains d ON d.id = lp.domain_id
        ORDER BY lp.created_at DESC
        LIMIT 5000
      ) sub
    ), '[]'::jsonb),
    'candidates', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'lmp_id', c.lmp_id,
          'student_id', c.student_id,
          'email', c.email,
          'student_name', c.student_name,
          'roll_no', c.roll_no,
          'pipeline_stage', c.pipeline_stage,
          'offer_status', c.offer_status,
          'status', c.status,
          'r1_status', c.r1_status,
          'r2_status', c.r2_status,
          'r3_status', c.r3_status
        )
      )
      FROM public.lmp_candidates c
      WHERE c.lmp_id IN (SELECT id FROM public.lmp_processes)
    ), '[]'::jsonb),
    'cohorts', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.code)
      FROM public.cohorts c
    ), '[]'::jsonb),
    'programs', COALESCE((
      SELECT jsonb_agg(to_jsonb(p) ORDER BY p.code)
      FROM public.programs p
    ), '[]'::jsonb),
    'prep_poc_capacity', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'name', cap.name,
          'active', cap.active,
          'has_domain', cap.has_domain
        )
        ORDER BY cap.name
      )
      FROM (
        SELECT
          btrim(p.name) AS name,
          COUNT(DISTINCT CASE
            WHEN l.role = 'prep'
              AND l.is_active
              AND lower(coalesce(lp.status, '')) NOT IN (
                'converted', 'not-converted', 'other-reasons', 'closed', 'rejected'
              )
            THEN l.lmp_id
            ELSE NULL
          END)::int AS active,
          (
            coalesce(btrim(p.primary_domain), '') <> ''
            OR coalesce(cardinality(p.domain_tags), 0) > 0
          ) AS has_domain
        FROM public.poc_profiles p
        LEFT JOIN public.lmp_poc_links l
          ON l.poc_id = p.id
         AND l.role IN ('prep', 'support')
        LEFT JOIN public.lmp_processes lp ON lp.id = l.lmp_id
        WHERE p.status = 'active'
        GROUP BY p.id, p.name, p.primary_domain, p.domain_tags
        HAVING btrim(p.name) <> ''
           AND (
             coalesce(btrim(p.primary_domain), '') <> ''
             OR coalesce(cardinality(p.domain_tags), 0) > 0
             OR COUNT(DISTINCT CASE
               WHEN l.role = 'prep'
                 AND l.is_active
                 AND lower(coalesce(lp.status, '')) NOT IN (
                   'converted', 'not-converted', 'other-reasons', 'closed', 'rejected'
                 )
               THEN l.lmp_id
               ELSE NULL
             END) > 0
           )
      ) cap
    ), '[]'::jsonb)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_dashboard_snapshot(uuid[], uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_snapshot(uuid[], uuid[]) TO authenticated, service_role;
