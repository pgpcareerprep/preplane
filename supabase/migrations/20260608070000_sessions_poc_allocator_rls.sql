-- Sessions INSERT/UPDATE/DELETE were restricted to admin/moderator only.
-- POCs who own LMPs need to be able to schedule, update status, and delete
-- sessions (mark complete, no-show, reschedule, cancel). Without these
-- policies, confirmAssignment silently failed for all POC/allocator users,
-- leaving the Sessions tab at 0 even after a successful mentor assignment.

DROP POLICY IF EXISTS "POCs and allocators can insert sessions" ON public.sessions;
CREATE POLICY "POCs and allocators can insert sessions"
  ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'poc'::app_role) OR
    has_role(auth.uid(), 'allocator'::app_role)
  );

DROP POLICY IF EXISTS "POCs and allocators can update sessions" ON public.sessions;
CREATE POLICY "POCs and allocators can update sessions"
  ON public.sessions
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'poc'::app_role) OR
    has_role(auth.uid(), 'allocator'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'poc'::app_role) OR
    has_role(auth.uid(), 'allocator'::app_role)
  );

DROP POLICY IF EXISTS "POCs and allocators can delete sessions" ON public.sessions;
CREATE POLICY "POCs and allocators can delete sessions"
  ON public.sessions
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'poc'::app_role) OR
    has_role(auth.uid(), 'allocator'::app_role)
  );
