-- Fix: remove anonymous SELECT access on field_mapping_registry
DROP POLICY IF EXISTS "Anon can read field mappings" ON public.field_mapping_registry;

-- Fix: restrict lmp_mentors writes to admins/allocators (was: any authenticated)
DROP POLICY IF EXISTS "Authenticated can insert lmp_mentors" ON public.lmp_mentors;
DROP POLICY IF EXISTS "Authenticated can update lmp_mentors" ON public.lmp_mentors;

CREATE POLICY "Admins/allocators can insert lmp_mentors"
  ON public.lmp_mentors
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

CREATE POLICY "Admins/allocators can update lmp_mentors"
  ON public.lmp_mentors
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role));

-- Fix: restrict JDs bucket uploads to admins/allocators (was: any authenticated user)
DROP POLICY IF EXISTS "jds_authenticated_write" ON storage.objects;

CREATE POLICY "jds admins/allocators can upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'jds'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  );

CREATE POLICY "jds admins/allocators can update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'jds'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  )
  WITH CHECK (
    bucket_id = 'jds'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  );

CREATE POLICY "jds admins/allocators can delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'jds'
    AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'allocator'::app_role))
  );
