-- =============================================================================
-- Vault-backed cron/trigger URLs and anon key
--
-- Touches:
--   Cron jobs:
--     1. sheets-retry-sweeper       (*/2 * * * *)
--     2. progress-reminder-daily    (*/5 * * * *)
--     3. embed-sync-daily           (0 2 * * *)
--
--   DB functions (trigger / immediate dispatch):
--     4. public.dispatch_sheet_retry_sweeper(uuid)
--     5. public.trigger_embed_sync()
--
--   Triggers using trigger_embed_sync() (unchanged wiring):
--     - lmp_processes, students, poc_profiles, mentors, alumni_records, lmp_daily_logs
--
-- Bootstrap secrets once; live jobs/functions read vault.decrypted_secrets at call time.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Vault secrets (idempotent)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'project_url') THEN
    PERFORM vault.create_secret(
      'https://sgqwnjajvgjcwqergnsr.supabase.co',
      'project_url',
      'Supabase project base URL for pg_cron jobs and DB trigger HTTP calls'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'anon_key') THEN
    PERFORM vault.create_secret(
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4',
      'anon_key',
      'Supabase anon JWT for pg_cron jobs and DB trigger HTTP gateway auth'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. dispatch_sheet_retry_sweeper(uuid) — immediate sheet queue dispatch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_sheet_retry_sweeper(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_token        text;
  v_project_url  text;
  v_anon_key     text;
BEGIN
  SELECT decrypted_secret INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'anon_key'
  LIMIT 1;

  SELECT token INTO v_token FROM public._internal_cron_auth LIMIT 1;

  IF COALESCE(v_project_url, '') = '' OR COALESCE(v_anon_key, '') = '' THEN
    RAISE WARNING 'dispatch_sheet_retry_sweeper: vault project_url or anon_key unavailable';
    RETURN;
  END IF;

  IF COALESCE(v_token, '') = '' THEN
    RAISE WARNING 'dispatch_sheet_retry_sweeper: internal secret unavailable';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/sheets-retry-sweeper',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'x-internal-secret', v_token
    ),
    body := jsonb_build_object('source', 'sheet_write_queue', 'queue_id', p_queue_id, 'time', now())
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_sheet_retry_sweeper failed for queue %: %', p_queue_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_sheet_retry_sweeper(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_sheet_retry_sweeper(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. trigger_embed_sync() — embed sync on INSERT/UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_embed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_project_url  text;
  v_anon_key     text;
  v_cron_token   text;
  v_payload      jsonb;
BEGIN
  SELECT decrypted_secret INTO v_project_url
  FROM vault.decrypted_secrets
  WHERE name = 'project_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_anon_key
  FROM vault.decrypted_secrets
  WHERE name = 'anon_key'
  LIMIT 1;

  SELECT token INTO v_cron_token FROM public._internal_cron_auth WHERE id = 't' LIMIT 1;

  IF COALESCE(v_project_url, '') = '' OR COALESCE(v_anon_key, '') = '' THEN
    RAISE WARNING 'trigger_embed_sync: vault project_url or anon_key unavailable for %', TG_TABLE_NAME;
    RETURN NEW;
  END IF;

  v_payload := jsonb_build_object(
    'op',     'sync-record',
    'table',  TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );

  PERFORM net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/embed-sync',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'apikey',          v_anon_key,
      'Authorization',   'Bearer ' || v_anon_key,
      'x-embed-trigger', COALESCE(v_cron_token, '')
    ),
    body := v_payload
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_embed_sync failed for %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NEW;
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_embed_sync() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Drop any cron jobs still pointing at the retired project ref
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE command LIKE '%yhzcheqjzmikeczzoeih%';

-- ---------------------------------------------------------------------------
-- 5. Reschedule live cron jobs (Vault-backed URLs and anon key)
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM cron.unschedule('sheets-retry-sweeper'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'sheets-retry-sweeper',
  '*/2 * * * *',
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

    PERFORM net.http_post(
      url := rtrim(v_project_url, '/') || '/functions/v1/sheets-retry-sweeper',
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

DO $$ BEGIN PERFORM cron.unschedule('embed-sync-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'embed-sync-daily',
  '0 2 * * *',
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
    SELECT token INTO v_token FROM public._internal_cron_auth WHERE id = 't' LIMIT 1;

    PERFORM net.http_post(
      url := rtrim(v_project_url, '/') || '/functions/v1/embed-sync',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'apikey',          v_anon_key,
        'x-embed-trigger', COALESCE(v_token, '')
      ),
      body := '{}'::jsonb
    );
  END;
  $body$ LANGUAGE plpgsql;
  $cron$
);

-- ---------------------------------------------------------------------------
-- 6. Final guard — fail migration if stale project ref remains in cron commands
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE command LIKE '%yhzcheqjzmikeczzoeih%'
  ) THEN
    RAISE EXCEPTION 'cron.job still contains stale project ref yhzcheqjzmikeczzoeih';
  END IF;
END $$;
