-- Manual rollback for 20260709120000_hybrid_ai_core.sql (scratch DB verification only)
BEGIN;

DROP TABLE IF EXISTS public.dead_letter_queue;
DROP TABLE IF EXISTS public.event_outbox;
DROP TABLE IF EXISTS public.command_log;

DROP INDEX IF EXISTS public.copilot_pending_actions_idempotency_key_unique;
ALTER TABLE public.copilot_pending_actions DROP COLUMN IF EXISTS idempotency_key;

COMMIT;
