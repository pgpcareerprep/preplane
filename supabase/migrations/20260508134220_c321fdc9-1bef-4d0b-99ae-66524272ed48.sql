CREATE TABLE IF NOT EXISTS public.copilot_cache (
  cache_key   text PRIMARY KEY,
  response    jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  ttl_seconds int NOT NULL DEFAULT 300
);

CREATE INDEX IF NOT EXISTS copilot_cache_created_at_idx
  ON public.copilot_cache (created_at);

ALTER TABLE public.copilot_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages copilot_cache" ON public.copilot_cache;
CREATE POLICY "Service role manages copilot_cache"
  ON public.copilot_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);