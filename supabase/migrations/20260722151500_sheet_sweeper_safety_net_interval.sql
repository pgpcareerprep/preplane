-- sheets-retry-sweeper was polling every 2 minutes (720 invocations/day)
-- even when sheet_write_queue was empty. It doesn't need to: every
-- single-row write path already dispatches immediately —
-- enqueue_lmp_sheet_mirror_by_id(), tg_lmp_process_delete_sheet_sync(), and
-- enqueue_lmp_sheet_reconcile() all call
-- public.dispatch_sheet_retry_sweeper(v_queue_id) (net.http_post straight to
-- this function with the specific queue_id) right after inserting the row.
-- A separate Database Webhook on sheet_write_queue INSERT would just fire a
-- second, redundant call alongside that existing dispatch — and would flood
-- the function with one call per row during enqueue_all_lmp_sheet_mirrors()
-- (the bulk admin resync), which deliberately relies on this cron sweep to
-- drain gradually instead of firing hundreds of calls at once.
--
-- So this cron job is already just the backlog/failure safety net, not the
-- primary dispatch path. Slow it down accordingly: sheets-retry-sweeper's own
-- backoffSeconds() caps at 480s (30s * 2^(MAX_ATTEMPTS-1), MAX_ATTEMPTS=5)
-- before a row gives up, so a 15-minute sweep still finds every retryable row
-- well before its next_retry_at would otherwise go stale.
DO $$ BEGIN PERFORM cron.unschedule('sheets-retry-sweeper'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'sheets-retry-sweeper',
  '*/15 * * * *',
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
