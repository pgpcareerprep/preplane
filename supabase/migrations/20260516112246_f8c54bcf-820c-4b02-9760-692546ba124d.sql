CREATE OR REPLACE FUNCTION public.assign_lmp_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  yr text;
  seq_name text;
  next_val bigint;
  candidate text;
  attempts int := 0;
BEGIN
  IF NEW.lmp_code IS NULL OR NEW.lmp_code = '' THEN
    yr := to_char(COALESCE(NEW.created_at, now()), 'YYYY');
    seq_name := 'lmp_code_seq_' || yr;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', seq_name);
    LOOP
      EXECUTE format('SELECT nextval(%L)', 'public.' || seq_name) INTO next_val;
      candidate := 'LMP-' || yr || '-' ||
        CASE WHEN next_val < 10000
             THEN lpad(next_val::text, 4, '0')
             ELSE next_val::text
        END;
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.lmp_processes WHERE lmp_code = candidate
      );
      attempts := attempts + 1;
      EXIT WHEN attempts > 50;
    END LOOP;
    NEW.lmp_code := candidate;
  END IF;
  RETURN NEW;
END $function$;