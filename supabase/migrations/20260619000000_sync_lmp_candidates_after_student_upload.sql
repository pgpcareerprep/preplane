-- Sync lmp_candidates from students after Student DB CSV upload.
-- Links student_id by email, roll_no, or unique normalized name; refreshes denormalized fields.

CREATE OR REPLACE FUNCTION public.sync_lmp_candidates_from_students_after_student_upload()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  linked_by_email integer := 0;
  linked_by_roll integer := 0;
  linked_by_name integer := 0;
  updated_fields integer := 0;
BEGIN
  -- Link missing student_id by unique email match
  WITH email_matches AS (
    SELECT lc.id AS candidate_id, s.id AS student_id
    FROM lmp_candidates lc
    JOIN students s ON lower(trim(lc.email)) = lower(trim(s.email))
    WHERE lc.email IS NOT NULL AND trim(lc.email) <> ''
      AND s.email IS NOT NULL AND trim(s.email) <> ''
      AND lc.student_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM students s2
        WHERE lower(trim(s2.email)) = lower(trim(s.email))
          AND s2.id <> s.id
      )
  )
  UPDATE lmp_candidates lc
  SET student_id = em.student_id, updated_at = now()
  FROM email_matches em
  WHERE lc.id = em.candidate_id;
  GET DIAGNOSTICS linked_by_email = ROW_COUNT;

  -- Link missing student_id by unique roll_no match
  WITH roll_matches AS (
    SELECT lc.id AS candidate_id, s.id AS student_id
    FROM lmp_candidates lc
    JOIN students s ON trim(lc.roll_no) = trim(s.roll_no)
    WHERE lc.roll_no IS NOT NULL AND trim(lc.roll_no) <> ''
      AND s.roll_no IS NOT NULL AND trim(s.roll_no) <> ''
      AND lc.student_id IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM students s2
        WHERE trim(s2.roll_no) = trim(s.roll_no)
          AND s2.id <> s.id
      )
  )
  UPDATE lmp_candidates lc
  SET student_id = rm.student_id, updated_at = now()
  FROM roll_matches rm
  WHERE lc.id = rm.candidate_id;
  GET DIAGNOSTICS linked_by_roll = ROW_COUNT;

  -- Link missing student_id by normalized name when exactly one student matches
  WITH norm_students AS (
    SELECT
      id,
      lower(trim(regexp_replace(name, '\s+', ' ', 'g'))) AS norm_name
    FROM students
    WHERE name IS NOT NULL AND trim(name) <> ''
  ),
  unique_names AS (
    SELECT norm_name
    FROM norm_students
    GROUP BY norm_name
    HAVING count(*) = 1
  ),
  name_matches AS (
    SELECT lc.id AS candidate_id, ns.id AS student_id
    FROM lmp_candidates lc
    JOIN norm_students ns
      ON ns.norm_name = lower(trim(regexp_replace(lc.student_name, '\s+', ' ', 'g')))
    JOIN unique_names un ON un.norm_name = ns.norm_name
    WHERE lc.student_id IS NULL
      AND lc.student_name IS NOT NULL AND trim(lc.student_name) <> ''
  )
  UPDATE lmp_candidates lc
  SET student_id = nm.student_id, updated_at = now()
  FROM name_matches nm
  WHERE lc.id = nm.candidate_id;
  GET DIAGNOSTICS linked_by_name = ROW_COUNT;

  -- Refresh denormalized candidate fields from linked students
  UPDATE lmp_candidates lc
  SET
    roll_no = s.roll_no,
    email = s.email,
    student_name = s.name,
    updated_at = now()
  FROM students s
  WHERE lc.student_id = s.id
    AND (
      lc.roll_no IS DISTINCT FROM s.roll_no
      OR lc.email IS DISTINCT FROM s.email
      OR lc.student_name IS DISTINCT FROM s.name
    );
  GET DIAGNOSTICS updated_fields = ROW_COUNT;

  RETURN jsonb_build_object(
    'linked_by_email', linked_by_email,
    'linked_by_roll', linked_by_roll,
    'linked_by_name', linked_by_name,
    'updated_fields', updated_fields
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.sync_lmp_candidates_from_students_after_student_upload() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_lmp_candidates_from_students_after_student_upload() TO service_role;
