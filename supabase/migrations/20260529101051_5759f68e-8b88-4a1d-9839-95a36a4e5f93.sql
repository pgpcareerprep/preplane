-- Auto-set lmp_processes.closing_date when status transitions to a closing state
CREATE OR REPLACE FUNCTION public.tg_lmp_set_closing_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  closing_states text[] := ARRAY[
    'converted', 'not-converted', 'not_converted', 'converted-na', 'converted_na',
    'closed', 'dormant', 'on-hold', 'on_hold',
    'Converted', 'Not Converted', 'Converted NA', 'Closed', 'Dormant', 'On Hold', 'On hold'
  ];
  is_closing boolean;
  today_str text := to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD');
BEGIN
  is_closing := NEW.status = ANY(closing_states);

  IF TG_OP = 'INSERT' THEN
    IF is_closing AND (NEW.closing_date IS NULL OR btrim(NEW.closing_date) = '') THEN
      NEW.closing_date := today_str;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: set when entering a closing state and no explicit closing_date was provided
  IF is_closing
     AND (OLD.status IS DISTINCT FROM NEW.status OR OLD.closing_date IS NULL OR btrim(COALESCE(OLD.closing_date,'')) = '')
     AND (NEW.closing_date IS NULL OR btrim(NEW.closing_date) = '' OR NEW.closing_date = OLD.closing_date)
  THEN
    NEW.closing_date := today_str;
  END IF;

  -- If status moved OUT of a closing state, clear the auto-set closing_date
  IF NOT is_closing AND OLD.status IS DISTINCT FROM NEW.status
     AND NEW.closing_date IS NOT DISTINCT FROM OLD.closing_date
  THEN
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

-- Backfill: clean up any stale non-date closing_date strings and backfill where status is closing
UPDATE public.lmp_processes
SET closing_date = to_char((COALESCE(updated_at, now()) AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD')
WHERE status IN (
  'converted','not-converted','not_converted','converted-na','converted_na',
  'closed','dormant','on-hold','on_hold',
  'Converted','Not Converted','Converted NA','Closed','Dormant','On Hold','On hold'
)
AND (
  closing_date IS NULL
  OR btrim(closing_date) = ''
  OR closing_date !~ '^\d{4}-\d{2}-\d{2}$'
);