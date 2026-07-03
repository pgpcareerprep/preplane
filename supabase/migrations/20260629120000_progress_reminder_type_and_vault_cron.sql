-- Progress reminder: store next progress type on reminder rows; re-apply vault-backed cron.

ALTER TABLE public.lmp_progress_reminders
  ADD COLUMN IF NOT EXISTS reminder_type text;

COMMENT ON COLUMN public.lmp_progress_reminders.reminder_type IS
  'Next progress type (e.g. Follow - Up, Interview) at schedule time';

-- Backfill type from LMP for existing pending reminders.
UPDATE public.lmp_progress_reminders r
SET reminder_type = COALESCE(p.next_progress_reminder_type, p.next_progress_type)
FROM public.lmp_processes p
WHERE r.lmp_id = p.id
  AND r.reminder_type IS NULL
  AND COALESCE(p.next_progress_reminder_type, p.next_progress_type) IS NOT NULL;

-- Re-apply vault-backed progress-reminder cron (guards against hardcoded URL regressions).
DO $$ BEGIN PERFORM cron.unschedule('progress-reminder-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'progress-reminder-daily',
  '*/5 * * * *',
  $cron$
  DO $body$
  DECLARE
    v_token       text;
    v_project_url text;
    v_anon_key    text;
  BEGIN
    SELECT decrypted_secret INTO v_project_url
    FROM vault.decrypted_secrets WHERE name = 'project_url' LIMIT 1;
    SELECT decrypted_secret INTO v_anon_key
    FROM vault.decrypted_secrets WHERE name = 'anon_key' LIMIT 1;
    SELECT token INTO v_token FROM public._internal_cron_auth LIMIT 1;

    IF COALESCE(v_project_url, '') = '' OR COALESCE(v_anon_key, '') = '' THEN
      RAISE WARNING 'progress-reminder-daily: vault project_url or anon_key unavailable';
      RETURN;
    END IF;

    PERFORM net.http_post(
      url := rtrim(v_project_url, '/') || '/functions/v1/progress-reminder-cron',
      headers := jsonb_build_object(
        'Content-Type',      'application/json',
        'apikey',            v_anon_key,
        'x-internal-secret', COALESCE(v_token, '')
      ),
      body := jsonb_build_object('time', now())
    );
  END;
  $body$ LANGUAGE plpgsql;
  $cron$
);
