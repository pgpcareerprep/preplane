-- Restore the product rule that assigned POCs may delete only their own LMPs.
-- Admin and allocator delete policies remain unchanged.

DROP POLICY IF EXISTS "Assigned POCs can delete lmp_processes" ON public.lmp_processes;
CREATE POLICY "Assigned POCs can delete lmp_processes"
  ON public.lmp_processes FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND public.is_assigned_to_lmp(id)
  );

NOTIFY pgrst, 'reload schema';
