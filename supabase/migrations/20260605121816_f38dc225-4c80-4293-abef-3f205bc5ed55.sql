
CREATE POLICY "POCs can view all mentors"
  ON public.mentors
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role));

CREATE POLICY "POCs can view all students"
  ON public.students
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role));

CREATE POLICY "POCs can view all poc_profiles"
  ON public.poc_profiles
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'poc'::app_role));
