
-- 1) Patch enqueue_lmp_sheet_mirror to also enqueue on INSERT
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

  v_lmp_code := NEW.lmp_code;

  -- On UPDATE, skip when no tracked business column changed.
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
       now() + interval '30 seconds', 'db_trigger', NULL);
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

-- 2) One-shot backfill: enqueue sync-db-to-sheet for every LMP that never made it to the sheet.
INSERT INTO public.sheet_write_queue
  (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error)
SELECT
  'LMP Tracker',
  'sync-db-to-sheet',
  jsonb_build_object(
    'op',        'sync-db-to-sheet',
    'tab',       'LMP Tracker',
    'headerRow', 15,
    'company',   l.company,
    'role',      l.role,
    'lmp_code',  l.lmp_code,
    'dbPatch',   jsonb_build_object(
      'status',              l.status,
      'domain_raw',          l.domain_raw,
      'type',                l.type,
      'daily_progress',      l.daily_progress,
      'prep_doc_shared',     l.prep_doc_shared,
      'mentor_aligned',      l.mentor_aligned,
      'assignment_review',   l.assignment_review,
      'one_to_one_mock',     l.one_to_one_mock,
      'next_progress_date',  l.next_progress_date,
      'next_progress_type',  l.next_progress_type,
      'r1_shortlisted',      l.r1_shortlisted,
      'r2_shortlisted',      l.r2_shortlisted,
      'r3_shortlisted',      l.r3_shortlisted,
      'final_convert',       l.final_convert,
      'convert_names',       l.convert_names,
      'prep_doc',            l.prep_doc,
      'prep_doc_link',       l.prep_doc_link,
      'prep_poc',            l.prep_poc,
      'support_poc',         l.support_poc,
      'outreach_poc',        l.outreach_poc,
      'closing_date',        l.closing_date,
      'jd_url',              l.jd_url,
      'jd_label',            l.jd_label,
      'allocator',           l.allocator,
      'admin_owner',         l.admin_owner,
      'behavioral_status',   l.behavioral_status,
      'match_tag',           l.match_tag,
      'allocation_path',     l.allocation_path,
      'mentor_selected',     l.mentor_selected,
      'mentor_rating',       l.mentor_rating,
      'lmp_code',            l.lmp_code,
      'date',                l.date,
      'comments',            l.comments
    )
  ),
  'pending',
  now(),
  'backfill_missing_sheet_rows',
  NULL
FROM public.lmp_processes l
WHERE l.sheet_row_id IS NULL
  AND COALESCE(l.sync_source, '') NOT IN ('sheet', 'trigger_mirror')
  AND COALESCE(l.company, '') <> ''
  AND COALESCE(l.role, '') <> '';
