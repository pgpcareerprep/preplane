
CREATE TABLE public.copilot_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copilot_threads_user_idx ON public.copilot_threads(user_id, last_message_at DESC);

CREATE TABLE public.copilot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.copilot_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant','note')),
  content text NOT NULL DEFAULT '',
  ts bigint NOT NULL,
  mentions jsonb NOT NULL DEFAULT '[]'::jsonb,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX copilot_messages_thread_idx ON public.copilot_messages(thread_id, ts ASC);

ALTER TABLE public.copilot_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.copilot_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own threads"
  ON public.copilot_threads FOR ALL TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users manage own messages"
  ON public.copilot_messages FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.copilot_threads t
      WHERE t.id = thread_id
        AND (t.user_id = auth.uid() OR t.user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.copilot_threads t
      WHERE t.id = thread_id
        AND (t.user_id = auth.uid() OR t.user_id IS NULL OR has_role(auth.uid(), 'admin'::app_role))
    )
  );

CREATE TRIGGER copilot_threads_updated_at
  BEFORE UPDATE ON public.copilot_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
