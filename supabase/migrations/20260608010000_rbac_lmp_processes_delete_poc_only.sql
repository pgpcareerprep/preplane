-- RBAC: restrict lmp_processes DELETE to assigned prep/support POC only.
-- Admin and allocator retain INSERT/UPDATE/SELECT but NOT DELETE.
-- Outreach POC cannot delete; only prep_poc_id / support_poc_id may delete.

-- 1. Drop the current FOR ALL policy (covers SELECT/INSERT/UPDATE/DELETE).
DROP POLICY IF EXISTS "Admins and allocators can manage lmp_processes" ON public.lmp_processes;

-- 2. Recreate without DELETE so admin/allocator can no longer delete.
CREATE POLICY "Admins and allocators can manage lmp_processes"
  ON public.lmp_processes FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

CREATE POLICY "Admins and allocators can select lmp_processes"
  ON public.lmp_processes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

CREATE POLICY "Admins and allocators can update lmp_processes"
  ON public.lmp_processes FOR UPDATE TO authenticated
  USING  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

-- 3. POC DELETE: only the assigned Primary (prep_poc_id) or Support (support_poc_id) POC.
--    Outreach POC (outreach_poc_ids) is deliberately excluded.
DROP POLICY IF EXISTS "Assigned POC can delete lmp_processes" ON public.lmp_processes;
CREATE POLICY "Assigned POC can delete lmp_processes"
  ON public.lmp_processes FOR DELETE TO authenticated
  USING (
    public.current_poc_id() IS NOT NULL
    AND (
      prep_poc_id    = public.current_poc_id()
      OR support_poc_id = public.current_poc_id()
    )
  );
