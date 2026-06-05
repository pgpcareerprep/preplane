CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payload     jsonb;
  v_db_patch    jsonb;
  v_op          text;
  v_lmp_code    text;
  v_anon_key    text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q';
BEGIN
  IF COALESCE(NEW.sync_source, '') = 'sheet' THEN
    RETURN NEW;
  END IF;

  v_op       := CASE TG_OP WHEN 'INSERT' THEN 'insert' ELSE 'update' END;
  v_lmp_code := NEW.lmp_code;

  IF NEW.company IS NULL OR NEW.company = '' OR NEW.role IS NULL OR NEW.role = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
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
       AND NEW.final_convert      IS NOT DISTINCT FROM OLD.final_convert
       AND NEW.convert_names      IS NOT DISTINCT FROM OLD.convert_names
       AND NEW.prep_doc           IS NOT DISTINCT FROM OLD.prep_doc
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
       AND NEW.lmp_code           IS NOT DISTINCT FROM OLD.lmp_code
    THEN
      RETURN NEW;
    END IF;
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
    'final_convert',       NEW.final_convert,
    'convert_names',       NEW.convert_names,
    'prep_doc',            NEW.prep_doc,
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
    'lmp_code',            NEW.lmp_code,
    'date',                NEW.date
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

  -- Enqueue for retry safety net (sweeper picks it up if instant call fails)
  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error)
  VALUES
    ('LMP Tracker', v_op, v_payload, 'pending', now() + interval '60 seconds', 'db_trigger', NULL);

  -- Fire instant sync to sheets-lmp (non-blocking via pg_net)
  BEGIN
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
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'enqueue_lmp_sheet_mirror http_post failed: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror failed: %', SQLERRM;
  RETURN NEW;
END;
$function$;