CREATE POLICY "POCs can view alumni_records"
  ON public.alumni_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'poc'));

CREATE POLICY "POCs can view students"
  ON public.students FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'poc'));

CREATE POLICY "POCs can view mentors"
  ON public.mentors FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'poc'));

CREATE POLICY "POCs can view poc_profiles"
  ON public.poc_profiles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'poc'));