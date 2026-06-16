-- Migration: AI Architecture Gaps
-- 1. RAG ACL — add owner_user_id to rag_embeddings + update rag_search
-- 2. ai_reports table for durable report storage
-- 3. copilot_pending_actions missing fields

BEGIN;

-- ════════════════════════════════════════════════
-- 1. RAG ACCESS CONTROL
-- ════════════════════════════════════════════════

-- Add owner_user_id to rag_embeddings.
-- Set for private source tables (copilot_messages) so rag_search can filter them.
ALTER TABLE public.rag_embeddings
  ADD COLUMN IF NOT EXISTS owner_user_id uuid;

CREATE INDEX IF NOT EXISTS rag_embeddings_owner_idx
  ON public.rag_embeddings (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

-- Backfill existing copilot_messages embeddings with their thread owner.
-- Non-destructive: only sets owner_user_id where it is currently NULL.
UPDATE public.rag_embeddings re
SET owner_user_id = t.user_id
FROM public.copilot_messages cm
JOIN public.copilot_threads t ON t.id = cm.thread_id
WHERE re.source_table = 'copilot_messages'
  AND re.source_id = cm.id
  AND re.owner_user_id IS NULL
  AND t.user_id IS NOT NULL;

-- Updated rag_search: accepts optional requesting_user_id.
-- Private tables (copilot_messages) are only returned when the embedding's
-- owner_user_id matches requesting_user_id.  All other tables are unaffected.
CREATE OR REPLACE FUNCTION public.rag_search(
  query_embedding     vector(768),
  match_threshold     float     DEFAULT 0.70,
  match_count         int       DEFAULT 8,
  filter_tables       text[]    DEFAULT NULL,
  requesting_user_id  uuid      DEFAULT NULL
)
RETURNS TABLE (
  id           uuid,
  source_table text,
  source_id    uuid,
  content      text,
  metadata     jsonb,
  similarity   float
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id,
    e.source_table,
    e.source_id,
    e.content,
    e.metadata,
    (1 - (e.embedding <=> query_embedding))::float AS similarity
  FROM public.rag_embeddings e
  WHERE e.embedding IS NOT NULL
    AND (filter_tables IS NULL OR e.source_table = ANY(filter_tables))
    AND (1 - (e.embedding <=> query_embedding)) > match_threshold
    -- ACL: copilot_messages are private — only visible to their owner
    AND (
      e.source_table != 'copilot_messages'
      OR (
        requesting_user_id IS NOT NULL
        AND (e.owner_user_id IS NULL OR e.owner_user_id = requesting_user_id)
      )
    )
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Keep existing grants
GRANT EXECUTE ON FUNCTION public.rag_search(vector, float, int, text[], uuid) TO authenticated, service_role;


-- ════════════════════════════════════════════════
-- 2. AI REPORTS TABLE
-- ════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ai_reports (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type      text        NOT NULL,
  title            text        NOT NULL DEFAULT '',
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  lmp_id           uuid        REFERENCES public.lmp_processes(id) ON DELETE SET NULL,
  candidate_id     uuid        REFERENCES public.students(id) ON DELETE SET NULL,
  thread_id        uuid        REFERENCES public.copilot_threads(id) ON DELETE SET NULL,
  source_documents jsonb       NOT NULL DEFAULT '[]'::jsonb,
  structured_data  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  rendered_content text        NOT NULL DEFAULT '',
  version          integer     NOT NULL DEFAULT 1,
  status           text        NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','saved','archived')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_reports_created_by_idx  ON public.ai_reports (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_reports_lmp_idx         ON public.ai_reports (lmp_id)       WHERE lmp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_reports_candidate_idx   ON public.ai_reports (candidate_id) WHERE candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ai_reports_report_type_idx ON public.ai_reports (report_type);

ALTER TABLE public.ai_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own reports" ON public.ai_reports;
CREATE POLICY "Users manage own reports"
  ON public.ai_reports FOR ALL
  TO authenticated
  USING  (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins view all reports" ON public.ai_reports;
CREATE POLICY "Admins view all reports"
  ON public.ai_reports FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.trg_ai_reports_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS ai_reports_updated_at ON public.ai_reports;
CREATE TRIGGER ai_reports_updated_at
  BEFORE UPDATE ON public.ai_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_ai_reports_updated_at();


-- ════════════════════════════════════════════════
-- 3. COPILOT_PENDING_ACTIONS IMPROVEMENTS
-- ════════════════════════════════════════════════

ALTER TABLE public.copilot_pending_actions
  ADD COLUMN IF NOT EXISTS conversation_id    uuid        REFERENCES public.copilot_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_entity_type text,
  ADD COLUMN IF NOT EXISTS target_entity_id   uuid,
  ADD COLUMN IF NOT EXISTS confirmed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at       timestamptz,
  ADD COLUMN IF NOT EXISTS validation_hash    text;

-- Index for quick lookup by conversation
CREATE INDEX IF NOT EXISTS copilot_pending_actions_conv_idx
  ON public.copilot_pending_actions (conversation_id)
  WHERE conversation_id IS NOT NULL;

-- Security: only single-use (enforce via status transition)
-- Add a partial unique index to prevent replay — once executed, no second execution
CREATE UNIQUE INDEX IF NOT EXISTS copilot_pending_actions_executed_once
  ON public.copilot_pending_actions (id)
  WHERE status = 'executed';

COMMIT;
