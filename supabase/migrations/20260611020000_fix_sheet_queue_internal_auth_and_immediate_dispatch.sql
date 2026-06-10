-- Repair DB-to-Sheet queue dispatch without weakening application-level auth.
-- Queue rows remain durable; immediate worker invocation is best-effort and
-- the existing cron remains the retry fallback.

CREATE OR REPLACE FUNCTION public.dispatch_sheet_retry_sweeper()
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
    body := jsonb_build_object('source', 'sheet_write_queue', 'time', now())
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch_sheet_retry_sweeper failed: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_sheet_retry_sweeper() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_sheet_retry_sweeper() TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_by_id(p_lmp_id uuid, p_reason text DEFAULT 'related_lmp_action')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp public.lmp_processes%ROWTYPE;
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
    updated_at = now();

  PERFORM public.dispatch_sheet_retry_sweeper();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_by_id failed for %: %', p_lmp_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_lmp_sheet_mirror_by_id(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_lmp_sheet_mirror_by_id(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.sync_source, '') IN ('sheet', 'trigger_mirror') THEN RETURN NEW; END IF;
  PERFORM public.enqueue_lmp_sheet_mirror_by_id(NEW.id, 'lmp_process_change');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_related_lmp_sheet_mirror()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
BEGIN
  v_lmp_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.lmp_id ELSE NEW.lmp_id END;
  PERFORM public.enqueue_lmp_sheet_mirror_by_id(v_lmp_id, TG_TABLE_NAME || ':' || lower(TG_OP));
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  v_table text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'lmp_candidates', 'lmp_checklists', 'lmp_daily_logs', 'lmp_mentors', 'lmp_poc_links', 'sessions'
  ]
  LOOP
    IF to_regclass('public.' || v_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_enqueue_related_lmp_sheet_mirror ON public.%I', v_table);
      EXECUTE format(
        'CREATE TRIGGER trg_enqueue_related_lmp_sheet_mirror AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enqueue_related_lmp_sheet_mirror()',
        v_table
      );
    END IF;
  END LOOP;
END
$$;

-- Existing delete trigger remains authoritative and uses immutable LMP ID.
CREATE OR REPLACE FUNCTION public.tg_lmp_process_delete_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    attempts = 0, attempt_count = 0, updated_at = now();
  PERFORM public.dispatch_sheet_retry_sweeper();
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_lmp_process_delete_sheet_sync failed: %', SQLERRM;
  RETURN OLD;
END;
$$;

-- Reset only the known authentication failures; no queue/data rows are deleted.
-- If a newer pending row already owns the idempotency key, refresh that row
-- and retain the failed row as an auditable superseded record.
DO $$
DECLARE
  v_failed public.sheet_write_queue%ROWTYPE;
  v_pending_id uuid;
BEGIN
  FOR v_failed IN
    SELECT * FROM public.sheet_write_queue
    WHERE status = 'failed' AND last_error ILIKE '%Invalid JWT%'
    ORDER BY id
  LOOP
    v_pending_id := NULL;
    IF v_failed.idempotency_key IS NOT NULL THEN
      SELECT id INTO v_pending_id
      FROM public.sheet_write_queue
      WHERE status = 'pending'
        AND idempotency_key = v_failed.idempotency_key
        AND id <> v_failed.id
      ORDER BY id DESC
      LIMIT 1;
    END IF;

    IF v_pending_id IS NULL THEN
      UPDATE public.sheet_write_queue
      SET status = 'pending', attempts = 0, attempt_count = 0, last_error = NULL,
          next_retry_at = now(), completed_at = NULL, updated_at = now()
      WHERE id = v_failed.id;
    ELSE
      UPDATE public.sheet_write_queue
      SET payload = v_failed.payload, attempts = 0, attempt_count = 0,
          last_error = NULL, next_retry_at = now(), completed_at = NULL, updated_at = now()
      WHERE id = v_pending_id;
      UPDATE public.sheet_write_queue
      SET last_error = 'superseded_by_pending_retry:' || v_pending_id::text,
          updated_at = now()
      WHERE id = v_failed.id;
    END IF;
  END LOOP;
END
$$;

SELECT public.dispatch_sheet_retry_sweeper();

COMMENT ON FUNCTION public.dispatch_sheet_retry_sweeper() IS
  'Best-effort immediate Sheet queue drain using the protected internal secret; cron remains fallback.';
