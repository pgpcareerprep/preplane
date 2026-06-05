
-- Allow moderators to manage poc_lmp_assignments
DROP POLICY IF EXISTS "Admins can manage poc_lmp_assignments" ON public.poc_lmp_assignments;

CREATE POLICY "Admins and moderators can manage poc_lmp_assignments"
ON public.poc_lmp_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
);

-- Allow moderators to manage lmp_processes
DROP POLICY IF EXISTS "Admins can manage lmp_processes" ON public.lmp_processes;

CREATE POLICY "Admins and moderators can manage lmp_processes"
ON public.lmp_processes
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator')
);
