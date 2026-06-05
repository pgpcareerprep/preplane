
CREATE OR REPLACE VIEW public.lmp_full_view AS
SELECT
  id, company, role, domain_raw, domain_id, status, type,
  date AS created_date, closing_date, jd_url, jd_label, lmp_code,
  r1_shortlisted, r2_shortlisted, r3_shortlisted, mentor_selected,
  (SELECT dl.text FROM lmp_daily_logs dl WHERE dl.lmp_id = l.id ORDER BY dl.created_at DESC LIMIT 1) AS latest_daily_progress,
  (SELECT count(*) FROM lmp_daily_logs dl WHERE dl.lmp_id = l.id) AS daily_log_count,
  next_progress_date, next_progress_type,
  COALESCE(prep_doc_shared, (SELECT ch.completed FROM lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'prep_doc_shared' LIMIT 1), false) AS checklist_prep_doc_shared,
  COALESCE(mentor_aligned, (SELECT ch.completed FROM lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'mentor_aligned' LIMIT 1), false) AS checklist_mentor_aligned,
  COALESCE(assignment_review, (SELECT ch.completed FROM lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'assignment_review' LIMIT 1), false) AS checklist_assignment_review,
  COALESCE(one_to_one_mock, (SELECT ch.completed FROM lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'one_to_one_mock' LIMIT 1), false) AS checklist_one_to_one_mock,

  -- Exclusive, stage-based counts. One candidate is in exactly one round at a time.
  (SELECT count(*) FROM lmp_candidates c
     WHERE c.lmp_id = l.id
       AND lower(COALESCE(c.pipeline_stage,'')) IN ('r1','r1_shortlisted','shortlisted','round_1','round1')
  ) AS r1_count,

  (SELECT count(*) FROM lmp_candidates c
     WHERE c.lmp_id = l.id
       AND lower(COALESCE(c.pipeline_stage,'')) IN ('r2','r2_shortlisted','round_2','round2')
  ) AS r2_count,

  (SELECT count(*) FROM lmp_candidates c
     WHERE c.lmp_id = l.id
       AND lower(COALESCE(c.pipeline_stage,'')) IN ('r3','r3_shortlisted','round_3','round3')
  ) AS r3_count,

  (SELECT count(*) FROM lmp_candidates c
     WHERE c.lmp_id = l.id
       AND lower(COALESCE(c.pipeline_stage,'')) IN ('offer','converted','final','accepted')
  ) AS offer_count,

  final_convert, convert_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM lmp_poc_links k JOIN poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'prep' AND k.is_active), NULLIF(prep_poc,'')) AS prep_poc_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM lmp_poc_links k JOIN poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'support' AND k.is_active), NULLIF(support_poc,'')) AS support_poc_names,
  COALESCE((SELECT string_agg(p.name, ', ') FROM lmp_poc_links k JOIN poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'outreach' AND k.is_active), NULLIF(outreach_poc,'')) AS outreach_poc_names,
  prep_doc,
  COALESCE((SELECT m.name FROM lmp_mentors lm JOIN mentors m ON m.id = lm.mentor_id WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1), NULLIF(mentor_selected,'')) AS mentor_name,
  COALESCE((SELECT lm.feedback_avg FROM lmp_mentors lm WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1),
           (SELECT avg(s.mentor_rating) FROM sessions s WHERE s.lmp_id = l.id AND s.mentor_rating IS NOT NULL)) AS mentor_feedback_avg,
  created_at, updated_at, sync_source
FROM lmp_processes l;
