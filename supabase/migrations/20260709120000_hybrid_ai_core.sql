-- Hybrid AI core tables (Phase 0). Append-only migration — do not edit prior migrations.
-- Rollback script: services/infra/migrations/rollback_hybrid_ai_core.sql

BEGIN;

-- Idempotency key on staged write confirmations
ALTER TABLE public.copilot_pending_actions
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS copilot_pending_actions_idempotency_key_unique
  ON public.copilot_pending_actions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Immutable command execution log
CREATE TABLE IF NOT EXISTS public.command_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key  text        NOT NULL,
  command          text        NOT NULL,
  entity_id        text,
  payload          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  requested_by     uuid        NOT NULL,
  issued_at        timestamptz NOT NULL,
  executed_at      timestamptz NOT NULL DEFAULT now(),
  result           jsonb,
  correlation_id   text,
  causation_id     text
);

CREATE UNIQUE INDEX IF NOT EXISTS command_log_idempotency_key_unique
  ON public.command_log (idempotency_key);

CREATE INDEX IF NOT EXISTS command_log_executed_at_idx
  ON public.command_log (executed_at DESC);

ALTER TABLE public.command_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read command_log" ON public.command_log;
CREATE POLICY "Admins read command_log"
  ON public.command_log FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Transactional outbox for event bus relay
CREATE TABLE IF NOT EXISTS public.event_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      text        NOT NULL,
  entity_id       text,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  actor           jsonb,
  causation_id    text,
  correlation_id  text,
  published_at    timestamptz,
  status          text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'published', 'failed'))
);

CREATE INDEX IF NOT EXISTS event_outbox_pending_idx
  ON public.event_outbox (status, occurred_at)
  WHERE status = 'pending';

ALTER TABLE public.event_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read event_outbox" ON public.event_outbox;
CREATE POLICY "Admins read event_outbox"
  ON public.event_outbox FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Dead letter queue for exhausted event consumers
CREATE TABLE IF NOT EXISTS public.dead_letter_queue (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  stream_name  text        NOT NULL,
  message_id   text,
  payload      jsonb       NOT NULL,
  error        text,
  retry_count  int         NOT NULL DEFAULT 0,
  failed_at    timestamptz NOT NULL DEFAULT now(),
  replayed_at  timestamptz
);

CREATE INDEX IF NOT EXISTS dead_letter_queue_failed_at_idx
  ON public.dead_letter_queue (failed_at DESC);

ALTER TABLE public.dead_letter_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage dead_letter_queue" ON public.dead_letter_queue;
CREATE POLICY "Admins manage dead_letter_queue"
  ON public.dead_letter_queue FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

COMMIT;
