-- pg_cron schedules for edge functions
-- G4: embed-sync daily at 2 AM UTC
-- G5: progress-reminder-cron daily at 8 AM UTC

-- Remove stale schedules before re-creating so re-running is idempotent.
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname IN ('embed-sync-daily', 'progress-reminder-daily');

-- G4: embed-sync — bypasses requireAuth via x-embed-trigger header (token from _internal_cron_auth)
SELECT cron.schedule(
  'embed-sync-daily',
  '0 2 * * *',
  $cron$
  DO $body$
  DECLARE
    v_token text;
  BEGIN
    SELECT token INTO v_token FROM public._internal_cron_auth WHERE id = 't' LIMIT 1;
    PERFORM net.http_post(
      url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/embed-sync',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'apikey',          'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4',
        'x-embed-trigger', COALESCE(v_token, '')
      ),
      body    := '{}'::jsonb
    );
  END;
  $body$ LANGUAGE plpgsql;
  $cron$
);

-- G5: progress-reminder-cron — no JWT check inside the function; anon key satisfies gateway
SELECT cron.schedule(
  'progress-reminder-daily',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/progress-reminder-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey',       'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);
