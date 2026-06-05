
-- Helper: resolve current actor display name
CREATE OR REPLACE FUNCTION public.current_actor_name()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  nm  text;
BEGIN
  IF uid IS NULL THEN RETURN 'System'; END IF;
  SELECT name INTO nm FROM public.poc_profiles WHERE approved_user_id = uid LIMIT 1;
  IF nm IS NOT NULL AND length(nm) > 0 THEN RETURN nm; END IF;
  SELECT COALESCE(NULLIF(display_name,''), email) INTO nm FROM public.profiles WHERE user_id = uid LIMIT 1;
  RETURN COALESCE(nm, 'System');
END $$;

-- Helper: insert a timeline row
CREATE OR REPLACE FUNCTION public._log_timeline(
  p_lmp_id uuid, p_event text, p_desc text, p_meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO public.lmp_timeline(lmp_id, event_type, description, actor, metadata)
  VALUES (p_lmp_id, p_event, p_desc, public.current_actor_name(), COALESCE(p_meta,'{}'::jsonb));
$$;

-- ============ lmp_processes trigger ============
CREATE OR REPLACE FUNCTION public.tg_lmp_processes_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  nm text;
  v_old text;
  v_new text;
  added uuid[];
  removed uuid[];
  u uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._log_timeline(NEW.id, 'update',
      'LMP process created for ' || COALESCE(NEW.company,'?') || ' / ' || COALESCE(NEW.role,'?'),
      jsonb_build_object('sync_source', NEW.sync_source));
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public._log_timeline(NEW.id, 'update',
      'Status changed: ' || COALESCE(OLD.status,'—') || ' → ' || COALESCE(NEW.status,'—'),
      jsonb_build_object('column','status','old',OLD.status,'new',NEW.status));
  END IF;

  IF NEW.prep_poc_id IS DISTINCT FROM OLD.prep_poc_id THEN
    SELECT name INTO nm FROM public.poc_profiles WHERE id = NEW.prep_poc_id;
    PERFORM public._log_timeline(NEW.id, 'update',
      CASE WHEN NEW.prep_poc_id IS NULL THEN 'Prep POC removed'
           ELSE 'Prep POC set to ' || COALESCE(nm, NEW.prep_poc::text, '?') END,
      jsonb_build_object('column','prep_poc_id'));
  END IF;

  IF NEW.support_poc_id IS DISTINCT FROM OLD.support_poc_id THEN
    SELECT name INTO nm FROM public.poc_profiles WHERE id = NEW.support_poc_id;
    PERFORM public._log_timeline(NEW.id, 'update',
      CASE WHEN NEW.support_poc_id IS NULL THEN 'Support POC removed'
           ELSE 'Support POC set to ' || COALESCE(nm, NEW.support_poc::text, '?') END,
      jsonb_build_object('column','support_poc_id'));
  END IF;

  IF COALESCE(NEW.outreach_poc_ids,'{}') IS DISTINCT FROM COALESCE(OLD.outreach_poc_ids,'{}') THEN
    added   := ARRAY(SELECT unnest(COALESCE(NEW.outreach_poc_ids,'{}')) EXCEPT SELECT unnest(COALESCE(OLD.outreach_poc_ids,'{}')));
    removed := ARRAY(SELECT unnest(COALESCE(OLD.outreach_poc_ids,'{}')) EXCEPT SELECT unnest(COALESCE(NEW.outreach_poc_ids,'{}')));
    FOREACH u IN ARRAY added LOOP
      SELECT name INTO nm FROM public.poc_profiles WHERE id = u;
      PERFORM public._log_timeline(NEW.id,'update','Outreach POC added: '||COALESCE(nm,u::text), jsonb_build_object('column','outreach_poc_ids','poc_id',u));
    END LOOP;
    FOREACH u IN ARRAY removed LOOP
      SELECT name INTO nm FROM public.poc_profiles WHERE id = u;
      PERFORM public._log_timeline(NEW.id,'update','Outreach POC removed: '||COALESCE(nm,u::text), jsonb_build_object('column','outreach_poc_ids','poc_id',u));
    END LOOP;
  END IF;

  IF NEW.mentor_aligned IS DISTINCT FROM OLD.mentor_aligned THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked Mentor aligned as '||CASE WHEN NEW.mentor_aligned THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','mentor_aligned'));
  END IF;
  IF NEW.prep_doc_shared IS DISTINCT FROM OLD.prep_doc_shared THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked Prep doc shared as '||CASE WHEN NEW.prep_doc_shared THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','prep_doc_shared'));
  END IF;
  IF NEW.assignment_review IS DISTINCT FROM OLD.assignment_review THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked Assignment review as '||CASE WHEN NEW.assignment_review THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','assignment_review'));
  END IF;
  IF NEW.one_to_one_mock IS DISTINCT FROM OLD.one_to_one_mock THEN
    PERFORM public._log_timeline(NEW.id,'checklist','Marked 1:1 mock completed as '||CASE WHEN NEW.one_to_one_mock THEN 'Yes' ELSE 'No' END, jsonb_build_object('column','one_to_one_mock'));
  END IF;

  IF NEW.jd_url IS DISTINCT FROM OLD.jd_url OR NEW.jd_file_name IS DISTINCT FROM OLD.jd_file_name THEN
    IF COALESCE(NEW.jd_url,NEW.jd_file_name,'') <> '' THEN
      PERFORM public._log_timeline(NEW.id,'attachment','JD uploaded: '||COALESCE(NEW.jd_file_name,NEW.jd_url), jsonb_build_object('column','jd_url','attachment_name',COALESCE(NEW.jd_file_name,NEW.jd_url)));
    END IF;
  END IF;

  IF NEW.prep_doc_link IS DISTINCT FROM OLD.prep_doc_link THEN
    IF COALESCE(NEW.prep_doc_link,'') <> '' THEN
      PERFORM public._log_timeline(NEW.id,'attachment','Prep doc link updated', jsonb_build_object('column','prep_doc_link','attachment_name','Prep Doc'));
    END IF;
  END IF;

  IF NEW.next_progress_date IS DISTINCT FROM OLD.next_progress_date
     OR NEW.next_progress_type IS DISTINCT FROM OLD.next_progress_type THEN
    PERFORM public._log_timeline(NEW.id,'update','Next progress: '||COALESCE(NEW.next_progress_type,'—')||' on '||COALESCE(NEW.next_progress_date::text,'—'),
      jsonb_build_object('column','next_progress'));
  END IF;

  IF NEW.mentor_rating IS DISTINCT FROM OLD.mentor_rating AND NEW.mentor_rating IS NOT NULL THEN
    PERFORM public._log_timeline(NEW.id,'mentor','Mentor rating set to '||NEW.mentor_rating::text, jsonb_build_object('column','mentor_rating'));
  END IF;

  IF NEW.mentor_selected IS DISTINCT FROM OLD.mentor_selected AND COALESCE(NEW.mentor_selected,'')<>'' THEN
    PERFORM public._log_timeline(NEW.id,'mentor','Mentor selected: '||NEW.mentor_selected, jsonb_build_object('column','mentor_selected'));
  END IF;

  IF NEW.r1_shortlisted IS DISTINCT FROM OLD.r1_shortlisted THEN
    PERFORM public._log_timeline(NEW.id,'candidate-move','R1 shortlisted updated: '||COALESCE(NEW.r1_shortlisted,'—'), jsonb_build_object('column','r1_shortlisted'));
  END IF;
  IF NEW.r2_shortlisted IS DISTINCT FROM OLD.r2_shortlisted THEN
    PERFORM public._log_timeline(NEW.id,'candidate-move','R2 shortlisted updated: '||COALESCE(NEW.r2_shortlisted,'—'), jsonb_build_object('column','r2_shortlisted'));
  END IF;
  IF NEW.r3_shortlisted IS DISTINCT FROM OLD.r3_shortlisted THEN
    PERFORM public._log_timeline(NEW.id,'candidate-move','R3 shortlisted updated: '||COALESCE(NEW.r3_shortlisted,'—'), jsonb_build_object('column','r3_shortlisted'));
  END IF;

  IF NEW.final_convert IS DISTINCT FROM OLD.final_convert OR NEW.convert_names IS DISTINCT FROM OLD.convert_names THEN
    PERFORM public._log_timeline(NEW.id,'update','Final convert updated'||CASE WHEN NEW.convert_names IS NOT NULL THEN ': '||NEW.convert_names ELSE '' END, jsonb_build_object('column','final_convert'));
  END IF;

  IF NEW.behavioral_status IS DISTINCT FROM OLD.behavioral_status AND COALESCE(NEW.behavioral_status,'')<>'' THEN
    PERFORM public._log_timeline(NEW.id,'update','Behavioral status: '||NEW.behavioral_status, jsonb_build_object('column','behavioral_status'));
  END IF;

  IF NEW.remarks IS DISTINCT FROM OLD.remarks AND COALESCE(NEW.remarks,'')<>'' THEN
    PERFORM public._log_timeline(NEW.id,'remark',NEW.remarks, jsonb_build_object('column','remarks'));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_lmp_processes_timeline ON public.lmp_processes;
CREATE TRIGGER tg_lmp_processes_timeline
AFTER INSERT OR UPDATE ON public.lmp_processes
FOR EACH ROW EXECUTE FUNCTION public.tg_lmp_processes_timeline();

-- ============ lmp_candidates trigger ============
CREATE OR REPLACE FUNCTION public.tg_lmp_candidates_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._log_timeline(NEW.lmp_id,'candidate-move','Candidate '||COALESCE(NEW.student_name,'?')||' added to pipeline', jsonb_build_object('candidate_id',NEW.id,'kind','add'));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public._log_timeline(OLD.lmp_id,'candidate-move','Candidate '||COALESCE(OLD.student_name,'?')||' removed from pipeline', jsonb_build_object('candidate_id',OLD.id,'kind','remove'));
    RETURN OLD;
  END IF;

  IF NEW.r1_status IS DISTINCT FROM OLD.r1_status THEN
    PERFORM public._log_timeline(NEW.lmp_id,'candidate-move',NEW.student_name||' R1: '||COALESCE(OLD.r1_status,'—')||' → '||COALESCE(NEW.r1_status,'—'), jsonb_build_object('candidate_id',NEW.id,'round','R1'));
  END IF;
  IF NEW.r2_status IS DISTINCT FROM OLD.r2_status THEN
    PERFORM public._log_timeline(NEW.lmp_id,'candidate-move',NEW.student_name||' R2: '||COALESCE(OLD.r2_status,'—')||' → '||COALESCE(NEW.r2_status,'—'), jsonb_build_object('candidate_id',NEW.id,'round','R2'));
  END IF;
  IF NEW.r3_status IS DISTINCT FROM OLD.r3_status THEN
    PERFORM public._log_timeline(NEW.lmp_id,'candidate-move',NEW.student_name||' R3: '||COALESCE(OLD.r3_status,'—')||' → '||COALESCE(NEW.r3_status,'—'), jsonb_build_object('candidate_id',NEW.id,'round','R3'));
  END IF;
  IF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
    PERFORM public._log_timeline(NEW.lmp_id,'candidate-move',NEW.student_name||' moved '||COALESCE(OLD.pipeline_stage,'—')||' → '||COALESCE(NEW.pipeline_stage,'—'), jsonb_build_object('candidate_id',NEW.id,'column','pipeline_stage'));
  END IF;
  IF NEW.offer_status IS DISTINCT FROM OLD.offer_status AND COALESCE(NEW.offer_status,'')<>'' THEN
    PERFORM public._log_timeline(NEW.lmp_id,'update',NEW.student_name||' offer: '||NEW.offer_status, jsonb_build_object('candidate_id',NEW.id));
  END IF;
  IF NEW.mentor_id IS DISTINCT FROM OLD.mentor_id AND NEW.mentor_id IS NOT NULL THEN
    PERFORM public._log_timeline(NEW.lmp_id,'mentor','Mentor assigned to '||NEW.student_name, jsonb_build_object('candidate_id',NEW.id,'mentor_id',NEW.mentor_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_lmp_candidates_timeline ON public.lmp_candidates;
CREATE TRIGGER tg_lmp_candidates_timeline
AFTER INSERT OR UPDATE OR DELETE ON public.lmp_candidates
FOR EACH ROW EXECUTE FUNCTION public.tg_lmp_candidates_timeline();

-- ============ lmp_mentors trigger ============
CREATE OR REPLACE FUNCTION public.tg_lmp_mentors_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE nm text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO nm FROM public.mentors WHERE id = NEW.mentor_id;
    PERFORM public._log_timeline(NEW.lmp_id,'mentor','Mentor '||COALESCE(nm,'?')||' aligned', jsonb_build_object('mentor_id',NEW.mentor_id));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT name INTO nm FROM public.mentors WHERE id = OLD.mentor_id;
    PERFORM public._log_timeline(OLD.lmp_id,'mentor','Mentor '||COALESCE(nm,'?')||' removed', jsonb_build_object('mentor_id',OLD.mentor_id));
    RETURN OLD;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT name INTO nm FROM public.mentors WHERE id = NEW.mentor_id;
    PERFORM public._log_timeline(NEW.lmp_id,'mentor','Mentor '||COALESCE(nm,'?')||' status: '||COALESCE(NEW.status,'—'), jsonb_build_object('mentor_id',NEW.mentor_id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_lmp_mentors_timeline ON public.lmp_mentors;
CREATE TRIGGER tg_lmp_mentors_timeline
AFTER INSERT OR UPDATE OR DELETE ON public.lmp_mentors
FOR EACH ROW EXECUTE FUNCTION public.tg_lmp_mentors_timeline();

-- ============ sessions trigger ============
CREATE OR REPLACE FUNCTION public.tg_sessions_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE mnm text; snm text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.lmp_id IS NULL THEN RETURN NEW; END IF;
    SELECT name INTO mnm FROM public.mentors WHERE id = NEW.mentor_id;
    PERFORM public._log_timeline(NEW.lmp_id,'mentor',
      'Session scheduled'||CASE WHEN mnm IS NOT NULL THEN ' with '||mnm ELSE '' END
        ||CASE WHEN NEW.scheduled_at IS NOT NULL THEN ' on '||to_char(NEW.scheduled_at,'YYYY-MM-DD HH24:MI') ELSE '' END,
      jsonb_build_object('session_id',NEW.id,'mentor_id',NEW.mentor_id));
    RETURN NEW;
  END IF;
  IF NEW.lmp_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public._log_timeline(NEW.lmp_id,'mentor','Session status: '||COALESCE(OLD.status,'—')||' → '||COALESCE(NEW.status,'—'), jsonb_build_object('session_id',NEW.id));
  END IF;
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at AND NEW.completed_at IS NOT NULL THEN
    PERFORM public._log_timeline(NEW.lmp_id,'mentor','Session completed', jsonb_build_object('session_id',NEW.id));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_sessions_timeline ON public.sessions;
CREATE TRIGGER tg_sessions_timeline
AFTER INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_timeline();

-- ============ lmp_checklists trigger ============
CREATE OR REPLACE FUNCTION public.tg_lmp_checklists_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.completed IS DISTINCT FROM OLD.completed THEN
    PERFORM public._log_timeline(NEW.lmp_id,'checklist',
      'Checklist '''||NEW.item_key||''' '||CASE WHEN NEW.completed THEN 'completed' ELSE 'unchecked' END,
      jsonb_build_object('item_key',NEW.item_key));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_lmp_checklists_timeline ON public.lmp_checklists;
CREATE TRIGGER tg_lmp_checklists_timeline
AFTER UPDATE ON public.lmp_checklists
FOR EACH ROW EXECUTE FUNCTION public.tg_lmp_checklists_timeline();

-- ============ lmp_daily_logs trigger (progress / no-update) ============
CREATE OR REPLACE FUNCTION public.tg_lmp_daily_logs_timeline()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE ptype text; kind text;
BEGIN
  ptype := COALESCE(NEW.metadata->>'progress_type', '');
  kind  := CASE WHEN ptype = 'no_update' THEN 'no-update' ELSE 'progress' END;
  PERFORM public._log_timeline(NEW.lmp_id, kind, COALESCE(NEW.text,''),
    jsonb_build_object('chips', to_jsonb(NEW.chips), 'daily_log_id', NEW.id, 'source','daily_log'));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_lmp_daily_logs_timeline ON public.lmp_daily_logs;
CREATE TRIGGER tg_lmp_daily_logs_timeline
AFTER INSERT ON public.lmp_daily_logs
FOR EACH ROW EXECUTE FUNCTION public.tg_lmp_daily_logs_timeline();

-- Enable realtime for lmp_timeline
ALTER PUBLICATION supabase_realtime ADD TABLE public.lmp_timeline;
