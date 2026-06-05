ALTER TABLE public.copilot_turns
  ADD COLUMN IF NOT EXISTS prompt_tokens   integer GENERATED ALWAYS AS ((CEIL(COALESCE(prompt_chars,0)::numeric / 4))::integer) STORED,
  ADD COLUMN IF NOT EXISTS response_tokens integer GENERATED ALWAYS AS ((CEIL(COALESCE(response_chars,0)::numeric / 4))::integer) STORED,
  ADD COLUMN IF NOT EXISTS total_tokens    integer GENERATED ALWAYS AS ((CEIL((COALESCE(prompt_chars,0) + COALESCE(response_chars,0))::numeric / 4))::integer) STORED;

CREATE OR REPLACE VIEW public.copilot_daily_usage
WITH (security_invoker = true) AS
SELECT
  user_id,
  (created_at AT TIME ZONE 'UTC')::date AS usage_date,
  COUNT(*)::int                                                                                    AS requests_used,
  COALESCE(SUM(COALESCE(prompt_chars,0) + COALESCE(response_chars,0)), 0)::int                     AS chars_used,
  COALESCE(SUM(CEIL((COALESCE(prompt_chars,0) + COALESCE(response_chars,0))::numeric / 4)),0)::int AS tokens_used
FROM public.copilot_turns
WHERE status <> 'error'
GROUP BY user_id, (created_at AT TIME ZONE 'UTC')::date;

GRANT SELECT ON public.copilot_daily_usage TO authenticated;