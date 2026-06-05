CREATE OR REPLACE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lmp_id uuid;
BEGIN
  v_lmp_id := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Bump the parent lmp_processes row so the existing
  -- tg_lmp_processes_sheet_mirror trigger fires and re-pushes
  -- the calculated R1/R2/R3 Shortlisted counts to the sheet.
  UPDATE public.lmp_processes
     SET updated_at = now()
   WHERE id = v_lmp_id;

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'enqueue_lmp_sheet_mirror_from_candidate failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tg_lmp_candidates_sheet_mirror_iud ON public.lmp_candidates;
DROP TRIGGER IF EXISTS tg_lmp_candidates_sheet_mirror_upd ON public.lmp_candidates;

CREATE TRIGGER tg_lmp_candidates_sheet_mirror_iud
  AFTER INSERT OR DELETE ON public.lmp_candidates
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate();

CREATE TRIGGER tg_lmp_candidates_sheet_mirror_upd
  AFTER UPDATE OF pipeline_stage ON public.lmp_candidates
  FOR EACH ROW
  WHEN (NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage)
  EXECUTE FUNCTION public.enqueue_lmp_sheet_mirror_from_candidate();