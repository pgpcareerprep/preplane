-- =============================================================================
-- CRON URL FIX — replace stale project ref in all live cron jobs and DB functions
--
-- Old (dead) project: yhzcheqjzmikeczzoeih
-- New (live) project: sgqwnjajvgjcwqergnsr
-- Anon key (sgqwnjajvgjcwqergnsr):
--   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6
--   InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4
--   NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4
--
-- Jobs fixed:
--   1. sheets-retry-sweeper       (was 20260529092513, every 2 min)
--   2. progress-reminder-daily    (was 20260507140900, 5:30 UTC → now 8:00 UTC)
--   3. embed-sync-daily           (was 20260609100000, 2:00 UTC, ensure applied)
--
-- DB functions fixed:
--   4. trigger_embed_sync()       (was 20260604085925)
--
-- reconcile-poc-entity-registry investigation:
--   5. Harden function + re-grant EXECUTE so the cron never fails silently
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. sheets-retry-sweeper  (every 2 minutes)
--    Drains sheet_write_queue; needs only apikey + Authorization at the gateway.
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM cron.unschedule('sheets-retry-sweeper'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'sheets-retry-sweeper',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/sheets-retry-sweeper',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4'
    ),
    body    := concat('{"time":"', now(), '"}')::jsonb
  );
  $cron$
);

-- ---------------------------------------------------------------------------
-- 2. progress-reminder-daily  (08:00 UTC = 13:30 IST)
--    No requireAuth in the function body — anon key satisfies the JWT gateway.
--    Changing from the original 05:30 UTC to 08:00 UTC per G5 spec.
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM cron.unschedule('progress-reminder-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'progress-reminder-daily',
  '0 8 * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/progress-reminder-cron',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'apikey',        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4'
    ),
    body    := concat('{"time":"', now(), '"}')::jsonb
  );
  $cron$
);

-- ---------------------------------------------------------------------------
-- 3. embed-sync-daily  (02:00 UTC)
--    Uses x-embed-trigger token (from _internal_cron_auth) to bypass requireAuth.
--    This supersedes 20260609100000_cron_schedules.sql to ensure the job is live
--    with the correct URL even if that migration was not yet applied.
-- ---------------------------------------------------------------------------
SELECT cron.unschedule(jobname)
FROM cron.job
WHERE jobname = 'embed-sync-daily';

SELECT cron.schedule(
  'embed-sync-daily',
  '0 2 * * *',
  $cron$
  DO $body$
  DECLARE
    v_token   text;
    v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4';
  BEGIN
    SELECT token INTO v_token FROM public._internal_cron_auth WHERE id = 't' LIMIT 1;
    PERFORM net.http_post(
      url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/embed-sync',
      headers := jsonb_build_object(
        'Content-Type',    'application/json',
        'apikey',          v_anon_key,
        'x-embed-trigger', COALESCE(v_token, '')
      ),
      body    := '{}'::jsonb
    );
  END;
  $body$ LANGUAGE plpgsql;
  $cron$
);

-- ---------------------------------------------------------------------------
-- 4. Fix trigger_embed_sync() — the DB trigger function called on INSERT/UPDATE
--    to lmp_processes, students, poc_profiles, mentors, alumni_records, lmp_daily_logs.
--    Was hardcoded to yhzcheqjzmikeczzoeih in 20260604085925.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trigger_embed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4';
  v_cron_token text;
  v_payload    jsonb;
BEGIN
  SELECT token INTO v_cron_token FROM public._internal_cron_auth WHERE id = 't' LIMIT 1;

  v_payload := jsonb_build_object(
    'op',     'sync-record',
    'table',  TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );

  PERFORM net.http_post(
    url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/embed-sync',
    headers := jsonb_build_object(
      'Content-Type',    'application/json',
      'apikey',          v_anon_key,
      'Authorization',   'Bearer ' || v_anon_key,
      'x-embed-trigger', COALESCE(v_cron_token, '')
    ),
    body    := v_payload
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_embed_sync failed for %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NEW;
END;
$$;

-- Re-grant to authenticated + service_role (20260605080220 revoked from public).
GRANT EXECUTE ON FUNCTION public.trigger_embed_sync() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Harden reconcile_poc_entity_registry()
--
--    Diagnosis: most likely failure mode after 20260605080220 revoked EXECUTE
--    from the PUBLIC pseudo-role — the cron worker may run as a role that no
--    longer has EXECUTE.  Re-grant to postgres + supabase_admin explicitly.
--    Also wrap the audit INSERT in its own EXCEPTION block so a schema change
--    in sheet_sync_events can never abort an otherwise-successful reconcile.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_poc_entity_registry()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted  int := 0;
  v_upserted int := 0;
  v_total    int := 0;
BEGIN
  -- Remove orphan POC rows.
  DELETE FROM public.entity_registry er
  WHERE er.entity_type = 'poc'
    AND NOT EXISTS (
      SELECT 1 FROM public.poc_profiles p WHERE p.id::text = er.entity_id
    );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Upsert from canonical source.
  INSERT INTO public.entity_registry
    (entity_type, entity_id, display_name, email, domain,
     source_table, source_priority, metadata)
  SELECT
    'poc',
    p.id::text,
    p.name,
    NULLIF(p.email, ''),
    p.primary_domain,
    'poc_profiles',
    80,
    jsonb_build_object(
      'role_type',       p.role_type,
      'active_load',     p.active_load,
      'domain_tags',     p.domain_tags,
      'conversion_rate', p.conversion_rate
    )
  FROM public.poc_profiles p
  WHERE p.name IS NOT NULL AND p.name <> ''
  ON CONFLICT (entity_type, entity_id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    email        = EXCLUDED.email,
    domain       = EXCLUDED.domain,
    metadata     = EXCLUDED.metadata,
    updated_at   = now();
  GET DIAGNOSTICS v_upserted = ROW_COUNT;

  SELECT count(*) INTO v_total
  FROM public.entity_registry WHERE entity_type = 'poc';

  -- Audit trail — wrapped in its own block so a schema drift never aborts the reconcile.
  BEGIN
    INSERT INTO public.sheet_sync_events
      (tab_name, operation, direction, status, field_count, synced_by, fields_synced)
    VALUES
      ('entity_registry', 'reconcile', 'internal', 'success',
       v_deleted + v_upserted, 'cron',
       jsonb_build_object(
         'deleted',     v_deleted,
         'upserted',    v_upserted,
         'total_after', v_total
       ));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'reconcile_poc_entity_registry: audit INSERT failed: %', SQLERRM;
  END;

  RETURN jsonb_build_object(
    'deleted',     v_deleted,
    'upserted',    v_upserted,
    'total_after', v_total,
    'ran_at',      now()
  );
END;
$$;

-- Ensure the cron worker can call this regardless of which role pg_cron uses.
GRANT EXECUTE ON FUNCTION public.reconcile_poc_entity_registry()
  TO postgres, authenticated, service_role;

-- Recreate the cron schedule (idempotent).
DO $$ BEGIN PERFORM cron.unschedule('reconcile-poc-entity-registry'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'reconcile-poc-entity-registry',
  '*/15 * * * *',
  $$ SELECT public.reconcile_poc_entity_registry(); $$
);

-- ---------------------------------------------------------------------------
-- Verification queries (run manually after migration to confirm correctness):
--
--   SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
--
--   SELECT jobid, jobname, start_time, end_time, status, return_message
--   FROM cron.job_run_details
--   WHERE jobname IN (
--     'sheets-retry-sweeper',
--     'progress-reminder-daily',
--     'embed-sync-daily',
--     'reconcile-poc-entity-registry'
--   )
--   ORDER BY start_time DESC
--   LIMIT 20;
--
--   -- Confirm no old URL remains in any live cron command:
--   SELECT jobname, command
--   FROM cron.job
--   WHERE command LIKE '%yhzcheqjzmikeczzoeih%';
-- ---------------------------------------------------------------------------
