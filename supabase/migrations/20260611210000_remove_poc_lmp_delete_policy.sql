-- POCs retain assigned-LMP operational access, but cannot delete the LMP itself.

DROP POLICY IF EXISTS "Assigned POCs can delete lmp_processes" ON public.lmp_processes;

NOTIFY pgrst, 'reload schema';
