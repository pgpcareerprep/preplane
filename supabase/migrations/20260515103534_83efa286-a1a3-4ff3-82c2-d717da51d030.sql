
DROP POLICY IF EXISTS "Anon can insert lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Anon can delete lmp_candidates" ON public.lmp_candidates;
DROP POLICY IF EXISTS "Anon can insert lmp_timeline" ON public.lmp_timeline;
DROP POLICY IF EXISTS "Anon can delete lmp_timeline" ON public.lmp_timeline;
DROP POLICY IF EXISTS "Anon can manage lmp_progress_reminders" ON public.lmp_progress_reminders;
DROP POLICY IF EXISTS "Anon can insert activity logs" ON public.activity_log;
DROP POLICY IF EXISTS "Anon can update session by token" ON public.sessions;
DROP POLICY IF EXISTS "Authenticated can update feedback templates" ON public.feedback_form_templates;
DROP POLICY IF EXISTS "Anon can view system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Authenticated can view system_settings" ON public.system_settings;
DROP POLICY IF EXISTS "Admins can view system_settings" ON public.system_settings;
CREATE POLICY "Admins can view system_settings"
  ON public.system_settings FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
