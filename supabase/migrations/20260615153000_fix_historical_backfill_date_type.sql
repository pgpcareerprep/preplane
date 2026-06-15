-- lmp_processes.date is stored as text. Correct the already-deployed
-- historical importer without changing existing rows or column types.

DO $$
DECLARE
  v_definition text;
  v_corrected text;
BEGIN
  SELECT pg_get_functiondef('public.import_historical_lmp_backfill(jsonb)'::regprocedure)
  INTO v_definition;

  v_corrected := replace(v_definition, 'AND date = v_date', 'AND date = v_date::text');
  v_corrected := replace(
    v_corrected,
    'date = COALESCE(date, v_date),',
    'date = COALESCE(NULLIF(date, ''''), v_date::text),'
  );

  IF v_corrected = v_definition THEN
    RAISE EXCEPTION 'Historical backfill date correction did not match deployed function';
  END IF;

  EXECUTE v_corrected;
END;
$$;

NOTIFY pgrst, 'reload schema';
