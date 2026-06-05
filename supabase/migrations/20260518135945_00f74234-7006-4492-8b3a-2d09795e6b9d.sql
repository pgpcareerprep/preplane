CREATE OR REPLACE FUNCTION public.tg_lmp_process_delete_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q';
  v_payload jsonb;
  v_row_num bigint;
  v_find_by jsonb;
  v_has_lmp_code boolean;
BEGIN
  BEGIN
    v_row_num := NULLIF(OLD.sheet_row_id, '')::bigint;
  EXCEPTION WHEN OTHERS THEN
    v_row_num := NULL;
  END;

  v_has_lmp_code := OLD.lmp_code IS NOT NULL AND OLD.lmp_code <> '';

  -- Nothing to target: no lmp_code AND no sheet row number → skip entirely.
  IF NOT v_has_lmp_code AND v_row_num IS NULL THEN
    RETURN OLD;
  END IF;

  -- findBy only when we have a real lmp_code; otherwise rely on rowNumber.
  IF v_has_lmp_code THEN
    v_find_by := jsonb_build_object('LMP ID', OLD.lmp_code);
  ELSE
    v_find_by := NULL;
  END IF;

  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'op', 'delete',
    'tab', 'LMP Tracker',
    'headerRow', 15,
    'id', OLD.id::text,
    'rowNumber', v_row_num,
    'findBy', v_find_by
  ));

  INSERT INTO public.sheet_write_queue (tab_name, operation, payload, status, next_retry_at, enqueued_by, last_error)
  VALUES ('LMP Tracker','delete',v_payload,'pending', now() + interval '90 seconds','db_trigger','enqueued_by_delete_trigger');

  PERFORM net.http_post(
    url := 'https://yhzcheqjzmikeczzoeih.supabase.co/functions/v1/sheets-lmp',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-sheet-sweeper', '1'
    ),
    body := v_payload
  );

  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_lmp_process_delete_sheet_sync failed: %', SQLERRM;
  RETURN OLD;
END;
$$;