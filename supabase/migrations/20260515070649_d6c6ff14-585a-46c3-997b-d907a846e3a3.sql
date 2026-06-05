-- 1. Trigger: auto-link lmp_candidates to a student row (and create placeholder if missing)
CREATE OR REPLACE FUNCTION public.link_lmp_candidate_to_student()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_email text := NULLIF(trim((NEW.metadata->>'email')), '');
BEGIN
  IF NEW.student_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.roll_no IS NOT NULL AND NEW.roll_no <> '' THEN
    SELECT id INTO v_id FROM public.students WHERE roll_no = NEW.roll_no LIMIT 1;
  END IF;

  IF v_id IS NULL AND v_email IS NOT NULL THEN
    SELECT id INTO v_id FROM public.students WHERE lower(email) = lower(v_email) LIMIT 1;
  END IF;

  IF v_id IS NULL AND NEW.student_name IS NOT NULL AND NEW.student_name <> '' THEN
    SELECT id INTO v_id FROM public.students WHERE lower(name) = lower(NEW.student_name) LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO public.students (name, roll_no, email, sync_source)
    VALUES (
      COALESCE(NULLIF(NEW.student_name,''), NEW.roll_no, 'Unknown'),
      NULLIF(NEW.roll_no,''),
      v_email,
      'lmp_auto'
    )
    RETURNING id INTO v_id;
  END IF;

  NEW.student_id := v_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_link_lmp_candidate_to_student ON public.lmp_candidates;
CREATE TRIGGER trg_link_lmp_candidate_to_student
BEFORE INSERT OR UPDATE OF roll_no, student_name, metadata
ON public.lmp_candidates
FOR EACH ROW
EXECUTE FUNCTION public.link_lmp_candidate_to_student();

-- 2. Backfill existing rows
UPDATE public.lmp_candidates c
SET student_id = s.id
FROM public.students s
WHERE c.student_id IS NULL
  AND (
    (c.roll_no IS NOT NULL AND c.roll_no = s.roll_no) OR
    (c.roll_no IS NULL AND lower(s.name) = lower(c.student_name))
  );

-- For any candidates still unlinked, create placeholder students
INSERT INTO public.students (name, roll_no, sync_source)
SELECT DISTINCT COALESCE(NULLIF(c.student_name,''), c.roll_no, 'Unknown'),
       NULLIF(c.roll_no,''),
       'lmp_auto'
FROM public.lmp_candidates c
WHERE c.student_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.students s
    WHERE (c.roll_no IS NOT NULL AND s.roll_no = c.roll_no)
       OR (c.roll_no IS NULL AND lower(s.name) = lower(c.student_name))
  );

UPDATE public.lmp_candidates c
SET student_id = s.id
FROM public.students s
WHERE c.student_id IS NULL
  AND (
    (c.roll_no IS NOT NULL AND c.roll_no = s.roll_no) OR
    (c.roll_no IS NULL AND lower(s.name) = lower(c.student_name))
  );

-- 3. Replace the students_with_load view to also expose total_lmp_count
DROP VIEW IF EXISTS public.students_with_load;
CREATE VIEW public.students_with_load AS
SELECT s.*,
  COALESCE(c.total_lmp_count, 0)::bigint AS total_lmp_count,
  COALESCE(c.active_lmp_count, 0)::bigint AS active_lmp_count,
  COALESCE(c.converted_count, 0)::bigint AS converted_count,
  c.last_activity_at
FROM public.students s
LEFT JOIN (
  SELECT student_id,
    count(DISTINCT lmp_id) AS total_lmp_count,
    count(DISTINCT lmp_id) FILTER (WHERE pipeline_stage NOT IN ('converted','closed','rejected')) AS active_lmp_count,
    count(DISTINCT lmp_id) FILTER (WHERE pipeline_stage = 'converted') AS converted_count,
    max(updated_at) AS last_activity_at
  FROM public.lmp_candidates
  WHERE student_id IS NOT NULL
  GROUP BY student_id
) c ON c.student_id = s.id;