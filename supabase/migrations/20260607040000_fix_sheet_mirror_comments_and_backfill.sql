-- Fix 1: Restore `comments` in enqueue_lmp_sheet_mirror (it was dropped by
--         20260607030000 which also correctly fixed the Supabase URL).
--         Re-applies the full correct function with: correct URL, correct key,
--         comments in guard + dbPatch, and r1/r2/r3 counts included.
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
  v_anon_key    text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4';
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
      url := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/sheets-lmp',
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

-- Fix 2: Backfill r1/r2/r3 counts for all existing lmp_processes rows.
--        Forces the sheet sync to fire with current candidate counts.
UPDATE public.lmp_processes lp
SET
  r1_shortlisted = CASE WHEN counts.r1 > 0 THEN counts.r1::text ELSE NULL END,
  r2_shortlisted = CASE WHEN counts.r2 > 0 THEN counts.r2::text ELSE NULL END,
  r3_shortlisted = CASE WHEN counts.r3 > 0 THEN counts.r3::text ELSE NULL END,
  updated_at     = now()
FROM (
  SELECT
    lmp_id,
    count(*) FILTER (WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r1','r1_shortlisted','shortlisted','round_1','round1'])) AS r1,
    count(*) FILTER (WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r2','r2_shortlisted','round_2','round2'])) AS r2,
    count(*) FILTER (WHERE lower(COALESCE(pipeline_stage,'')) = ANY (ARRAY['r3','r3_shortlisted','round_3','round3'])) AS r3
  FROM public.lmp_candidates
  GROUP BY lmp_id
) counts
WHERE lp.id = counts.lmp_id;
