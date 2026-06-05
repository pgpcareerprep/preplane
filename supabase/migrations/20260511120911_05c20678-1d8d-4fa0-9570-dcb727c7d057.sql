CREATE TABLE public.lmp_daily_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lmp_id       uuid NOT NULL,
  entry_type   text NOT NULL DEFAULT 'progress'
               CHECK (entry_type IN ('progress','no_update','comment','checklist','mentor','candidate_move')),
  author_name  text NOT NULL DEFAULT 'System',
  author_email text,
  text         text NOT NULL DEFAULT '',
  chips        text[] NOT NULL DEFAULT '{}',
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lmp_daily_logs_lmp_created
  ON public.lmp_daily_logs (lmp_id, created_at DESC);

ALTER TABLE public.lmp_daily_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lmp_daily_logs"
  ON public.lmp_daily_logs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert lmp_daily_logs"
  ON public.lmp_daily_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can manage lmp_daily_logs"
  ON public.lmp_daily_logs FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));