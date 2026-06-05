
-- Retry queue for sheet writes that hit rate limits
CREATE TABLE IF NOT EXISTS public.sheet_write_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_name text NOT NULL,
  operation text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending | processing | done | failed
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz NOT NULL DEFAULT now(),
  enqueued_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sheet_write_queue_pending
  ON public.sheet_write_queue (status, next_retry_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_sheet_write_queue_tab
  ON public.sheet_write_queue (tab_name);

ALTER TABLE public.sheet_write_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages sheet_write_queue" ON public.sheet_write_queue;
CREATE POLICY "Service role manages sheet_write_queue"
  ON public.sheet_write_queue
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage sheet_write_queue" ON public.sheet_write_queue;
CREATE POLICY "Admins manage sheet_write_queue"
  ON public.sheet_write_queue
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated view sheet_write_queue" ON public.sheet_write_queue;
CREATE POLICY "Authenticated view sheet_write_queue"
  ON public.sheet_write_queue
  FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_sheet_write_queue_updated_at
  BEFORE UPDATE ON public.sheet_write_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Track rate-limit cooldowns per tab
ALTER TABLE public.sheets_sync_log
  ADD COLUMN IF NOT EXISTS rate_limited_until timestamptz;
