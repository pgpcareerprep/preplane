CREATE TABLE IF NOT EXISTS public.sheets_sync_log (
  tab_name TEXT PRIMARY KEY,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  row_count INTEGER NOT NULL DEFAULT 0,
  last_status TEXT NOT NULL DEFAULT 'success',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sheets_sync_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view sheets_sync_log" ON public.sheets_sync_log;
CREATE POLICY "Authenticated can view sheets_sync_log"
  ON public.sheets_sync_log FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role manages sheets_sync_log" ON public.sheets_sync_log;
CREATE POLICY "Service role manages sheets_sync_log"
  ON public.sheets_sync_log FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins manage sheets_sync_log" ON public.sheets_sync_log;
CREATE POLICY "Admins manage sheets_sync_log"
  ON public.sheets_sync_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.sheets_sync_log (tab_name, last_synced_at, last_status)
SELECT tab_name, MAX(created_at), 'success'
FROM public.sheet_sync_events
WHERE status = 'success'
GROUP BY tab_name
ON CONFLICT (tab_name) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lmp_mentors_lmp_mentor_unique') THEN
    ALTER TABLE public.lmp_mentors
      ADD CONSTRAINT lmp_mentors_lmp_mentor_unique UNIQUE (lmp_id, mentor_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lmp_candidates_lmp_student_name_unique') THEN
    ALTER TABLE public.lmp_candidates
      ADD CONSTRAINT lmp_candidates_lmp_student_name_unique UNIQUE (lmp_id, student_name);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lmp_daily_logs_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_daily_logs
      ADD CONSTRAINT lmp_daily_logs_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lmp_timeline_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_timeline
      ADD CONSTRAINT lmp_timeline_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lmp_checklists_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_checklists
      ADD CONSTRAINT lmp_checklists_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lmp_progress_reminders_lmp_id_fkey') THEN
    ALTER TABLE public.lmp_progress_reminders
      ADD CONSTRAINT lmp_progress_reminders_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_lmp_id_fkey') THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_lmp_id_fkey
      FOREIGN KEY (lmp_id) REFERENCES public.lmp_processes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.tg_sync_mentor_aligned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lmp uuid;
BEGIN
  v_lmp := COALESCE(NEW.lmp_id, OLD.lmp_id);
  IF v_lmp IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  UPDATE public.lmp_processes
    SET mentor_aligned = EXISTS (
      SELECT 1 FROM public.lmp_mentors
      WHERE lmp_id = v_lmp AND COALESCE(status, 'assigned') NOT IN ('removed','cancelled')
    )
  WHERE id = v_lmp;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_mentor_aligned_trg ON public.lmp_mentors;
CREATE TRIGGER sync_mentor_aligned_trg
AFTER INSERT OR UPDATE OR DELETE ON public.lmp_mentors
FOR EACH ROW EXECUTE FUNCTION public.tg_sync_mentor_aligned();

UPDATE public.lmp_processes lp
SET mentor_aligned = EXISTS (
  SELECT 1 FROM public.lmp_mentors lm
  WHERE lm.lmp_id = lp.id AND COALESCE(lm.status,'assigned') NOT IN ('removed','cancelled')
);

CREATE INDEX IF NOT EXISTS copilot_cache_created_at_idx ON public.copilot_cache (created_at);