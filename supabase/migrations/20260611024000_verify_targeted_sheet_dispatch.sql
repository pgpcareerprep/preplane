-- Verify the targeted immediate-dispatch production smoke completed.

DO $$
DECLARE
  v_lmp_id uuid;
  v_queue_id uuid;
  v_status text;
  v_last_error text;
  v_invalid_jwt integer;
BEGIN
  SELECT id INTO v_lmp_id
  FROM public.lmp_processes
  WHERE COALESCE(lmp_code, '') <> ''
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT id, status, last_error
  INTO v_queue_id, v_status, v_last_error
  FROM public.sheet_write_queue
  WHERE entity_id = v_lmp_id
    AND operation = 'sync-db-to-sheet'
  ORDER BY updated_at DESC
  LIMIT 1;

  SELECT count(*) INTO v_invalid_jwt
  FROM public.sheet_write_queue
  WHERE COALESCE(last_error, '') ILIKE '%Invalid JWT%';

  RAISE NOTICE
    'targeted Sheet dispatch health: lmp_id=%, queue_id=%, status=%, last_error=%, invalid_jwt=%',
    v_lmp_id, v_queue_id, v_status, v_last_error, v_invalid_jwt;

  IF v_queue_id IS NULL OR v_status IS DISTINCT FROM 'done' THEN
    RAISE EXCEPTION
      'TARGETED_SHEET_DISPATCH_NOT_DONE: lmp=%, queue=%, status=%, error=%',
      v_lmp_id, v_queue_id, v_status, v_last_error;
  END IF;
  IF v_invalid_jwt > 0 THEN
    RAISE EXCEPTION 'SHEET_QUEUE_INVALID_JWT_REAPPEARED: % rows', v_invalid_jwt;
  END IF;
END
$$;
