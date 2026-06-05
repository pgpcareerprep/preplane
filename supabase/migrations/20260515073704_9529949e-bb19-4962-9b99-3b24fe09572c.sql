-- Step 1: Add missing columns to lmp_processes
ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS jd_url text,
  ADD COLUMN IF NOT EXISTS jd_label text,
  ADD COLUMN IF NOT EXISTS next_progress_type text DEFAULT 'Follow-up';

-- Create lmp_checklists table (referenced by view but missing)
CREATE TABLE IF NOT EXISTS public.lmp_checklists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lmp_id uuid NOT NULL,
  item_key text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lmp_id, item_key)
);

ALTER TABLE public.lmp_checklists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view lmp_checklists" ON public.lmp_checklists;
CREATE POLICY "Authenticated can view lmp_checklists"
  ON public.lmp_checklists FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins/mods manage lmp_checklists" ON public.lmp_checklists;
CREATE POLICY "Admins/mods manage lmp_checklists"
  ON public.lmp_checklists FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'moderator'::app_role));

CREATE INDEX IF NOT EXISTS lmp_checklists_lmp_id_idx ON public.lmp_checklists(lmp_id);

-- Step 2: Create lmp_full_view
CREATE OR REPLACE VIEW public.lmp_full_view AS
SELECT
  l.id,
  l.company,
  l.role,
  l.domain_raw,
  l.domain_id,
  l.status,
  l.type,
  l.date AS created_date,
  l.closing_date,
  l.jd_url,
  l.jd_label,
  (SELECT dl.text FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id ORDER BY dl.created_at DESC LIMIT 1) AS latest_daily_progress,
  (SELECT count(*) FROM public.lmp_daily_logs dl WHERE dl.lmp_id = l.id) AS daily_log_count,
  l.next_progress_date,
  l.next_progress_type,
  COALESCE((SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'prep_doc_shared' LIMIT 1), false) AS checklist_prep_doc_shared,
  COALESCE((SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'mentor_aligned' LIMIT 1), false) AS checklist_mentor_aligned,
  COALESCE((SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'assignment_review' LIMIT 1), false) AS checklist_assignment_review,
  COALESCE((SELECT ch.completed FROM public.lmp_checklists ch WHERE ch.lmp_id = l.id AND ch.item_key = 'one_to_one_mock' LIMIT 1), false) AS checklist_one_to_one_mock,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND c.r1_status IS NOT NULL AND c.r1_status <> '') AS r1_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND c.r2_status IS NOT NULL AND c.r2_status <> '') AS r2_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND c.r3_status IS NOT NULL AND c.r3_status <> '') AS r3_count,
  (SELECT count(*) FROM public.lmp_candidates c WHERE c.lmp_id = l.id AND c.offer_status IS NOT NULL AND c.offer_status <> '') AS offer_count,
  l.final_convert,
  l.convert_names,
  (SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'prep' AND k.is_active) AS prep_poc_names,
  (SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'support' AND k.is_active) AS support_poc_names,
  (SELECT string_agg(p.name, ', ') FROM public.lmp_poc_links k JOIN public.poc_profiles p ON p.id = k.poc_id WHERE k.lmp_id = l.id AND k.role = 'outreach' AND k.is_active) AS outreach_poc_names,
  l.prep_doc,
  (SELECT m.name FROM public.lmp_mentors lm JOIN public.mentors m ON m.id = lm.mentor_id WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1) AS mentor_name,
  (SELECT lm.feedback_avg FROM public.lmp_mentors lm WHERE lm.lmp_id = l.id AND lm.status = 'assigned' ORDER BY lm.assigned_at DESC LIMIT 1) AS mentor_feedback_avg,
  l.created_at,
  l.updated_at,
  l.sync_source
FROM public.lmp_processes l;

GRANT SELECT ON public.lmp_full_view TO authenticated;