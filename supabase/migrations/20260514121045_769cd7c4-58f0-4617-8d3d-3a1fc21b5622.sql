ALTER TABLE public.lmp_processes
  ADD CONSTRAINT lmp_processes_company_role_key UNIQUE (company, role);