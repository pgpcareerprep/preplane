-- Keep all lmp_processes tracker date fields as their existing text type.
-- This only corrects the importer function; it does not alter stored rows.

DO $$
DECLARE
  v_definition text;
  v_corrected text;
BEGIN
  SELECT pg_get_functiondef('public.import_historical_lmp_backfill(jsonb)'::regprocedure)
  INTO v_definition;

  v_corrected := replace(
    v_definition,
    'NULLIF(v_patch ->> ''next_progress_date''::text, ''''::text)::date',
    'NULLIF(v_patch ->> ''next_progress_date''::text, ''''::text)'
  );
  v_corrected := replace(
    v_corrected,
    'NULLIF(v_patch ->> ''closing_date''::text, ''''::text)::date',
    'NULLIF(v_patch ->> ''closing_date''::text, ''''::text)'
  );

  IF v_corrected = v_definition THEN
    RAISE EXCEPTION 'Historical backfill tracker date correction did not match deployed function';
  END IF;

  EXECUTE v_corrected;
END;
$$;

NOTIFY pgrst, 'reload schema';
