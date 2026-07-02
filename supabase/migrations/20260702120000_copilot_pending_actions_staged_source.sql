-- Align copilot_pending_actions with server-staged write confirmation flow.

BEGIN;

ALTER TABLE public.copilot_pending_actions
  ADD COLUMN IF NOT EXISTS source text;

UPDATE public.copilot_pending_actions
SET status = 'staged'
WHERE status = 'pending';

ALTER TABLE public.copilot_pending_actions
  ALTER COLUMN status SET DEFAULT 'staged';

COMMIT;
