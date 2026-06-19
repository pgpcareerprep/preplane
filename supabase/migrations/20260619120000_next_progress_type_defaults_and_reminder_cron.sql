-- Next Progress Type: remove DB defaults, backfill legacy Follow-up values, reschedule reminder cron.

ALTER TABLE public.lmp_processes
  ALTER COLUMN next_progress_type DROP DEFAULT;

ALTER TABLE public.lmp_processes
  ALTER COLUMN next_progress_reminder_type DROP DEFAULT;

ALTER TABLE public.lmp_processes
  ALTER COLUMN next_progress_status DROP DEFAULT;

-- Clear legacy default-only Follow-up values when no date is set.
UPDATE public.lmp_processes
SET
  next_progress_type = NULL,
  next_progress_reminder_type = NULL
WHERE next_progress_date IS NULL
  AND (
    lower(regexp_replace(trim(coalesce(next_progress_type, '')), '\s+', ' ', 'g')) IN ('follow-up', 'follow up')
    OR lower(regexp_replace(trim(coalesce(next_progress_reminder_type, '')), '\s+', ' ', 'g')) IN ('follow-up', 'follow up')
  );

-- Normalize legacy Follow-up spellings when a real next progress date exists.
UPDATE public.lmp_processes
SET
  next_progress_type = 'Follow - Up',
  next_progress_reminder_type = 'Follow - Up'
WHERE next_progress_date IS NOT NULL
  AND (
    lower(regexp_replace(trim(coalesce(next_progress_type, '')), '\s+', ' ', 'g')) IN ('follow-up', 'follow up')
    OR lower(regexp_replace(trim(coalesce(next_progress_reminder_type, '')), '\s+', ' ', 'g')) IN ('follow-up', 'follow up')
  );

UPDATE public.lmp_processes
SET next_progress_status = NULL
WHERE next_progress_date IS NULL;

-- Run progress-reminder-cron every 5 minutes; function-level schedule gate still applies.
DO $$ BEGIN PERFORM cron.unschedule('progress-reminder-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'progress-reminder-daily',
  '*/5 * * * *',
  $cron$
  DO $body$
  DECLARE
    v_token text;
  BEGIN
    SELECT token INTO v_token FROM public._internal_cron_auth LIMIT 1;
    PERFORM net.http_post(
      url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/progress-reminder-cron',
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'apikey',            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4',
        'x-internal-secret', COALESCE(v_token, '')
      ),
      body := jsonb_build_object('time', now())
    );
  END;
  $body$ LANGUAGE plpgsql;
  $cron$
);
