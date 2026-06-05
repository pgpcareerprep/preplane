
-- 1) Backfill sessions table (idempotent) so fresh envs match live schema
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lmp_id uuid,
  mentor_id uuid,
  student_id uuid,
  session_type text DEFAULT 'mock'::text,
  status text NOT NULL DEFAULT 'scheduled'::text,
  scheduled_at timestamptz,
  completed_at timestamptz,
  duration_min integer,
  poc_name text,
  poc_feedback text,
  student_feedback_token text UNIQUE,
  student_feedback jsonb,
  student_rating numeric,
  mentor_rating numeric,
  notes text,
  recording_url text,
  sync_source text DEFAULT 'manual'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_mentor_id_fkey') THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_mentor_id_fkey FOREIGN KEY (mentor_id)
      REFERENCES public.mentors(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_student_id_fkey') THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_student_id_fkey FOREIGN KEY (student_id)
      REFERENCES public.students(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_student_id ON public.sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_sessions_mentor_id ON public.sessions(mentor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_lmp_id ON public.sessions(lmp_id);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage sessions" ON public.sessions;
CREATE POLICY "Admins can manage sessions" ON public.sessions
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins/mods can delete sessions" ON public.sessions;
CREATE POLICY "Admins/mods can delete sessions" ON public.sessions
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can insert sessions" ON public.sessions;
CREATE POLICY "Admins/mods can insert sessions" ON public.sessions
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

DROP POLICY IF EXISTS "Admins/mods can update sessions" ON public.sessions;
CREATE POLICY "Admins/mods can update sessions" ON public.sessions
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

DROP POLICY IF EXISTS "Authenticated can view sessions" ON public.sessions;
CREATE POLICY "Authenticated can view sessions" ON public.sessions
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS update_sessions_updated_at ON public.sessions;
CREATE TRIGGER update_sessions_updated_at
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS tg_sessions_feedback_sync ON public.sessions;
CREATE TRIGGER tg_sessions_feedback_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_feedback_sync();

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2) Extend lmp_mentors with missing columns
ALTER TABLE public.lmp_mentors
  ADD COLUMN IF NOT EXISTS student_id    uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS match_score   numeric,
  ADD COLUMN IF NOT EXISTS mentor_source text,
  ADD COLUMN IF NOT EXISTS session_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_by   text,
  ADD COLUMN IF NOT EXISTS notes         text;

CREATE INDEX IF NOT EXISTS idx_lmp_mentors_student_id ON public.lmp_mentors(student_id);
CREATE INDEX IF NOT EXISTS idx_lmp_mentors_lmp_id     ON public.lmp_mentors(lmp_id);
CREATE INDEX IF NOT EXISTS idx_lmp_mentors_mentor_id  ON public.lmp_mentors(mentor_id);
