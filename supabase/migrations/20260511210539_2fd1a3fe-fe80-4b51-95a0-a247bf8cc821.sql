
CREATE TABLE IF NOT EXISTS public.copilot_pending_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  actor_name text,
  role text NOT NULL DEFAULT 'poc',
  action_kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_snapshot jsonb,
  proposed_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending',
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  executed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_copilot_pending_actions_status
  ON public.copilot_pending_actions (status, expires_at);

ALTER TABLE public.copilot_pending_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read own pending actions" ON public.copilot_pending_actions;
CREATE POLICY "Authenticated can read own pending actions"
  ON public.copilot_pending_actions FOR SELECT
  TO authenticated
  USING (user_id IS NULL OR user_id = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins manage pending actions" ON public.copilot_pending_actions;
CREATE POLICY "Admins manage pending actions"
  ON public.copilot_pending_actions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
