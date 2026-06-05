CREATE TABLE public.activity_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  actor_name TEXT NOT NULL,
  poc_role_type TEXT CHECK (poc_role_type IN ('primary', 'secondary', 'outreach', 'system', 'admin')),
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  action TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view activity logs"
  ON public.activity_log
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage activity logs"
  ON public.activity_log
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_activity_log_entity ON public.activity_log (entity_type, entity_id);
CREATE INDEX idx_activity_log_created ON public.activity_log (created_at DESC);