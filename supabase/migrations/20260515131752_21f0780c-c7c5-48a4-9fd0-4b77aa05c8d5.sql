-- Add materialized students.lmp_count columns + trigger that keeps them in sync
-- with lmp_candidates. The students_with_load view continues to expose the
-- live-computed values; this just persists the count for fast point reads
-- and avoids needing a join on every students-table query.

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS lmp_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_lmp_count integer NOT NULL DEFAULT 0;

-- Backfill from existing lmp_candidates
WITH counts AS (
  SELECT
    student_id,
    count(*)                                                              AS total,
    count(*) FILTER (WHERE pipeline_stage NOT IN ('converted','closed','rejected')) AS active
  FROM public.lmp_candidates
  WHERE student_id IS NOT NULL
  GROUP BY student_id
)
UPDATE public.students s
SET lmp_count = c.total,
    active_lmp_count = c.active
FROM counts c
WHERE s.id = c.student_id;

CREATE OR REPLACE FUNCTION public.recompute_student_lmp_counts(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _student_id IS NULL THEN RETURN; END IF;
  UPDATE public.students s
  SET lmp_count = COALESCE((
        SELECT count(*) FROM public.lmp_candidates
        WHERE student_id = _student_id
      ), 0),
      active_lmp_count = COALESCE((
        SELECT count(*) FROM public.lmp_candidates
        WHERE student_id = _student_id
          AND pipeline_stage NOT IN ('converted','closed','rejected')
      ), 0)
  WHERE s.id = _student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_student_lmp_count_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.recompute_student_lmp_counts(NEW.student_id);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_student_lmp_counts(OLD.student_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.student_id IS DISTINCT FROM OLD.student_id THEN
      PERFORM public.recompute_student_lmp_counts(OLD.student_id);
      PERFORM public.recompute_student_lmp_counts(NEW.student_id);
    ELSIF NEW.pipeline_stage IS DISTINCT FROM OLD.pipeline_stage THEN
      PERFORM public.recompute_student_lmp_counts(NEW.student_id);
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_lmp_count_sync ON public.lmp_candidates;
CREATE TRIGGER trg_student_lmp_count_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.lmp_candidates
  FOR EACH ROW EXECUTE FUNCTION public.tg_student_lmp_count_sync();
