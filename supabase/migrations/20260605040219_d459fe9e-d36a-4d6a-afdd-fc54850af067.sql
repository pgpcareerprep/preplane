-- 1) Use canonical [YYYY-MM-DD HH:MM] Name: body stamp so app-pushed comments
--    round-trip identically with sheet-typed lines (drawer can de-dupe by body).
CREATE OR REPLACE FUNCTION public.post_lmp_comment(
  _lmp_id uuid,
  _author_name text,
  _author_initials text,
  _author_color text,
  _body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _trimmed text := btrim(_body);
  _now timestamptz := now();
  _local timestamptz := _now AT TIME ZONE 'Asia/Kolkata';
  _stamp text;
  _prev text;
  _next text;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _trimmed = '' THEN RAISE EXCEPTION 'Empty comment'; END IF;

  INSERT INTO public.lmp_comments(
    lmp_id, author_user_id, author_name, author_initials, author_color, body, source, ts
  ) VALUES (
    _lmp_id, _uid, _author_name, _author_initials, _author_color, _trimmed, 'app', _now
  )
  RETURNING id INTO _new_id;

  _stamp := '[' || to_char(_local, 'YYYY-MM-DD HH24:MI') || '] '
            || _author_name || ': ' || _trimmed;

  SELECT comments INTO _prev FROM public.lmp_processes WHERE id = _lmp_id;
  _next := CASE WHEN coalesce(_prev,'') = '' THEN _stamp ELSE _prev || E'\n' || _stamp END;

  UPDATE public.lmp_processes
     SET comments = _next, sync_source = 'app', updated_at = _now
   WHERE id = _lmp_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_lmp_comment(uuid, text, text, text, text) TO authenticated;

-- 2) Include `comments` in the sheet-mirror trigger so UI comments reach Column Z.
CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload     jsonb;
  v_db_patch    jsonb;
  v_lmp_code    text;
  v_anon_key    text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q';
BEGIN
  IF COALESCE(NEW.sync_source, '') IN ('sheet', 'trigger_mirror') THEN
    RETURN NEW;
  END IF;

  IF NEW.company IS NULL OR NEW.company = '' OR NEW.role IS NULL OR NEW.role = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    RETURN NEW;
  END IF;

  v_lmp_code := NEW.lmp_code;

  IF NEW.status                IS NOT DISTINCT FROM OLD.status
     AND NEW.domain_raw        IS NOT DISTINCT FROM OLD.domain_raw
     AND NEW.type              IS NOT DISTINCT FROM OLD.type
     AND NEW.daily_progress    IS NOT DISTINCT FROM OLD.daily_progress
     AND NEW.prep_doc_shared   IS NOT DISTINCT FROM OLD.prep_doc_shared
     AND NEW.mentor_aligned    IS NOT DISTINCT FROM OLD.mentor_aligned
     AND NEW.assignment_review IS NOT DISTINCT FROM OLD.assignment_review
     AND NEW.one_to_one_mock   IS NOT DISTINCT FROM OLD.one_to_one_mock
     AND NEW.next_progress_date IS NOT DISTINCT FROM OLD.next_progress_date
     AND NEW.next_progress_type IS NOT DISTINCT FROM OLD.next_progress_type
     AND NEW.r1_shortlisted     IS NOT DISTINCT FROM OLD.r1_shortlisted
     AND NEW.r2_shortlisted     IS NOT DISTINCT FROM OLD.r2_shortlisted
     AND NEW.r3_shortlisted     IS NOT DISTINCT FROM OLD.r3_shortlisted
     AND NEW.final_convert      IS NOT DISTINCT FROM OLD.final_convert
     AND NEW.convert_names      IS NOT DISTINCT FROM OLD.convert_names
     AND NEW.prep_doc           IS NOT DISTINCT FROM OLD.prep_doc
     AND NEW.prep_doc_link      IS NOT DISTINCT FROM OLD.prep_doc_link
     AND NEW.prep_poc           IS NOT DISTINCT FROM OLD.prep_poc
     AND NEW.support_poc        IS NOT DISTINCT FROM OLD.support_poc
     AND NEW.outreach_poc       IS NOT DISTINCT FROM OLD.outreach_poc
     AND NEW.closing_date       IS NOT DISTINCT FROM OLD.closing_date
     AND NEW.jd_url             IS NOT DISTINCT FROM OLD.jd_url
     AND NEW.jd_label           IS NOT DISTINCT FROM OLD.jd_label
     AND NEW.allocator          IS NOT DISTINCT FROM OLD.allocator
     AND NEW.admin_owner        IS NOT DISTINCT FROM OLD.admin_owner
     AND NEW.behavioral_status  IS NOT DISTINCT FROM OLD.behavioral_status
     AND NEW.match_tag          IS NOT DISTINCT FROM OLD.match_tag
     AND NEW.allocation_path    IS NOT DISTINCT FROM OLD.allocation_path
     AND NEW.mentor_selected    IS NOT DISTINCT FROM OLD.mentor_selected
     AND NEW.mentor_rating      IS NOT DISTINCT FROM OLD.mentor_rating
     AND NEW.lmp_code           IS NOT DISTINCT FROM OLD.lmp_code
     AND NEW.comments           IS NOT DISTINCT FROM OLD.comments
  THEN
    RETURN NEW;
  END IF;

  v_db_patch := jsonb_build_object(
    'status',              NEW.status,
    'domain_raw',          NEW.domain_raw,
    'type',                NEW.type,
    'daily_progress',      NEW.daily_progress,
    'prep_doc_shared',     NEW.prep_doc_shared,
    'mentor_aligned',      NEW.mentor_aligned,
    'assignment_review',   NEW.assignment_review,
    'one_to_one_mock',     NEW.one_to_one_mock,
    'next_progress_date',  NEW.next_progress_date,
    'next_progress_type',  NEW.next_progress_type,
    'r1_shortlisted',      NEW.r1_shortlisted,
    'r2_shortlisted',      NEW.r2_shortlisted,
    'r3_shortlisted',      NEW.r3_shortlisted,
    'final_convert',       NEW.final_convert,
    'convert_names',       NEW.convert_names,
    'prep_doc',            NEW.prep_doc,
    'prep_doc_link',       NEW.prep_doc_link,
    'prep_poc',            NEW.prep_poc,
    'support_poc',         NEW.support_poc,
    'outreach_poc',        NEW.outreach_poc,
    'closing_date',        NEW.closing_date,
    'jd_url',              NEW.jd_url,
    'jd_label',            NEW.jd_label,
    'allocator',           NEW.allocator,
    'admin_owner',         NEW.admin_owner,
    'behavioral_status',   NEW.behavioral_status,
    'match_tag',           NEW.match_tag,
    'allocation_path',     NEW.allocation_path,
    'mentor_selected',     NEW.mentor_selected,
    'mentor_rating',       NEW.mentor_rating,
    'lmp_code',            NEW.lmp_code,
    'date',                NEW.date,
    'comments',            NEW.comments
  );

  v_payload := jsonb_build_object(
    'op',        'sync-db-to-sheet',
    'tab',       'LMP Tracker',
    'headerRow', 15,
    'company',   NEW.company,
    'role',      NEW.role,
    'lmp_code',  v_lmp_code,
    'dbPatch',   v_db_patch
  );

  BEGIN
    INSERT INTO public.sheet_write_queue
      (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error)
    VALUES
      ('LMP Tracker', 'sync-db-to-sheet', v_payload, 'pending',
       now() + interval '90 seconds', 'db_trigger', NULL);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_lmp_sheet_mirror queue insert failed: %', SQLERRM;
  END;

  BEGIN
    PERFORM net.http_post(
      url := 'https://yhzcheqjzmikeczzoeih.supabase.co/functions/v1/sheets-lmp',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'apikey', v_anon_key,
        'Authorization', 'Bearer ' || v_anon_key
      ),
      body := v_payload
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_lmp_sheet_mirror immediate http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;