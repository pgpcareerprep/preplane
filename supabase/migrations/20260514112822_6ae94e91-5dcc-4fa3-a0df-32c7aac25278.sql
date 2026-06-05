CREATE POLICY "Authenticated can insert lmp_candidates"
  ON public.lmp_candidates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated can update lmp_candidates"
  ON public.lmp_candidates FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated can delete lmp_candidates"
  ON public.lmp_candidates FOR DELETE
  TO authenticated
  USING (true);