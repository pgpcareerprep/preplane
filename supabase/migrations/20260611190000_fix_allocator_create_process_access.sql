-- Restore allocator create-process access without granting administrator rights.

-- Draft ownership is always tied to the authenticated caller. Admins retain
-- the ability to manage all drafts; allocators can manage only their own.
CREATE OR REPLACE FUNCTION public.set_lmp_process_draft_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;

  IF TG_OP = 'INSERT' AND (
    NEW.created_by IS NULL
    OR NOT public.has_role(auth.uid(), 'admin'::public.app_role)
  ) THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_lmp_process_draft_owner ON public.lmp_process_drafts;
CREATE TRIGGER trg_set_lmp_process_draft_owner
  BEFORE INSERT ON public.lmp_process_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_lmp_process_draft_owner();

DROP POLICY IF EXISTS "Users manage own drafts" ON public.lmp_process_drafts;
DROP POLICY IF EXISTS "Admins and allocators view drafts" ON public.lmp_process_drafts;
DROP POLICY IF EXISTS "Admins and allocators insert drafts" ON public.lmp_process_drafts;
DROP POLICY IF EXISTS "Admins and allocators update drafts" ON public.lmp_process_drafts;
DROP POLICY IF EXISTS "Admins and allocators delete drafts" ON public.lmp_process_drafts;

CREATE POLICY "Admins and allocators view drafts"
  ON public.lmp_process_drafts FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'allocator'::public.app_role)
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Admins and allocators insert drafts"
  ON public.lmp_process_drafts FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'allocator'::public.app_role)
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Admins and allocators update drafts"
  ON public.lmp_process_drafts FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'allocator'::public.app_role)
      AND created_by = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'allocator'::public.app_role)
      AND created_by = auth.uid()
    )
  );

CREATE POLICY "Admins and allocators delete drafts"
  ON public.lmp_process_drafts FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      public.has_role(auth.uid(), 'allocator'::public.app_role)
      AND created_by = auth.uid()
    )
  );

-- Replace broad/duplicated read policies with the explicit product role rule.
DROP POLICY IF EXISTS "Authenticated can view students" ON public.students;
DROP POLICY IF EXISTS "POCs can view students" ON public.students;
DROP POLICY IF EXISTS "POCs can view all students" ON public.students;
DROP POLICY IF EXISTS "Create-process roles can view students" ON public.students;
CREATE POLICY "Create-process roles can view students"
  ON public.students FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'allocator'::public.app_role)
    OR public.has_role(auth.uid(), 'poc'::public.app_role)
  );

DROP POLICY IF EXISTS "Authenticated can view poc_profiles" ON public.poc_profiles;
DROP POLICY IF EXISTS "POCs can view poc_profiles" ON public.poc_profiles;
DROP POLICY IF EXISTS "POCs can view all poc_profiles" ON public.poc_profiles;
DROP POLICY IF EXISTS "Create-process roles can view poc_profiles" ON public.poc_profiles;
CREATE POLICY "Create-process roles can view poc_profiles"
  ON public.poc_profiles FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'allocator'::public.app_role)
    OR public.has_role(auth.uid(), 'poc'::public.app_role)
  );
