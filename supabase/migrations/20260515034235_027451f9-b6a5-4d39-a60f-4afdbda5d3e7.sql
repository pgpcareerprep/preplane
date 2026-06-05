
-- ============ PHASE 2A: Stable codes ============

-- POC code (flat)
CREATE SEQUENCE IF NOT EXISTS public.poc_code_seq;
ALTER TABLE public.poc_profiles ADD COLUMN IF NOT EXISTS poc_code text;
CREATE UNIQUE INDEX IF NOT EXISTS poc_profiles_poc_code_uidx ON public.poc_profiles(poc_code) WHERE poc_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_poc_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.poc_code IS NULL OR NEW.poc_code = '' THEN
    NEW.poc_code := 'POC-' || lpad(nextval('public.poc_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_poc_code ON public.poc_profiles;
CREATE TRIGGER trg_assign_poc_code BEFORE INSERT ON public.poc_profiles
  FOR EACH ROW EXECUTE FUNCTION public.assign_poc_code();

-- Backfill POC codes deterministically
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.poc_profiles WHERE poc_code IS NULL
)
UPDATE public.poc_profiles p
SET poc_code = 'POC-' || lpad(o.rn::text, 4, '0')
FROM ordered o WHERE p.id = o.id;
SELECT setval('public.poc_code_seq', GREATEST((SELECT count(*) FROM public.poc_profiles), 1));

-- Mentor code (flat)
CREATE SEQUENCE IF NOT EXISTS public.mentor_code_seq;
ALTER TABLE public.mentors ADD COLUMN IF NOT EXISTS mentor_code text;
CREATE UNIQUE INDEX IF NOT EXISTS mentors_mentor_code_uidx ON public.mentors(mentor_code) WHERE mentor_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_mentor_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.mentor_code IS NULL OR NEW.mentor_code = '' THEN
    NEW.mentor_code := 'MEN-' || lpad(nextval('public.mentor_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_mentor_code ON public.mentors;
CREATE TRIGGER trg_assign_mentor_code BEFORE INSERT ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.assign_mentor_code();

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.mentors WHERE mentor_code IS NULL
)
UPDATE public.mentors m
SET mentor_code = 'MEN-' || lpad(o.rn::text, 4, '0')
FROM ordered o WHERE m.id = o.id;
SELECT setval('public.mentor_code_seq', GREATEST((SELECT count(*) FROM public.mentors), 1));

-- LMP code (year-reset)
ALTER TABLE public.lmp_processes ADD COLUMN IF NOT EXISTS lmp_code text;
CREATE UNIQUE INDEX IF NOT EXISTS lmp_processes_lmp_code_uidx ON public.lmp_processes(lmp_code) WHERE lmp_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_lmp_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  yr text;
  seq_name text;
  next_val bigint;
BEGIN
  IF NEW.lmp_code IS NULL OR NEW.lmp_code = '' THEN
    yr := to_char(COALESCE(NEW.created_at, now()), 'YYYY');
    seq_name := 'lmp_code_seq_' || yr;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', seq_name);
    EXECUTE format('SELECT nextval(%L)', 'public.' || seq_name) INTO next_val;
    NEW.lmp_code := 'LMP-' || yr || '-' || lpad(next_val::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_lmp_code ON public.lmp_processes;
CREATE TRIGGER trg_assign_lmp_code BEFORE INSERT ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.assign_lmp_code();

-- Backfill LMP codes per year
DO $$
DECLARE
  r record;
  yr text;
  seq_name text;
  cnt bigint;
BEGIN
  FOR r IN
    SELECT id, to_char(COALESCE(created_at, now()), 'YYYY') AS yr,
           row_number() OVER (PARTITION BY to_char(COALESCE(created_at, now()), 'YYYY') ORDER BY created_at, id) AS rn
    FROM public.lmp_processes WHERE lmp_code IS NULL
  LOOP
    UPDATE public.lmp_processes SET lmp_code = 'LMP-' || r.yr || '-' || lpad(r.rn::text, 4, '0')
    WHERE id = r.id;
  END LOOP;

  FOR yr IN SELECT DISTINCT to_char(COALESCE(created_at, now()), 'YYYY') FROM public.lmp_processes
  LOOP
    seq_name := 'lmp_code_seq_' || yr;
    EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I', seq_name);
    EXECUTE format('SELECT count(*) FROM public.lmp_processes WHERE to_char(COALESCE(created_at, now()), %L) = %L', 'YYYY', yr) INTO cnt;
    EXECUTE format('SELECT setval(%L, GREATEST(%s, 1))', 'public.' || seq_name, cnt);
  END LOOP;
END $$;

-- Student code (prefer roll_no, else generated)
CREATE SEQUENCE IF NOT EXISTS public.student_code_seq;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_code text;
CREATE UNIQUE INDEX IF NOT EXISTS students_student_code_uidx ON public.students(student_code) WHERE student_code IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_student_code()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.student_code IS NULL OR NEW.student_code = '' THEN
    NEW.student_code := COALESCE(NULLIF(NEW.roll_no,''), 'STU-' || lpad(nextval('public.student_code_seq')::text, 5, '0'));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_student_code ON public.students;
CREATE TRIGGER trg_assign_student_code BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.assign_student_code();

WITH ordered AS (
  SELECT id, roll_no,
         row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.students WHERE student_code IS NULL
)
UPDATE public.students s
SET student_code = COALESCE(NULLIF(o.roll_no,''), 'STU-' || lpad(o.rn::text, 5, '0'))
FROM ordered o WHERE s.id = o.id;
SELECT setval('public.student_code_seq', GREATEST((SELECT count(*) FROM public.students), 1));

-- ============ PHASE 2B: Derived views ============

CREATE OR REPLACE VIEW public.students_with_load AS
SELECT s.*,
  COALESCE(c.active_lmp_count, 0)  AS active_lmp_count,
  COALESCE(c.converted_count, 0)   AS converted_count,
  c.last_activity_at
FROM public.students s
LEFT JOIN (
  SELECT student_id,
    count(*) FILTER (WHERE pipeline_stage NOT IN ('converted','closed','rejected')) AS active_lmp_count,
    count(*) FILTER (WHERE pipeline_stage = 'converted') AS converted_count,
    max(updated_at) AS last_activity_at
  FROM public.lmp_candidates
  WHERE student_id IS NOT NULL
  GROUP BY student_id
) c ON c.student_id = s.id;

CREATE OR REPLACE VIEW public.poc_profiles_with_load AS
SELECT p.*,
  COALESCE(l.active_lmp_count, 0)         AS live_active_lmp_count,
  COALESCE(l.prep_active, 0)              AS live_prep_active,
  COALESCE(l.support_active, 0)           AS live_support_active,
  COALESCE(l.outreach_active, 0)          AS live_outreach_active
FROM public.poc_profiles p
LEFT JOIN (
  SELECT poc_id,
    count(DISTINCT lmp_id) AS active_lmp_count,
    count(*) FILTER (WHERE role = 'prep')     AS prep_active,
    count(*) FILTER (WHERE role = 'support')  AS support_active,
    count(*) FILTER (WHERE role = 'outreach') AS outreach_active
  FROM public.lmp_poc_links
  WHERE is_active = true
  GROUP BY poc_id
) l ON l.poc_id = p.id;

CREATE OR REPLACE VIEW public.lmp_processes_overview AS
SELECT lp.*,
  pp_prep.name    AS prep_poc_name,
  pp_support.name AS support_poc_name,
  COALESCE(orx.outreach_poc_names, '{}'::text[]) AS outreach_poc_names,
  d.name          AS domain_name,
  COALESCE(cc.candidate_count, 0) AS candidate_count,
  COALESCE(mc.mentor_count, 0)    AS mentor_count
FROM public.lmp_processes lp
LEFT JOIN public.poc_profiles pp_prep    ON pp_prep.id    = lp.prep_poc_id
LEFT JOIN public.poc_profiles pp_support ON pp_support.id = lp.support_poc_id
LEFT JOIN public.domains d               ON d.id          = lp.domain_id
LEFT JOIN LATERAL (
  SELECT array_agg(pp.name ORDER BY pp.name) AS outreach_poc_names
  FROM unnest(COALESCE(lp.outreach_poc_ids, '{}'::uuid[])) oid
  JOIN public.poc_profiles pp ON pp.id = oid
) orx ON true
LEFT JOIN (
  SELECT lmp_id, count(*) AS candidate_count FROM public.lmp_candidates GROUP BY lmp_id
) cc ON cc.lmp_id = lp.id
LEFT JOIN (
  SELECT lmp_id, count(*) AS mentor_count FROM public.lmp_mentors GROUP BY lmp_id
) mc ON mc.lmp_id = lp.id;

CREATE OR REPLACE VIEW public.mentors_union_view AS
SELECT m.*,
  (m.sync_source = 'alumni_mirror') AS is_alumni_mirror,
  CASE WHEN m.sync_source = 'alumni_mirror' THEN 'From Alumni' ELSE 'Mentor Union' END AS source_label
FROM public.mentors m;

GRANT SELECT ON public.students_with_load        TO authenticated, anon;
GRANT SELECT ON public.poc_profiles_with_load    TO authenticated, anon;
GRANT SELECT ON public.lmp_processes_overview    TO authenticated, anon;
GRANT SELECT ON public.mentors_union_view        TO authenticated, anon;

-- ============ PHASE 4: Foreign keys (NOT VALID, then validate) ============

-- Drop if pre-existing under same names (idempotent)
DO $$
BEGIN
  -- lmp_candidates.student_id -> students.id
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_candidates_student_id_fkey') THEN
    ALTER TABLE public.lmp_candidates
      ADD CONSTRAINT lmp_candidates_student_id_fkey
      FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_candidates_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_candidates
      ADD CONSTRAINT lmp_candidates_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_mentors_mentor_id_fkey') THEN
    ALTER TABLE public.lmp_mentors
      ADD CONSTRAINT lmp_mentors_mentor_id_fkey
      FOREIGN KEY (mentor_id) REFERENCES public.mentors(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_mentors_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_mentors
      ADD CONSTRAINT lmp_mentors_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_processes_domain_id_fkey') THEN
    ALTER TABLE public.lmp_processes
      ADD CONSTRAINT lmp_processes_domain_id_fkey
      FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_poc_links_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_poc_links
      ADD CONSTRAINT lmp_poc_links_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='lmp_poc_links_poc_id_fkey') THEN
    ALTER TABLE public.lmp_poc_links
      ADD CONSTRAINT lmp_poc_links_poc_id_fkey
      FOREIGN KEY (poc_id) REFERENCES public.poc_profiles(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- Try to validate; on failure, null out orphans then validate
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN SELECT * FROM (VALUES
    ('lmp_candidates','lmp_candidates_student_id_fkey','student_id','students','id', true),
    ('lmp_candidates','lmp_candidates_lmp_id_fkey','lmp_id','lmp_processes','id', false),
    ('lmp_mentors','lmp_mentors_mentor_id_fkey','mentor_id','mentors','id', false),
    ('lmp_mentors','lmp_mentors_lmp_id_fkey','lmp_id','lmp_processes','id', false),
    ('lmp_processes','lmp_processes_domain_id_fkey','domain_id','domains','id', true),
    ('lmp_poc_links','lmp_poc_links_lmp_id_fkey','lmp_id','lmp_processes','id', false),
    ('lmp_poc_links','lmp_poc_links_poc_id_fkey','poc_id','poc_profiles','id', false)
  ) AS t(tbl, cname, col, ref_tbl, ref_col, set_null)
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', fk.tbl, fk.cname);
    EXCEPTION WHEN others THEN
      IF fk.set_null THEN
        EXECUTE format(
          'UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND %I NOT IN (SELECT %I FROM public.%I)',
          fk.tbl, fk.col, fk.col, fk.col, fk.ref_col, fk.ref_tbl
        );
      ELSE
        EXECUTE format(
          'DELETE FROM public.%I WHERE %I IS NOT NULL AND %I NOT IN (SELECT %I FROM public.%I)',
          fk.tbl, fk.col, fk.col, fk.ref_col, fk.ref_tbl
        );
      END IF;
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', fk.tbl, fk.cname);
    END;
  END LOOP;
END $$;
