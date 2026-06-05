
-- 1. Add expires_at column
ALTER TABLE public.copilot_threads
  ADD COLUMN IF NOT EXISTS expires_at timestamptz
    NOT NULL DEFAULT (now() + interval '7 days');

-- 2. Backfill existing rows
UPDATE public.copilot_threads
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL OR expires_at = (created_at + interval '7 days') IS NOT TRUE;

-- 3. Index for cleanup + listing
CREATE INDEX IF NOT EXISTS idx_copilot_threads_expires
  ON public.copilot_threads (user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_copilot_threads_expires_at
  ON public.copilot_threads (expires_at);

-- 4. Cleanup function (no FK cascade exists on copilot_messages.thread_id, so delete messages explicitly)
CREATE OR REPLACE FUNCTION public.cleanup_expired_copilot_threads()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH expired AS (
    SELECT id FROM public.copilot_threads WHERE expires_at <= now()
  ),
  msg_del AS (
    DELETE FROM public.copilot_messages
    WHERE thread_id IN (SELECT id FROM expired)
    RETURNING 1
  ),
  deleted AS (
    DELETE FROM public.copilot_threads
    WHERE id IN (SELECT id FROM expired)
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN jsonb_build_object(
    'deleted_threads', deleted_count,
    'cleaned_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_copilot_threads() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_copilot_threads() TO service_role;

COMMENT ON COLUMN public.copilot_threads.expires_at IS
  'Thread automatically expires 7 days after creation. Enforced at query time and by cleanup_expired_copilot_threads().';

-- 5. Enable cron extensions for scheduled cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
