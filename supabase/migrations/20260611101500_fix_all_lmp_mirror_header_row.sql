-- Live schema inspection on 2026-06-11 confirmed:
--   sheet_write_queue has payload, status, updated_at, idempotency_key,
--   entity_id, and attempt_count.
--   enqueue_lmp_sheet_mirror_by_id(uuid, text) already emits headerRow 14.
-- The remaining row-15 source was enqueue_all_lmp_sheet_mirrors().
--
-- This migration only corrects future queue payload metadata and normalizes
-- existing pending/failed payloads. It does not retry rows or mutate Sheet data.

CREATE OR REPLACE FUNCTION public.enqueue_all_lmp_sheet_mirrors()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_count integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF public.request_is_view_as_read_only() THEN
    RAISE EXCEPTION 'VIEW_AS_READ_ONLY' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sheet_write_queue
    (tab_name, operation, payload, status, next_retry_at, enqueued_by,
     idempotency_key, entity_id, attempt_count)
  SELECT
    'LMP Tracker',
    'sync-db-to-sheet',
    jsonb_build_object(
      'op', 'sync-db-to-sheet',
      'tab', 'LMP Tracker',
      'headerRow', 14,
      'company', lp.company,
      'role', lp.role,
      'lmp_code', lp.lmp_code,
      'dbPatch', to_jsonb(lp)
    ),
    'pending',
    now(),
    'admin_manual_resync',
    'lmp:' || lp.id::text || ':sync',
    lp.id,
    0
  FROM public.lmp_processes lp
  WHERE COALESCE(lp.company, '') <> ''
    AND COALESCE(lp.role, '') <> ''
    AND COALESCE(lp.lmp_code, '') <> ''
  ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL AND status = 'pending'
  DO UPDATE SET
    payload = EXCLUDED.payload,
    next_retry_at = now(),
    last_error = NULL,
    updated_at = now();

  GET DIAGNOSTICS row_count = ROW_COUNT;
  RETURN row_count;
END;
$$;

UPDATE public.sheet_write_queue
SET payload = jsonb_set(payload, '{headerRow}', '14'::jsonb, true),
    updated_at = now()
WHERE tab_name = 'LMP Tracker'
  AND status IN ('pending', 'failed')
  AND payload->>'headerRow' = '15';

COMMENT ON FUNCTION public.enqueue_all_lmp_sheet_mirrors() IS
  'Admin-only durable LMP Tracker resync using canonical header row 14 and immutable lmp_code identity.';
