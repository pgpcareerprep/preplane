-- Harden internal cron invocations and add future-safe LMP creator attribution.
-- This migration is non-destructive: it does not rewrite existing LMP rows.

ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lmp_processes_created_by
  ON public.lmp_processes(created_by)
  WHERE created_by IS NOT NULL;

COMMENT ON COLUMN public.lmp_processes.created_by IS
  'Authenticated user who created the LMP. Existing rows are intentionally not backfilled automatically.';

CREATE OR REPLACE VIEW public.lmp_creator_attribution_issues
WITH (security_invoker = true)
AS
SELECT
  id,
  lmp_code,
  company,
  role,
  allocator,
  jd_uploaded_by,
  created_at,
  CASE
    WHEN lower(coalesce(allocator, '')) IN ('admin', 'allocator', 'poc') THEN 'allocator_contains_role_name'
    WHEN lower(coalesce(jd_uploaded_by, '')) IN ('admin', 'allocator', 'poc') THEN 'jd_uploaded_by_contains_role_name'
    ELSE 'creator_id_missing'
  END AS issue
FROM public.lmp_processes
WHERE created_by IS NULL
   OR lower(coalesce(allocator, '')) IN ('admin', 'allocator', 'poc')
   OR lower(coalesce(jd_uploaded_by, '')) IN ('admin', 'allocator', 'poc');

REVOKE ALL ON public.lmp_creator_attribution_issues FROM anon;
GRANT SELECT ON public.lmp_creator_attribution_issues TO authenticated, service_role;

-- Scheduled functions authenticate with the existing RLS-protected internal token.
DO $$ BEGIN PERFORM cron.unschedule('sheets-retry-sweeper'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'sheets-retry-sweeper',
  '*/2 * * * *',
  $cron$
  DO $body$
  DECLARE
    v_token text;
  BEGIN
    SELECT token INTO v_token FROM public._internal_cron_auth LIMIT 1;
    PERFORM net.http_post(
      url     := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/sheets-retry-sweeper',
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

DO $$ BEGIN PERFORM cron.unschedule('progress-reminder-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'progress-reminder-daily',
  '0 8 * * *',
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
