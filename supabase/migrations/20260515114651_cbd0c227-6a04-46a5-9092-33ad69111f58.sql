ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS jd_text text,
  ADD COLUMN IF NOT EXISTS jd_skills jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS jd_seniority text,
  ADD COLUMN IF NOT EXISTS jd_file_name text,
  ADD COLUMN IF NOT EXISTS jd_source text,
  ADD COLUMN IF NOT EXISTS jd_uploaded_at timestamptz,
  ADD COLUMN IF NOT EXISTS jd_uploaded_by text;