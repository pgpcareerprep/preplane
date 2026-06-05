
-- 1. Tighten has_role to require approved + active profile
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND role = _role::text
      AND COALESCE(access_status, 'approved') = 'approved'
      AND COALESCE(is_active, true) = true
  )
$$;

-- 2. Remove blanket POC-role SELECT policies on sensitive tables
DROP POLICY IF EXISTS "POCs can view mentors" ON public.mentors;
DROP POLICY IF EXISTS "POCs can view students" ON public.students;
DROP POLICY IF EXISTS "POCs can view poc_profiles" ON public.poc_profiles;

-- 3. Tighten authenticated INSERT policies (require an auth user)
DROP POLICY IF EXISTS "Authenticated can insert activity logs" ON public.activity_log;
CREATE POLICY "Authenticated can insert activity logs" ON public.activity_log
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert lmp_timeline" ON public.lmp_timeline;
CREATE POLICY "Authenticated can insert lmp_timeline" ON public.lmp_timeline
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert lmp_daily_logs" ON public.lmp_daily_logs;
CREATE POLICY "Authenticated can insert lmp_daily_logs" ON public.lmp_daily_logs
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Authenticated can insert sync events" ON public.sheet_sync_events;
CREATE POLICY "Authenticated can insert sync events" ON public.sheet_sync_events
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Service can insert sync events" ON public.sheet_sync_events;

DROP POLICY IF EXISTS "Authenticated can insert comments" ON public.lmp_comments;
CREATE POLICY "Authenticated can insert comments" ON public.lmp_comments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

-- 4. Drop redundant service_role ALL policies (service_role bypasses RLS)
DROP POLICY IF EXISTS "Service role manages sync_conflicts" ON public.sync_conflicts;
DROP POLICY IF EXISTS "Service role manages copilot_cache" ON public.copilot_cache;
DROP POLICY IF EXISTS "Service role manages sheets_sync_log" ON public.sheets_sync_log;
DROP POLICY IF EXISTS "Service role manages sheet_write_queue" ON public.sheet_write_queue;
DROP POLICY IF EXISTS "Service role manages embeddings" ON public.rag_embeddings;

-- 5. Set search_path on public trigger functions
ALTER FUNCTION public.tg_lmp_candidates_timeline() SET search_path = public;
ALTER FUNCTION public.tg_lmp_checklists_timeline() SET search_path = public;
ALTER FUNCTION public.tg_lmp_daily_logs_timeline() SET search_path = public;
ALTER FUNCTION public.tg_lmp_domain_counts_sync() SET search_path = public;
ALTER FUNCTION public.tg_lmp_mentors_timeline() SET search_path = public;
ALTER FUNCTION public.tg_lmp_process_delete_sheet_sync() SET search_path = public;
ALTER FUNCTION public.tg_lmp_processes_timeline() SET search_path = public;
ALTER FUNCTION public.tg_lmp_set_closing_date() SET search_path = public;
ALTER FUNCTION public.tg_sessions_feedback_sync() SET search_path = public;
ALTER FUNCTION public.tg_sessions_timeline() SET search_path = public;
ALTER FUNCTION public.tg_student_lmp_count_sync() SET search_path = public;
ALTER FUNCTION public.tg_sync_mentor_aligned() SET search_path = public;
