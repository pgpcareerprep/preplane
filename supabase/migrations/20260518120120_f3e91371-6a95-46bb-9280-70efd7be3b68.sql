
DROP VIEW IF EXISTS public.lmp_full_view;

CREATE VIEW public.lmp_full_view AS
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
  l.r1_shortlisted,
  l.r2_shortlisted,
  l.r3_shortlisted,
  l.mentor_selected,
  ( SELECT dl.text FROM public.lmp_daily_logs dl
     WHERE dl.lmp_id = l.id ORDER BY dl.created_at DESC LIMIT 1 ) AS latest_daily_progress,
  ( SELECT count(*) FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id ) AS daily_log_count,
  l.next_progress_date,
  l.next_progress_type,
  COALESCE(
    l.prep_doc_shared,
    ( SELECT ch.completed FROM public.lmp_checklists ch
       WHERE ch.lmp_id = l.id AND ch.item_key = 'prep_doc_shared' LIMIT 1 ),
    false
  ) AS checklist_prep_doc_shared,
  COALESCE(
    l.mentor_aligned,
    ( SELECT ch.completed FROM public.lmp_checklists ch
       WHERE ch.lmp_id = l.id AND ch.item_key = 'mentor_aligned' LIMIT 1 ),
    false
  ) AS checklist_mentor_aligned,
  COALESCE(
    l.assignment_review,
    ( SELECT ch.completed FROM public.lmp_checklists ch
       WHERE ch.lmp_id = l.id AND ch.item_key = 'assignment_review' LIMIT 1 ),
    false
  ) AS checklist_assignment_review,
  COALESCE(
    l.one_to_one_mock,
    ( SELECT ch.completed FROM public.lmp_checklists ch
       WHERE ch.lmp_id = l.id AND ch.item_key = 'one_to_one_mock' LIMIT 1 ),
    false
  ) AS checklist_one_to_one_mock,
  ( SELECT count(*) FROM public.lmp_candidates c
     WHERE c.lmp_id = l.id AND c.r1_status IS NOT NULL AND c.r1_status <> '' ) AS r1_count,
  ( SELECT count(*) FROM public.lmp_candidates c
     WHERE c.lmp_id = l.id AND c.r2_status IS NOT NULL AND c.r2_status <> '' ) AS r2_count,
  ( SELECT count(*) FROM public.lmp_candidates c
     WHERE c.lmp_id = l.id AND c.r3_status IS NOT NULL AND c.r3_status <> '' ) AS r3_count,
  ( SELECT count(*) FROM public.lmp_candidates c
     WHERE c.lmp_id = l.id AND c.offer_status IS NOT NULL AND c.offer_status <> '' ) AS offer_count,
  l.final_convert,
  l.convert_names,
  COALESCE(
    ( SELECT string_agg(p.name, ', ')
        FROM public.lmp_poc_links k
        JOIN public.poc_profiles p ON p.id = k.poc_id
       WHERE k.lmp_id = l.id AND k.role = 'prep' AND k.is_active ),
    NULLIF(l.prep_poc, '')
  ) AS prep_poc_names,
  COALESCE(
    ( SELECT string_agg(p.name, ', ')
        FROM public.lmp_poc_links k
        JOIN public.poc_profiles p ON p.id = k.poc_id
       WHERE k.lmp_id = l.id AND k.role = 'support' AND k.is_active ),
    NULLIF(l.support_poc, '')
  ) AS support_poc_names,
  COALESCE(
    ( SELECT string_agg(p.name, ', ')
        FROM public.lmp_poc_links k
        JOIN public.poc_profiles p ON p.id = k.poc_id
       WHERE k.lmp_id = l.id AND k.role = 'outreach' AND k.is_active ),
    NULLIF(l.outreach_poc, '')
  ) AS outreach_poc_names,
  l.prep_doc,
  COALESCE(
    ( SELECT m.name FROM public.lmp_mentors lm
        JOIN public.mentors m ON m.id = lm.mentor_id
       WHERE lm.lmp_id = l.id AND lm.status = 'assigned'
       ORDER BY lm.assigned_at DESC LIMIT 1 ),
    NULLIF(l.mentor_selected, '')
  ) AS mentor_name,
  COALESCE(
    ( SELECT lm.feedback_avg FROM public.lmp_mentors lm
       WHERE lm.lmp_id = l.id AND lm.status = 'assigned'
       ORDER BY lm.assigned_at DESC LIMIT 1 ),
    ( SELECT AVG(s.mentor_rating) FROM public.sessions s
       WHERE s.lmp_id = l.id AND s.mentor_rating IS NOT NULL )
  ) AS mentor_feedback_avg,
  l.created_at,
  l.updated_at,
  l.sync_source
FROM public.lmp_processes l;

CREATE OR REPLACE FUNCTION public.tg_lmp_process_delete_sheet_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q';
  v_payload jsonb;
  v_row_num bigint;
BEGIN
  BEGIN
    v_row_num := NULLIF(OLD.sheet_row_id, '')::bigint;
  EXCEPTION WHEN OTHERS THEN
    v_row_num := NULL;
  END;

  v_payload := jsonb_build_object(
    'op', 'delete',
    'tab', 'LMP Tracker',
    'headerRow', 15,
    'id', OLD.id::text,
    'rowNumber', v_row_num,
    'findBy', jsonb_build_object(
      'LMP ID', COALESCE(NULLIF(OLD.lmp_code, ''), OLD.id::text),
      'Company', COALESCE(OLD.company, ''),
      'Role', COALESCE(OLD.role, '')
    )
  );

  INSERT INTO public.sheet_write_queue (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error)
  VALUES ('LMP Tracker','delete',v_payload,'pending',now()+interval '90 seconds','db_trigger','enqueued_by_delete_trigger');

  PERFORM net.http_post(
    url := 'https://yhzcheqjzmikeczzoeih.supabase.co/functions/v1/sheets-lmp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-sheet-sweeper', '1'
    ),
    body := v_payload
  );

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_lmp_process_delete_sheet_sync failed: %', SQLERRM;
  RETURN OLD;
END;
$function$;
