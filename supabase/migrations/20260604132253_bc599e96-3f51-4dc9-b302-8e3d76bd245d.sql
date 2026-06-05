-- AI usage events: one row per AI call across every AI feature
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feature text NOT NULL,                 -- copilot | voice | tts | parse_jd | embeddings
  model text,
  prompt_tokens integer NOT NULL DEFAULT 0,
  response_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  status text NOT NULL DEFAULT 'ok',     -- ok | error | rate_limited | credits_exhausted | ...
  error_message text,
  request_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON public.ai_usage_events (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_user_idx ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_feature_idx ON public.ai_usage_events (feature, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_events_model_idx ON public.ai_usage_events (model, created_at DESC);

GRANT SELECT, INSERT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;

ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

-- Admins/allocators can read all usage
CREATE POLICY "Admins and allocators can view all AI usage"
ON public.ai_usage_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'allocator')
);

-- Regular users can read their own rows
CREATE POLICY "Users can view their own AI usage"
ON public.ai_usage_events
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Authenticated users may insert their own rows (edge functions use service_role anyway)
CREATE POLICY "Users can record their own AI usage"
ON public.ai_usage_events
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Backfill from copilot_turns so the dashboard isn't empty
INSERT INTO public.ai_usage_events
  (user_id, feature, model, prompt_tokens, response_tokens, total_tokens,
   latency_ms, status, error_message, created_at, metadata)
SELECT
  ct.user_id,
  'copilot' AS feature,
  COALESCE(ct.model, 'unknown'),
  COALESCE(ct.prompt_tokens, 0),
  COALESCE(ct.response_tokens, 0),
  COALESCE(ct.total_tokens, COALESCE(ct.prompt_tokens, 0) + COALESCE(ct.response_tokens, 0)),
  ct.latency_ms,
  COALESCE(ct.status, 'ok'),
  ct.error_message,
  COALESCE(ct.started_at, ct.created_at, now()),
  jsonb_build_object(
    'thread_id', ct.thread_id,
    'mode', ct.mode,
    'scope', ct.scope,
    'tool_rounds', ct.tool_rounds,
    'tool_calls_count', ct.tool_calls_count,
    'cache_hit', ct.cache_hit,
    'backfilled', true
  )
FROM public.copilot_turns ct
WHERE ct.role = 'assistant' OR ct.role IS NULL
ON CONFLICT DO NOTHING;