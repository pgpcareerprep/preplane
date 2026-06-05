-- Dedupe existing rows: keep the most recently updated per (student_name, cohort)
DELETE FROM public.alumni_records a
USING public.alumni_records b
WHERE a.student_name = b.student_name
  AND a.cohort IS NOT DISTINCT FROM b.cohort
  AND a.updated_at < b.updated_at;

-- Add composite unique constraint to enable upsert onConflict
ALTER TABLE public.alumni_records
  ADD CONSTRAINT alumni_unique_name_cohort UNIQUE (student_name, cohort);