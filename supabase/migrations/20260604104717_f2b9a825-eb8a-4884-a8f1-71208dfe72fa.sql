
-- Manual (singleton table; we just keep latest row)
CREATE TABLE public.lmp_guide_manual (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'LMP Process Manual',
  url text,
  description text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmp_guide_manual TO authenticated;
GRANT ALL ON public.lmp_guide_manual TO service_role;

ALTER TABLE public.lmp_guide_manual ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed-in can read manual"
  ON public.lmp_guide_manual FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins/allocators can insert manual"
  ON public.lmp_guide_manual FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND lower(role) IN ('admin','allocator')
        AND COALESCE(access_status,'approved') = 'approved'
        AND is_active <> false
    )
  );

CREATE POLICY "Admins/allocators can update manual"
  ON public.lmp_guide_manual FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND lower(role) IN ('admin','allocator')
        AND COALESCE(access_status,'approved') = 'approved'
        AND is_active <> false
    )
  );

CREATE POLICY "Admins/allocators can delete manual"
  ON public.lmp_guide_manual FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND lower(role) IN ('admin','allocator')
        AND COALESCE(access_status,'approved') = 'approved'
        AND is_active <> false
    )
  );

CREATE TRIGGER lmp_guide_manual_set_updated_at
  BEFORE UPDATE ON public.lmp_guide_manual
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Nested folder/link repository
CREATE TABLE public.lmp_guide_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.lmp_guide_nodes(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('folder','link')),
  name text NOT NULL,
  url text,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lmp_guide_nodes_parent_idx ON public.lmp_guide_nodes(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lmp_guide_nodes TO authenticated;
GRANT ALL ON public.lmp_guide_nodes TO service_role;

ALTER TABLE public.lmp_guide_nodes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed-in can read nodes"
  ON public.lmp_guide_nodes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins/allocators can insert nodes"
  ON public.lmp_guide_nodes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND lower(role) IN ('admin','allocator')
        AND COALESCE(access_status,'approved') = 'approved'
        AND is_active <> false
    )
  );

CREATE POLICY "Admins/allocators can update nodes"
  ON public.lmp_guide_nodes FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND lower(role) IN ('admin','allocator')
        AND COALESCE(access_status,'approved') = 'approved'
        AND is_active <> false
    )
  );

CREATE POLICY "Admins/allocators can delete nodes"
  ON public.lmp_guide_nodes FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND lower(role) IN ('admin','allocator')
        AND COALESCE(access_status,'approved') = 'approved'
        AND is_active <> false
    )
  );

CREATE TRIGGER lmp_guide_nodes_set_updated_at
  BEFORE UPDATE ON public.lmp_guide_nodes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
