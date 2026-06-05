
-- ═══════════════════════════════════════════════════════
-- 1. sheet_sync_events — logs every bidirectional sync op
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.sheet_sync_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_name text NOT NULL,
  direction text NOT NULL DEFAULT 'sheet_to_app',
  operation text NOT NULL DEFAULT 'read',
  record_id text,
  fields_synced jsonb DEFAULT '[]'::jsonb,
  field_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  synced_by text DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sheet_sync_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage sync events"
  ON public.sheet_sync_events FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view sync events"
  ON public.sheet_sync_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can insert sync events"
  ON public.sheet_sync_events FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Service can insert sync events"
  ON public.sheet_sync_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE INDEX idx_sync_events_tab ON public.sheet_sync_events (tab_name);
CREATE INDEX idx_sync_events_created ON public.sheet_sync_events (created_at DESC);
CREATE INDEX idx_sync_events_record ON public.sheet_sync_events (record_id);

-- ═══════════════════════════════════════════════════════
-- 2. field_mapping_registry — column↔field map with metadata
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.field_mapping_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_name text NOT NULL,
  sheet_column text NOT NULL,
  app_field text,
  sync_direction text NOT NULL DEFAULT 'read',
  is_mapped boolean NOT NULL DEFAULT false,
  data_coverage_pct integer DEFAULT 0,
  last_verified_at timestamptz DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tab_name, sheet_column)
);

ALTER TABLE public.field_mapping_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage field mappings"
  ON public.field_mapping_registry FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view field mappings"
  ON public.field_mapping_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anon can read field mappings"
  ON public.field_mapping_registry FOR SELECT
  TO anon
  USING (true);

CREATE TRIGGER update_field_mapping_registry_updated_at
  BEFORE UPDATE ON public.field_mapping_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
