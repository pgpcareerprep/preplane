
-- 1. Domain remap for CSV-imported rows
DO $$
DECLARE
  v_unmapped uuid;
  v_supply uuid;
BEGIN
  SELECT id INTO v_unmapped FROM domains WHERE name = 'Unmapped' LIMIT 1;
  SELECT id INTO v_supply FROM domains WHERE name = 'Supply & Operations' LIMIT 1;

  UPDATE lmp_processes
    SET domain_raw = 'Unmapped', domain_id = v_unmapped
    WHERE sync_source = 'csv_import'
      AND (domain_raw IN ('Mixed','unmapped','') OR domain_raw IS NULL);

  UPDATE lmp_processes
    SET domain_raw = 'Supply & Operations', domain_id = v_supply
    WHERE sync_source = 'csv_import' AND domain_raw = 'Supply Chain';
END $$;

-- 2. Backfill lmp_daily_logs from the multi-line daily_progress text on CSV-imported rows
-- Skip rows that already have daily-log entries.
DO $$
DECLARE
  r record;
  ln text;
  arr text[];
  i int;
BEGIN
  FOR r IN
    SELECT l.id, l.daily_progress
    FROM lmp_processes l
    WHERE l.sync_source = 'csv_import'
      AND coalesce(btrim(l.daily_progress), '') <> ''
      AND NOT EXISTS (SELECT 1 FROM lmp_daily_logs d WHERE d.lmp_id = l.id)
  LOOP
    arr := regexp_split_to_array(r.daily_progress, E'\n');
    -- Insert each non-empty line as its own progress entry; preserve chronological
    -- order by giving later array entries earlier created_at (CSV is newest-first).
    FOR i IN 1 .. array_length(arr,1) LOOP
      ln := btrim(arr[i]);
      IF ln <> '' THEN
        INSERT INTO lmp_daily_logs (lmp_id, entry_type, author_name, text, created_at)
        VALUES (r.id, 'progress', 'CSV Import', ln,
                now() - ((i - 1) || ' minutes')::interval);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 3. Re-enqueue all CSV-imported rows to the sheet write queue via a touch update.
-- The AFTER UPDATE trigger tg_lmp_processes_sheet_mirror handles enqueueing.
UPDATE lmp_processes
  SET updated_at = now()
  WHERE sync_source = 'csv_import';
