-- Phase 2: Seed C6 cohort/programs and backfill students (idempotent, no deletes).
-- Assumes students.cohort text and roll_no remain unchanged.

DO $$
DECLARE
  v_c6_id uuid;
  v_ylc_id uuid;
  v_tbm_id uuid;
BEGIN
  -- 1. C6 cohort
  INSERT INTO public.cohorts (code, name, description, is_active)
  VALUES ('C6', 'Cohort 6', 'Legacy cohort for existing student data', true)
  ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name,
        description = EXCLUDED.description,
        is_active = true,
        updated_at = now()
  RETURNING id INTO v_c6_id;

  IF v_c6_id IS NULL THEN
    SELECT id INTO v_c6_id FROM public.cohorts WHERE code = 'C6';
  END IF;

  -- 2. C6 programs
  INSERT INTO public.programs (cohort_id, code, name, aliases, is_active)
  VALUES (
    v_c6_id,
    'YLC',
    'Young Leaders Cohort',
    ARRAY['YLC2']::text[],
    true
  )
  ON CONFLICT (cohort_id, code) DO UPDATE
    SET name = EXCLUDED.name,
        aliases = EXCLUDED.aliases,
        is_active = true,
        updated_at = now()
  RETURNING id INTO v_ylc_id;

  IF v_ylc_id IS NULL THEN
    SELECT id INTO v_ylc_id FROM public.programs WHERE cohort_id = v_c6_id AND code = 'YLC';
  END IF;

  INSERT INTO public.programs (cohort_id, code, name, aliases, is_active)
  VALUES (
    v_c6_id,
    'TBM',
    'Technology & Business Management',
    ARRAY['PGP', 'DBM']::text[],
    true
  )
  ON CONFLICT (cohort_id, code) DO UPDATE
    SET name = EXCLUDED.name,
        aliases = EXCLUDED.aliases,
        is_active = true,
        updated_at = now()
  RETURNING id INTO v_tbm_id;

  IF v_tbm_id IS NULL THEN
    SELECT id INTO v_tbm_id FROM public.programs WHERE cohort_id = v_c6_id AND code = 'TBM';
  END IF;

  -- 3. Backfill cohort_id = C6 for all students
  UPDATE public.students
  SET cohort_id = v_c6_id
  WHERE cohort_id IS DISTINCT FROM v_c6_id;

  -- 4. Resolve program_id from legacy cohort text / roll_no (YLC before TBM)
  UPDATE public.students s
  SET program_id = v_ylc_id
  WHERE s.cohort_id = v_c6_id
    AND (
      upper(trim(coalesce(s.cohort, ''))) LIKE 'YLC%'
      OR upper(trim(coalesce(s.roll_no, ''))) LIKE 'YLC%'
      OR upper(trim(coalesce(s.cohort, ''))) = 'YLC2'
    )
    AND (s.program_id IS DISTINCT FROM v_ylc_id);

  UPDATE public.students s
  SET program_id = v_tbm_id
  WHERE s.cohort_id = v_c6_id
    AND s.program_id IS NULL
    AND (
      upper(trim(coalesce(s.cohort, ''))) LIKE 'PGP%'
      OR upper(trim(coalesce(s.cohort, ''))) LIKE 'TBM%'
      OR upper(trim(coalesce(s.cohort, ''))) LIKE 'DBM%'
      OR upper(trim(coalesce(s.roll_no, ''))) LIKE 'PGP%'
    );
END $$;
