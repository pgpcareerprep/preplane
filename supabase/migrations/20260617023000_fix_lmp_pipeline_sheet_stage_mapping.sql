-- Repair candidate pipeline stage aliases used by lmp_full_view and sheet sync.
-- Critical behavior:
--   Pool: null, blank, pool, shortlisted, shortlisted_pool, shortlisted-pool
--   R1:   r1, r1_shortlisted, round1, round_1
--   R2:   r2, r2_shortlisted, round2, round_2
--   R3:   r3, r3_shortlisted, round3, round_3
--   Converted: converted, offer, final, accepted

ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS pool_names text;

DROP VIEW IF EXISTS public.lmp_full_view;

CREATE VIEW public.lmp_full_view
WITH (security_invoker = true)
AS
SELECT
  l.id,
  l.company,
  l.role,
  l.domain_raw,
  l.domain_id,
  l.status,
  l.type,
  l.date AS created_date,
  l.closing_date,
  l.jd_url,
  l.jd_label,
  l.lmp_code,
  l.mentor_selected,
  (SELECT dl.text FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id ORDER BY dl.created_at DESC LIMIT 1) AS latest_daily_progress,
  (SELECT count(*) FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id) AS daily_log_count,
  l.next_progress_date,
  l.next_progress_type,
  COALESCE(l.prep_doc_shared, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'prep_doc_shared' LIMIT 1), false) AS checklist_prep_doc_shared,
  COALESCE(l.mentor_aligned, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'mentor_aligned' LIMIT 1), false) AS checklist_mentor_aligned,
  COALESCE(l.assignment_review, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'assignment_review' LIMIT 1), false) AS checklist_assignment_review,
  COALESCE(l.one_to_one_mock, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'one_to_one_mock' LIMIT 1), false) AS checklist_one_to_one_mock,

  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND (COALESCE(trim(c.pipeline_stage), '') = '' OR lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['pool','shortlisted','shortlisted_pool','shortlisted-pool']))) AS pool_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND (COALESCE(trim(c.pipeline_stage), '') = '' OR lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['pool','shortlisted','shortlisted_pool','shortlisted-pool']))) AS pool_names,

  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r1','r1_shortlisted','round1','round_1'])) AS r1_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r1','r1_shortlisted','round1','round_1'])) AS r1_names,

  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r2','r2_shortlisted','round2','round_2'])) AS r2_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r2','r2_shortlisted','round2','round_2'])) AS r2_names,

  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r3','r3_shortlisted','round3','round_3'])) AS r3_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r3','r3_shortlisted','round3','round_3'])) AS r3_names,

  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['offer','converted','final','accepted'])) AS offer_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['offer','converted','final','accepted'])) AS converted_count,
  (SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['offer','converted','final','accepted'])) AS converted_names,

  l.final_converted_numbers,
  l.final_converted_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'prep' AND k.is_active), NULLIF(l.prep_poc, '')) AS prep_poc_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'support' AND k.is_active), NULLIF(l.support_poc, '')) AS support_poc_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'outreach' AND k.is_active), NULLIF(l.outreach_poc, '')) AS outreach_poc_names,
  l.prep_doc,
  l.prep_doc_link,
  COALESCE((SELECT m.name FROM public.lmp_mentors lm JOIN public.mentors m ON m.id = lm.mentor_id WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1), NULLIF(l.mentor_selected, '')) AS mentor_name,
  COALESCE((SELECT lm.feedback_avg FROM public.lmp_mentors lm WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1), (SELECT avg(s.mentor_rating) FROM public.sessions s WHERE s.lmp_id = l.id AND s.mentor_rating IS NOT NULL)) AS mentor_feedback_avg,
  l.created_at,
  l.updated_at,
  l.sync_source,
  l.comments,
  l.feedback_by_outreach
FROM public.lmp_processes l;

GRANT SELECT ON public.lmp_full_view TO authenticated;
GRANT SELECT ON public.lmp_full_view TO anon;

CREATE OR REPLACE FUNCTION public.recompute_lmp_candidate_stages(p_lmp_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lmp_processes l
  SET
    pool_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM public.lmp_candidates c
      WHERE c.lmp_id = l.id
        AND (COALESCE(trim(c.pipeline_stage), '') = ''
          OR lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['pool','shortlisted','shortlisted_pool','shortlisted-pool']))
    ),
    r1_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM public.lmp_candidates c
      WHERE c.lmp_id = l.id
        AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r1','r1_shortlisted','round1','round_1'])
    ),
    r2_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM public.lmp_candidates c
      WHERE c.lmp_id = l.id
        AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r2','r2_shortlisted','round2','round_2'])
    ),
    r3_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM public.lmp_candidates c
      WHERE c.lmp_id = l.id
        AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['r3','r3_shortlisted','round3','round_3'])
    ),
    final_converted_names = (
      SELECT string_agg(c.student_name, ', ' ORDER BY c.student_name)
      FROM public.lmp_candidates c
      WHERE c.lmp_id = l.id
        AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['offer','converted','final','accepted'])
    ),
    final_converted_numbers = (
      SELECT CASE WHEN count(*) > 0 THEN count(*)::text ELSE NULL END
      FROM public.lmp_candidates c
      WHERE c.lmp_id = l.id
        AND lower(COALESCE(c.pipeline_stage, '')) = ANY (ARRAY['offer','converted','final','accepted'])
    ),
    updated_at = now()
  WHERE (p_lmp_id IS NULL OR l.id = p_lmp_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_lmp_candidate_stages(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  PERFORM public.recompute_lmp_candidate_stages(v_lmp_id);
  PERFORM public.enqueue_lmp_sheet_mirror_by_id(v_lmp_id, 'candidate_pipeline_change');

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed for lmp_id=%: %', v_lmp_id, SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

SELECT public.recompute_lmp_candidate_stages();

NOTIFY pgrst, 'reload schema';
