
-- poc_registry
CREATE TABLE IF NOT EXISTS public.poc_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  initials text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'bg-orange-200 text-orange-600',
  poc_type text NOT NULL DEFAULT 'prep',
  domains text[] NOT NULL DEFAULT '{}',
  skill_tags text[] NOT NULL DEFAULT '{}',
  max_threshold int NOT NULL DEFAULT 8,
  availability text NOT NULL DEFAULT 'available',
  behavioral_pool_member boolean NOT NULL DEFAULT false,
  recruiter_ownership text[] NOT NULL DEFAULT '{}',
  access_level text NOT NULL DEFAULT 'poc',
  company_experience text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_assigned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.poc_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage POCs" ON public.poc_registry FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Anon can read POCs" ON public.poc_registry FOR SELECT TO anon USING (true);
CREATE POLICY "Authenticated can view POCs" ON public.poc_registry FOR SELECT TO authenticated USING (true);

INSERT INTO public.poc_registry (name, initials, label, poc_type, domains, access_level, availability)
SELECT p.name,
       upper(left(p.name,1) || coalesce(substring(p.name from ' (.)'),'')),
       p.name,
       CASE WHEN p.role_type = 'outreach_poc' THEN 'outreach' ELSE 'prep' END,
       coalesce(p.domain_tags, '{}'),
       p.access_level,
       CASE WHEN p.status = 'active' THEN 'available' ELSE p.status END
FROM public.poc_profiles p
ON CONFLICT DO NOTHING;

-- lmp_students
CREATE TABLE IF NOT EXISTS public.lmp_students (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lmp_id uuid NOT NULL,
  student_id uuid NOT NULL,
  role_in_process text,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.lmp_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage lmp_students" ON public.lmp_students FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated can view lmp_students" ON public.lmp_students FOR SELECT TO authenticated USING (true);

-- sheets_sync_log
CREATE TABLE IF NOT EXISTS public.sheets_sync_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tab_name text,
  operation text,
  status text DEFAULT 'success',
  field_count int DEFAULT 0,
  synced_by text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sheets_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage sheets_sync_log" ON public.sheets_sync_log FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "Authenticated can view sheets_sync_log" ON public.sheets_sync_log FOR SELECT TO authenticated USING (true);
