
ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS next_progress_reminder_type text DEFAULT 'Follow-up',
  ADD COLUMN IF NOT EXISTS last_progress_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_progress_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reminder_version integer DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.lmp_progress_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lmp_id uuid NOT NULL,
  progress_text text NOT NULL,
  progress_type text NOT NULL DEFAULT 'progress_update',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_progress_date_snapshot date,
  reminder_type_snapshot text
);
ALTER TABLE public.lmp_progress_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage lmp_progress_history" ON public.lmp_progress_history FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view lmp_progress_history" ON public.lmp_progress_history FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert lmp_progress_history" ON public.lmp_progress_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Anon can insert lmp_progress_history" ON public.lmp_progress_history FOR INSERT TO anon WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lmp_progress_history_lmp_id ON public.lmp_progress_history(lmp_id);

CREATE TABLE IF NOT EXISTS public.lmp_progress_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lmp_id uuid NOT NULL,
  poc_email text,
  next_progress_date date NOT NULL,
  reminder_version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lmp_progress_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage lmp_progress_reminders" ON public.lmp_progress_reminders FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view lmp_progress_reminders" ON public.lmp_progress_reminders FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can manage lmp_progress_reminders" ON public.lmp_progress_reminders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_lmp_progress_reminders_date ON public.lmp_progress_reminders(next_progress_date, status);
CREATE INDEX IF NOT EXISTS idx_lmp_progress_reminders_lmp_id ON public.lmp_progress_reminders(lmp_id);
