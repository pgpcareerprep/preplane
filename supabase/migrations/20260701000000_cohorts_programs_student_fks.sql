-- Phase 1: Cohort / program master tables + student FKs (additive only).
-- Rollback: DROP VIEW students_with_load; recreate prior view; DROP columns; DROP tables.

-- ============ cohorts ============
CREATE TABLE IF NOT EXISTS public.cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cohorts_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS cohorts_is_active_idx ON public.cohorts (is_active);

-- ============ programs ============
CREATE TABLE IF NOT EXISTS public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cohort_id uuid NOT NULL REFERENCES public.cohorts(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  aliases text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programs_cohort_code_unique UNIQUE (cohort_id, code)
);

CREATE INDEX IF NOT EXISTS programs_cohort_id_idx ON public.programs (cohort_id);
CREATE INDEX IF NOT EXISTS programs_is_active_idx ON public.programs (is_active);

-- ============ students FKs ============
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS cohort_id uuid REFERENCES public.cohorts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS students_cohort_id_idx ON public.students (cohort_id);
CREATE INDEX IF NOT EXISTS students_program_id_idx ON public.students (program_id);

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.normalize_cohort_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(trim(NEW.code));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_program_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.code := upper(trim(NEW.code));
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_cohort_code ON public.cohorts;
CREATE TRIGGER trg_normalize_cohort_code
  BEFORE INSERT OR UPDATE ON public.cohorts
  FOR EACH ROW EXECUTE FUNCTION public.normalize_cohort_code();

DROP TRIGGER IF EXISTS trg_normalize_program_row ON public.programs;
CREATE TRIGGER trg_normalize_program_row
  BEFORE INSERT OR UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.normalize_program_row();

-- ============ students_with_load view ============
DROP VIEW IF EXISTS public.students_with_load;
CREATE VIEW public.students_with_load AS
SELECT
  s.*,
  co.code AS cohort_code,
  co.name AS cohort_name,
  pr.code AS program_code,
  pr.name AS program_name,
  CASE
    WHEN co.code IS NOT NULL AND pr.code IS NOT NULL
      THEN co.code || ' · ' || pr.code
    ELSE NULL
  END AS batch_label,
  COALESCE(lc.converted_count, 0)::bigint AS converted_count,
  lc.last_activity_at
FROM public.students s
LEFT JOIN public.cohorts co ON co.id = s.cohort_id
LEFT JOIN public.programs pr ON pr.id = s.program_id
LEFT JOIN (
  SELECT
    student_id,
    count(*) FILTER (WHERE pipeline_stage = 'converted') AS converted_count,
    max(updated_at) AS last_activity_at
  FROM public.lmp_candidates
  WHERE student_id IS NOT NULL
  GROUP BY student_id
) lc ON lc.student_id = s.id;

ALTER VIEW public.students_with_load SET (security_invoker = true);
GRANT SELECT ON public.students_with_load TO authenticated, anon;

-- ============ RLS ============
ALTER TABLE public.cohorts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Create-process roles can view cohorts" ON public.cohorts;
CREATE POLICY "Create-process roles can view cohorts"
  ON public.cohorts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'allocator'::public.app_role)
    OR public.has_role(auth.uid(), 'poc'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins can manage cohorts" ON public.cohorts;
CREATE POLICY "Admins can manage cohorts"
  ON public.cohorts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Create-process roles can view programs" ON public.programs;
CREATE POLICY "Create-process roles can view programs"
  ON public.programs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'allocator'::public.app_role)
    OR public.has_role(auth.uid(), 'poc'::public.app_role)
  );

DROP POLICY IF EXISTS "Admins can manage programs" ON public.programs;
CREATE POLICY "Admins can manage programs"
  ON public.programs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
