
CREATE TABLE IF NOT EXISTS public.copilot_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  thread_id uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  latency_ms integer,
  role text,
  mode text,
  scope text,
  model text,
  intent text,
  prompt_chars integer,
  response_chars integer,
  tool_rounds integer DEFAULT 0,
  tool_calls_count integer DEFAULT 0,
  tools_used jsonb DEFAULT '[]'::jsonb,
  used_write_tool boolean DEFAULT false,
  cache_hit boolean DEFAULT false,
  status text DEFAULT 'ok',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_turns_user ON public.copilot_turns(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_copilot_turns_thread ON public.copilot_turns(thread_id, created_at DESC);

ALTER TABLE public.copilot_turns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own copilot turns"
  ON public.copilot_turns FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins read all copilot turns"
  ON public.copilot_turns FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
