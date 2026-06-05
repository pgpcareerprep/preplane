-- Drop the expression index in favor of a true constraint the upsert can target.
DROP INDEX IF EXISTS public.uq_lmp_processes_company_role_ci;

-- Trim/normalize stored values so case variants collapse.
UPDATE public.lmp_processes
SET company = trim(company), role = trim(role)
WHERE company <> trim(company) OR role <> trim(role);

ALTER TABLE public.lmp_processes
  ADD CONSTRAINT lmp_processes_company_role_key UNIQUE (company, role);