DO $$
DECLARE
  r RECORD;
  yr text;
  seq_name text;
  next_val bigint;
  candidate text;
  attempts int;
BEGIN
  FOR r IN
    SELECT id, created_at FROM public.lmp_processes
    WHERE lmp_code IS NULL OR lmp_code = ''
    ORDER BY created_at NULLS LAST
  LOOP
    yr := to_char(COALESCE(r.created_at, now()), 'YYYY');
    seq_name := 'lmp_code_seq_' || yr;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', seq_name);
    attempts := 0;
    LOOP
      EXECUTE format('SELECT nextval(%L)', 'public.' || seq_name) INTO next_val;
      candidate := 'LMP-' || yr || '-' ||
        CASE WHEN next_val < 10000
             THEN lpad(next_val::text, 4, '0')
             ELSE next_val::text END;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.lmp_processes WHERE lmp_code = candidate);
      attempts := attempts + 1;
      EXIT WHEN attempts > 100;
    END LOOP;
    UPDATE public.lmp_processes SET lmp_code = candidate WHERE id = r.id;
  END LOOP;
END $$;