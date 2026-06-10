-- Ensure a new LMP action is mirrored within seconds even when an older queue
-- backlog exists. Immediate dispatch targets the newly enqueued durable row;
-- the cron sweeper continues draining all other pending rows.

CREATE OR REPLACE FUNCTION public.dispatch_sheet_retry_sweeper(p_queue_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNncXduamFqdmdqY3dxZXJnbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODI4NTYsImV4cCI6MjA5NTk1ODg1Nn0.Wp_S69FO8IwZVog5VpPx2uS4ARdH6ZNiRlMEufmZxi4';
BEGIN
  SELECT token INTO v_token FROM public._internal_cron_auth LIMIT 1;
  IF COALESCE(v_token, '') = '' THEN
    RAISE WARNING 'dispatch_sheet_retry_sweeper: internal secret unavailable';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://sgqwnjajvgjcwqergnsr.supabase.co/functions/v1/sheets-retry-sweeper',
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

CREATE OR REPLACE FUNCTION public.dispatch_sheet_retry_sweeper()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.dispatch_sheet_retry_sweeper(NULL::uuid)
$$;

REVOKE ALL ON FUNCTION public.dispatch_sheet_retry_sweeper(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dispatch_sheet_retry_sweeper() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_sheet_retry_sweeper(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.dispatch_sheet_retry_sweeper() TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_by_id(p_lmp_id uuid, p_reason text DEFAULT 'related_lmp_action')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp public.lmp_processes%ROWTYPE;
  v_queue_id uuid;
BEGIN
  SELECT * INTO v_lmp FROM public.lmp_processes WHERE id = p_lmp_id;
  IF NOT FOUND OR COALESCE(v_lmp.lmp_code, '') = '' THEN RETURN; END IF;

  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error,
     idempotency_key, entity_id, attempt_count, attempts)
  VALUES (
    'LMP Tracker',
    'sync-db-to-sheet',
    jsonb_build_object(
      'op', 'sync-db-to-sheet',
      'tab', 'LMP Tracker',
      'headerRow', 15,
      'company', v_lmp.company,
      'role', v_lmp.role,
      'lmp_code', v_lmp.lmp_code,
      'dbPatch', to_jsonb(v_lmp)
    ),
    'pending', now(), p_reason, NULL,
    'lmp:' || v_lmp.id::text || ':sync', v_lmp.id, 0, 0
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET
    payload = EXCLUDED.payload,
    next_retry_at = now(),
    last_error = NULL,
    attempts = 0,
    attempt_count = 0,
    updated_at = now()
  RETURNING id INTO v_queue_id;

  PERFORM public.dispatch_sheet_retry_sweeper(v_queue_id);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_by_id failed for %: %', p_lmp_id, SQLERRM;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_lmp_process_delete_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue_id uuid;
BEGIN
  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error,
     idempotency_key, entity_id, attempt_count, attempts)
  VALUES (
    'LMP Tracker', 'delete',
    jsonb_build_object(
      'op', 'delete',
      'tab', 'LMP Tracker',
      'headerRow', 15,
      'id', OLD.id::text,
      'findBy', jsonb_build_object('LMP ID', COALESCE(OLD.lmp_code, OLD.id::text))
    ),
    'pending', now(), 'lmp_process_delete', NULL,
    'lmp:' || OLD.id::text || ':delete', OLD.id, 0, 0
  )
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET payload = EXCLUDED.payload, next_retry_at = now(), last_error = NULL,
    attempts = 0, attempt_count = 0, updated_at = now()
  RETURNING id INTO v_queue_id;

  PERFORM public.dispatch_sheet_retry_sweeper(v_queue_id);
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_lmp_process_delete_sheet_sync failed: %', SQLERRM;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.dispatch_sheet_retry_sweeper(uuid) IS
  'Best-effort immediate dispatch for one durable Sheet queue row; cron remains the backlog fallback.';

DO $$
DECLARE
  v_lmp_id uuid;
BEGIN
  SELECT id INTO v_lmp_id
  FROM public.lmp_processes
  WHERE COALESCE(lmp_code, '') <> ''
  ORDER BY updated_at DESC
  LIMIT 1;

  IF v_lmp_id IS NOT NULL THEN
    PERFORM public.enqueue_lmp_sheet_mirror_by_id(v_lmp_id, 'deployment_smoke');
    RAISE NOTICE 'enqueued targeted Sheet sync deployment smoke for LMP %', v_lmp_id;
  END IF;
END
$$;
