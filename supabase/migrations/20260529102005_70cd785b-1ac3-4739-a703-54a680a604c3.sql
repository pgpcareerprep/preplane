CREATE OR REPLACE FUNCTION public.tg_lmp_set_closing_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closing_states text[] := ARRAY[
    'converted', 'not-converted', 'not_converted',
    'other-reasons', 'other_reasons',
    'Converted', 'Not Converted', 'Other reasons', 'Other Reasons'
  ];
  is_closing boolean;
  today_str text := to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD');
BEGIN
  is_closing := NEW.status = ANY(closing_states);

  IF TG_OP = 'INSERT' THEN
    IF is_closing AND (NEW.closing_date IS NULL OR btrim(NEW.closing_date) = '') THEN
      NEW.closing_date := today_str;
    ELSIF NOT is_closing THEN
      NEW.closing_date := NULL;
    END IF;
    RETURN NEW;
  END IF;

  -- Entering a closing state: stamp today's date
  IF is_closing
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.closing_date IS NULL OR btrim(COALESCE(OLD.closing_date,'')) = '')
     AND (NEW.closing_date IS NULL OR btrim(NEW.closing_date) = '' OR NEW.closing_date = OLD.closing_date)
  THEN
    NEW.closing_date := today_str;
  END IF;

  -- Moving out of a closing state: always clear closing_date
  IF NOT is_closing AND OLD.status IS DISTINCT FROM NEW.status THEN
    NEW.closing_date := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lmp_set_closing_date ON public.lmp_processes;
CREATE TRIGGER trg_lmp_set_closing_date
  BEFORE INSERT OR UPDATE OF status, closing_date ON public.lmp_processes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_lmp_set_closing_date();

-- Backfill: stamp closing_date for closing rows missing/invalid date
UPDATE public.lmp_processes
SET closing_date = to_char((COALESCE(updated_at, now()) AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD')
WHERE status IN ('converted','not-converted','not_converted','other-reasons','other_reasons',
                 'Converted','Not Converted','Other reasons','Other Reasons')
  AND (closing_date IS NULL OR btrim(closing_date) = '' OR closing_date !~ '^\d{4}-\d{2}-\d{2}$');

-- Backfill: clear closing_date for non-closing rows
UPDATE public.lmp_processes
SET closing_date = NULL
WHERE closing_date IS NOT NULL
  AND status NOT IN ('converted','not-converted','not_converted','other-reasons','other_reasons',
                     'Converted','Not Converted','Other reasons','Other Reasons');
