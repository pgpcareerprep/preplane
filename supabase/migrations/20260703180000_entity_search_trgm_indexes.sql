-- Speed up entity typeahead with trigram indexes on searched name columns.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_students_name_trgm
  ON public.students USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_poc_profiles_name_trgm
  ON public.poc_profiles USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lmp_processes_company_trgm
  ON public.lmp_processes USING gin (company gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_lmp_processes_role_trgm
  ON public.lmp_processes USING gin (role gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_alumni_records_name_trgm
  ON public.alumni_records USING gin (student_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_domains_name_trgm
  ON public.domains USING gin (name gin_trgm_ops);
