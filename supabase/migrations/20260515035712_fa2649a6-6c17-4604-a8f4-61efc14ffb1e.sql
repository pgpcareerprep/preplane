CREATE TABLE IF NOT EXISTS public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL DEFAULT '',
  ts bigint NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copilot_messages_thread ON public.copilot_messages(thread_id, ts);

ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own messages"
  ON public.copilot_messages FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.copilot_threads t
    WHERE t.id = copilot_messages.thread_id
      AND (t.user_id = auth.uid() OR t.user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.copilot_threads t
    WHERE t.id = copilot_messages.thread_id
      AND (t.user_id = auth.uid() OR t.user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role))
  ));