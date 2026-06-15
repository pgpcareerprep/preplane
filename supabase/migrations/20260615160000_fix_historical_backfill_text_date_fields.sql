-- Keep all lmp_processes tracker date fields as their existing text type.
-- This only corrects the importer function; it does not alter stored rows.

DO $$
DECLARE
  v_definition text;
  v_corrected text;
BEGIN
  SELECT pg_get_functiondef('public.import_historical_lmp_backfill(jsonb)'::regprocedure)
  INTO v_definition;

  v_corrected := regexp_replace(
    v_definition,
    E'(NULLIF\\([^\\)]*next_progress_date[^\\)]*\\))::date',
    E'\\1',
    'g'
  );
  v_corrected := regexp_replace(
    v_corrected,
    E'(NULLIF\\([^\\)]*closing_date[^\\)]*\\))::date',
    E'\\1',
    'g'
  );

  IF v_corrected = v_definition THEN
    RAISE EXCEPTION 'Historical backfill tracker date correction did not match deployed function';
  END IF;

  EXECUTE v_corrected;
END;
$$;

NOTIFY pgrst, 'reload schema';
