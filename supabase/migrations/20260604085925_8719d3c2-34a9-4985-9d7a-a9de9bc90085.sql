
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.rag_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  chunk_index integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(768),
  model text NOT NULL DEFAULT 'text-embedding-004',
  embedded_at timestamptz NOT NULL DEFAULT now(),
  source_updated_at timestamptz,
  CONSTRAINT rag_embeddings_unique UNIQUE (source_table, source_id, chunk_index)
);

GRANT SELECT ON public.rag_embeddings TO authenticated;
GRANT ALL ON public.rag_embeddings TO service_role;

ALTER TABLE public.rag_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages embeddings" ON public.rag_embeddings;
CREATE POLICY "Service role manages embeddings"
  ON public.rag_embeddings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated can read embeddings" ON public.rag_embeddings;
CREATE POLICY "Authenticated can read embeddings"
  ON public.rag_embeddings FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS rag_embeddings_vector_idx
  ON public.rag_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS rag_embeddings_source_idx
  ON public.rag_embeddings (source_table, source_id);

CREATE OR REPLACE FUNCTION public.rag_search(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.70,
  match_count int DEFAULT 8,
  filter_tables text[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  source_table text,
  source_id uuid,
  content text,
  metadata jsonb,
  similarity float
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
  ORDER BY e.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rag_search(vector, float, int, text[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trigger_embed_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InloemNoZXFqem1pa2VjenpvZWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NjI2NTUsImV4cCI6MjA5MzUzODY1NX0.QNcI87Zi23Xl94RJrm16h5HCvnFZR2ATCKWnOwVNP8Q';
  v_cron_token text;
  v_payload jsonb;
BEGIN
  SELECT token INTO v_cron_token FROM public._internal_cron_auth WHERE id = 't' LIMIT 1;

  v_payload := jsonb_build_object(
    'op', 'sync-record',
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW)
  );

  PERFORM net.http_post(
    url := 'https://yhzcheqjzmikeczzoeih.supabase.co/functions/v1/embed-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', v_anon_key,
      'Authorization', 'Bearer ' || v_anon_key,
      'x-embed-trigger', COALESCE(v_cron_token, '')
    ),
    body := v_payload
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'trigger_embed_sync failed for %: %', TG_TABLE_NAME, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS embed_lmp_processes ON public.lmp_processes;
CREATE TRIGGER embed_lmp_processes
  AFTER INSERT OR UPDATE ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.trigger_embed_sync();

DROP TRIGGER IF EXISTS embed_students ON public.students;
CREATE TRIGGER embed_students
  AFTER INSERT OR UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.trigger_embed_sync();

DROP TRIGGER IF EXISTS embed_poc_profiles ON public.poc_profiles;
CREATE TRIGGER embed_poc_profiles
  AFTER INSERT OR UPDATE ON public.poc_profiles
  FOR EACH ROW EXECUTE FUNCTION public.trigger_embed_sync();

DROP TRIGGER IF EXISTS embed_mentors ON public.mentors;
CREATE TRIGGER embed_mentors
  AFTER INSERT OR UPDATE ON public.mentors
  FOR EACH ROW EXECUTE FUNCTION public.trigger_embed_sync();

DROP TRIGGER IF EXISTS embed_alumni_records ON public.alumni_records;
CREATE TRIGGER embed_alumni_records
  AFTER INSERT OR UPDATE ON public.alumni_records
  FOR EACH ROW EXECUTE FUNCTION public.trigger_embed_sync();

DROP TRIGGER IF EXISTS embed_daily_logs ON public.lmp_daily_logs;
CREATE TRIGGER embed_daily_logs
  AFTER INSERT ON public.lmp_daily_logs
  FOR EACH ROW EXECUTE FUNCTION public.trigger_embed_sync();
