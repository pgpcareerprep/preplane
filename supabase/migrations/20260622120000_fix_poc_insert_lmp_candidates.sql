-- Allow assigned Prep/Support POCs to add candidates to their LMP processes.
-- Regression: 20260610170000 dropped broad authenticated INSERT but never added
-- an assigned-POC INSERT policy (UPDATE/DELETE were added in later migrations).

DROP POLICY IF EXISTS "Assigned POCs can insert lmp_candidates" ON public.lmp_candidates;
CREATE POLICY "Assigned POCs can insert lmp_candidates"
  ON public.lmp_candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND public.is_assigned_to_lmp(lmp_id)
  );

NOTIFY pgrst, 'reload schema';
