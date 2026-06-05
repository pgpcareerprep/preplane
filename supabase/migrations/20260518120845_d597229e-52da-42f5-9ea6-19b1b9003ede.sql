-- Allow multiple LMP processes for the same company+role.
-- Each row is uniquely identified by lmp_code (already unique).
DROP INDEX IF EXISTS public.lmp_processes_company_role_key;
ALTER TABLE public.lmp_processes DROP CONSTRAINT IF EXISTS lmp_processes_company_role_key;