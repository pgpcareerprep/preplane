-- next_progress_date is a SQL date, unlike the text tracker fields date and
-- closing_date. Restore its cast after the targeted tracker-date correction.

DO $$
DECLARE
  v_definition text;
  v_corrected text;
BEGIN
  SELECT pg_get_functiondef('public.import_historical_lmp_backfill(jsonb)'::regprocedure)
  INTO v_definition;

  v_corrected := regexp_replace(
    v_definition,
    E'(NULLIF\\([^\\)]*next_progress_date[^\\)]*\\))',
    E'\\1::date',
    'g'
  );

  IF v_corrected = v_definition THEN
    RAISE EXCEPTION 'Historical backfill next-progress date correction did not match deployed function';
  END IF;

  EXECUTE v_corrected;
END;
$$;

NOTIFY pgrst, 'reload schema';
