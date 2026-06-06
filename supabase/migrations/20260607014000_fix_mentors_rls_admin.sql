-- Allow admins and allocators to view mentors (was restricted to poc role only)
CREATE POLICY "Admins/allocators can view mentors"
  ON public.mentors FOR SELECT
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'allocator'::app_role)
  );
