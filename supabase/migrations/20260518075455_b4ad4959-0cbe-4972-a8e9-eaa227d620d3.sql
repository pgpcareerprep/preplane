CREATE UNIQUE INDEX IF NOT EXISTS lmp_processes_lmp_code_unique
  ON public.lmp_processes (lmp_code)
  WHERE lmp_code IS NOT NULL;