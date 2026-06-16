-- Fixed five-stage candidate pipeline:
-- Pool -> R1 -> R2 -> R3 -> Converted
-- Mirrors to LMP Tracker columns N/O, P/Q, R/S, T/U, V/W.

ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS pool_names text;

CREATE OR REPLACE VIEW public.lmp_full_view AS
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
  l.r1_names,
  l.r2_names,
  l.r3_names,
  l.mentor_selected,
  (SELECT dl.text FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id ORDER BY dl.created_at DESC LIMIT 1) AS latest_daily_progress,
  (SELECT count(*) FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id) AS daily_log_count,
  l.next_progress_date,
  l.next_progress_type,
  COALESCE(l.prep_doc_shared, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'prep_doc_shared' LIMIT 1), false) AS checklist_prep_doc_shared,
  COALESCE(l.mentor_aligned, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'mentor_aligned' LIMIT 1), false) AS checklist_mentor_aligned,
  COALESCE(l.assignment_review, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'assignment_review' LIMIT 1), false) AS checklist_assignment_review,
  COALESCE(l.one_to_one_mock, (SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'one_to_one_mock' LIMIT 1), false) AS checklist_one_to_one_mock,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage,'')) = ANY (ARRAY['r1','r1_shortlisted','round_1','round1'])) AS r1_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage,'')) = ANY (ARRAY['r2','r2_shortlisted','round_2','round2'])) AS r2_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND lower(COALESCE(c.pipeline_stage,'')) = ANY (ARRAY['r3','r3_shortlisted','round_3','round3'])) AS r3_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND (lower(COALESCE(c.pipeline_stage,'')) = ANY (ARRAY['offer','converted','final','accepted']) OR COALESCE(trim(c.offer_status), '') <> '')) AS offer_count,
  l.final_converted_numbers,
  l.final_converted_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'prep' AND k.is_active), NULLIF(l.prep_poc, '')) AS prep_poc_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'support' AND k.is_active), NULLIF(l.support_poc, '')) AS support_poc_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'outreach' AND k.is_active), NULLIF(l.outreach_poc, '')) AS outreach_poc_names,
  l.prep_doc,
  COALESCE((SELECT m.name FROM public.lmp_mentors lm JOIN public.mentors m ON m.id = lm.mentor_id WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1), NULLIF(l.mentor_selected, '')) AS mentor_name,
  COALESCE((SELECT lm.feedback_avg FROM public.lmp_mentors lm WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1), (SELECT avg(s.mentor_rating) FROM public.sessions s WHERE s.lmp_id = l.id AND s.mentor_rating IS NOT NULL)) AS mentor_feedback_avg,
  l.created_at,
  l.updated_at,
  l.sync_source,
  l.comments,
  l.feedback_by_outreach,
  l.pool_names,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND (COALESCE(trim(c.pipeline_stage), '') = '' OR lower(COALESCE(c.pipeline_stage,'')) = ANY (ARRAY['pool','shortlisted','shortlisted_pool','shortlisted-pool']))) AS pool_count
FROM public.lmp_processes l;

GRANT SELECT ON public.lmp_full_view TO authenticated;
GRANT SELECT ON public.lmp_full_view TO anon;

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
  v_pool_names text;
  v_r1_names text;
  v_r2_names text;
  v_r3_names text;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE COALESCE(trim(pipeline_stage), '') = ''
         OR lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['pool','shortlisted','shortlisted_pool','shortlisted-pool'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r1','r1_shortlisted','round_1','round1'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r2','r2_shortlisted','round_2','round2'])
    ),
    string_agg(student_name, ', ' ORDER BY student_name) FILTER (
      WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r3','r3_shortlisted','round_3','round3'])
    )
  INTO v_pool_names, v_r1_names, v_r2_names, v_r3_names
  FROM public.lmp_candidates
  WHERE lmp_id = v_lmp_id;

  UPDATE public.lmp_processes
     SET pool_names = v_pool_names,
         r1_names = v_r1_names,
         r2_names = v_r2_names,
         r3_names = v_r3_names,
         sync_source = NULL,
         updated_at = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

UPDATE public.field_mapping_registry
   SET app_field = 'pool_count',
       sync_direction = 'computed',
       notes = 'Col N - lmp_full_view pool_count',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'Shortlisted (Pool) - Number';

UPDATE public.field_mapping_registry
   SET app_field = 'pool_names',
       sync_direction = 'db_to_sheet',
       notes = 'Col O - lmp_processes.pool_names',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'Shortlisted (Pool) - Name(s)';

UPDATE public.field_mapping_registry
   SET notes = 'Col P - lmp_full_view r1_count',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'R1 - Numbers';

UPDATE public.field_mapping_registry
   SET notes = 'Col R - lmp_full_view r2_count',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'R2 - Numbers';

UPDATE public.field_mapping_registry
   SET notes = 'Col T - lmp_full_view r3_count',
       last_verified_at = now()
 WHERE tab_name = 'LMP Tracker'
   AND sheet_column = 'R3 - Numbers';

NOTIFY pgrst, 'reload schema';
