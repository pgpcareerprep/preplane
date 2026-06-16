-- Make LMP sheet queue jobs explicit about the canonical tracker contract:
-- row 14 is the header row, row 15 is the first data row, and LMP ID is the
-- only sheet identity. Also surface missing lmp_code as a failed queue row
-- instead of silently skipping the mirror request.

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
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF COALESCE(v_lmp.lmp_code, '') = '' THEN
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
        'lmp_code', NULL,
        'dbPatch', to_jsonb(v_lmp)
      ),
      'failed', now(), p_reason, 'LMP_CODE_MISSING: cannot mirror LMP without generated LMP ID',
      'lmp:' || v_lmp.id::text || ':sync', v_lmp.id, 0, 0
    )
    ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
    DO UPDATE SET
      payload = EXCLUDED.payload,
      status = 'failed',
      last_error = EXCLUDED.last_error,
      updated_at = now();
    RETURN;
  END IF;

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'lmp_processes'
      AND t.tgname = 'trg_assign_lmp_code'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'MISSING_LMP_CODE_TRIGGER: trg_assign_lmp_code must run before sheet enqueue';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
