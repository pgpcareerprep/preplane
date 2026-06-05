ALTER TABLE public.lmp_processes ADD COLUMN IF NOT EXISTS comments text;

CREATE OR REPLACE FUNCTION public.set_closing_date_on_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  terminal_statuses text[] := ARRAY['converted','not-converted','closed','converted-na'];
  is_transition boolean := false;
BEGIN
  IF NEW.status IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    is_transition := NEW.status = ANY(terminal_statuses);
  ELSIF TG_OP = 'UPDATE' THEN
    is_transition := NEW.status = ANY(terminal_statuses)
      AND (OLD.status IS DISTINCT FROM NEW.status);
  END IF;

  IF is_transition THEN
    NEW.closing_date := to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_closing_date_on_terminal_status ON public.lmp_processes;
CREATE TRIGGER trg_set_closing_date_on_terminal_status
BEFORE INSERT OR UPDATE OF status ON public.lmp_processes
FOR EACH ROW
EXECUTE FUNCTION public.set_closing_date_on_terminal_status();