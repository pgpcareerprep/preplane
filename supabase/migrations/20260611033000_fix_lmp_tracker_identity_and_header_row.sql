-- Make row 14 / AA (LMP ID) the authoritative LMP Tracker identity contract.
-- This migration changes queue metadata only; it never mutates Google Sheet data.

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
      'headerRow', 14,
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
  IF COALESCE(OLD.lmp_code, '') = '' THEN
    RAISE WARNING 'tg_lmp_process_delete_sheet_sync skipped LMP % without lmp_code', OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error,
     idempotency_key, entity_id, attempt_count, attempts)
  VALUES (
    'LMP Tracker', 'delete',
    jsonb_build_object(
      'op', 'delete',
      'tab', 'LMP Tracker',
      'headerRow', 14,
      'id', OLD.id::text,
      'findBy', jsonb_build_object('LMP ID', OLD.lmp_code)
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

UPDATE public.sheet_write_queue
SET payload = jsonb_set(payload, '{headerRow}', '14'::jsonb, true),
    updated_at = now()
WHERE tab_name = 'LMP Tracker'
  AND status IN ('pending', 'failed')
  AND COALESCE(payload->>'headerRow', '') <> '14';

COMMENT ON FUNCTION public.enqueue_lmp_sheet_mirror_by_id(uuid, text) IS
  'Enqueues exact LMP-ID DB-to-Sheet sync using canonical tracker header row 14.';
COMMENT ON FUNCTION public.tg_lmp_process_delete_sheet_sync() IS
  'Enqueues safe Sheet deletion by immutable lmp_code only; never Company+Role.';
