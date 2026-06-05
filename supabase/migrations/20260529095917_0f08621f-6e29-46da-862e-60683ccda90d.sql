
-- Function: recompute lmp_processes.final_convert (count) and convert_names (joined names)
CREATE OR REPLACE FUNCTION public.recompute_lmp_convert(_lmp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _names text;
  _count int;
BEGIN
  SELECT
    COALESCE(string_agg(NULLIF(trim(student_name), ''), ', '
             ORDER BY student_name), NULL),
    COUNT(*)
  INTO _names, _count
  FROM public.lmp_candidates
  WHERE lmp_id = _lmp_id
    AND (
      lower(coalesce(pipeline_stage,'')) IN ('final','offer','converted')
      OR coalesce(trim(offer_status), '') <> ''
    );

  UPDATE public.lmp_processes
  SET
    convert_names = _names,
    final_convert = CASE WHEN _count > 0 THEN _count::text ELSE NULL END,
    updated_at = now()
  WHERE id = _lmp_id;
END;
$$;

-- Trigger function
CREATE OR REPLACE FUNCTION public.trg_recompute_lmp_convert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_lmp_convert(OLD.lmp_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_lmp_convert(NEW.lmp_id);
    IF TG_OP = 'UPDATE' AND OLD.lmp_id IS DISTINCT FROM NEW.lmp_id THEN
      PERFORM public.recompute_lmp_convert(OLD.lmp_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS lmp_candidates_recompute_convert ON public.lmp_candidates;
CREATE TRIGGER lmp_candidates_recompute_convert
AFTER INSERT OR UPDATE OF pipeline_stage, offer_status, student_name, lmp_id OR DELETE
ON public.lmp_candidates
FOR EACH ROW
EXECUTE FUNCTION public.trg_recompute_lmp_convert();

-- Backfill all existing LMP processes
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT lmp_id FROM public.lmp_candidates WHERE lmp_id IS NOT NULL LOOP
    PERFORM public.recompute_lmp_convert(r.lmp_id);
  END LOOP;
END $$;
