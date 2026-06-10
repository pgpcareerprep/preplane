-- Deployment guard: the Sheet queue auth repair is not considered complete
-- while any durable queue row still reports Invalid JWT.

DO $$
DECLARE
  v_invalid_jwt integer;
  v_pending integer;
  v_processing integer;
  v_done integer;
  v_failed integer;
BEGIN
  SELECT count(*) INTO v_invalid_jwt
  FROM public.sheet_write_queue
  WHERE COALESCE(last_error, '') ILIKE '%Invalid JWT%';

  SELECT
    count(*) FILTER (WHERE status = 'pending'),
    count(*) FILTER (WHERE status = 'processing'),
    count(*) FILTER (WHERE status = 'done'),
    count(*) FILTER (WHERE status = 'failed')
  INTO v_pending, v_processing, v_done, v_failed
  FROM public.sheet_write_queue;

  RAISE NOTICE
    'sheet_write_queue health: pending=%, processing=%, done=%, failed=%, invalid_jwt=%',
    v_pending, v_processing, v_done, v_failed, v_invalid_jwt;

  IF v_invalid_jwt > 0 THEN
    RAISE EXCEPTION 'SHEET_QUEUE_INVALID_JWT_REMAINS: % rows', v_invalid_jwt;
  END IF;
END
$$;
