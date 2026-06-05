
-- =============================================
-- DOMAINS TABLE
-- =============================================
CREATE TABLE public.domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  slug text NOT NULL UNIQUE,
  total_lmps integer NOT NULL DEFAULT 0,
  active_lmps integer NOT NULL DEFAULT 0,
  converted_lmps integer NOT NULL DEFAULT 0,
  offer_received integer NOT NULL DEFAULT 0,
  dormant integer NOT NULL DEFAULT 0,
  closed integer NOT NULL DEFAULT 0,
  on_hold integer NOT NULL DEFAULT 0,
  poc_count integer NOT NULL DEFAULT 0,
  student_count integer NOT NULL DEFAULT 0,
  conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view domains" ON public.domains FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage domains" ON public.domains FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed 9 canonical domains + Unmapped
INSERT INTO public.domains (name, slug) VALUES
  ('Consulting', 'consulting'),
  ('Product Management', 'product-management'),
  ('Finance', 'finance'),
  ('Data', 'data'),
  ('Marketing', 'marketing'),
  ('Sales', 'sales'),
  ('FO/COS', 'fo-cos'),
  ('Supply & Operations', 'supply-operations'),
  ('HR', 'hr'),
  ('Unmapped', 'unmapped');

-- =============================================
-- DOMAIN ALIASES TABLE
-- =============================================
CREATE TABLE public.domain_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias text NOT NULL UNIQUE,
  canonical_domain_id uuid NOT NULL REFERENCES public.domains(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.domain_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view domain aliases" ON public.domain_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage domain aliases" ON public.domain_aliases FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Seed aliases
INSERT INTO public.domain_aliases (alias, canonical_domain_id) VALUES
  ('Consulting / Strategy', (SELECT id FROM public.domains WHERE slug = 'consulting')),
  ('Strategy', (SELECT id FROM public.domains WHERE slug = 'consulting')),
  ('Consulting', (SELECT id FROM public.domains WHERE slug = 'consulting')),
  ('Product', (SELECT id FROM public.domains WHERE slug = 'product-management')),
  ('PM', (SELECT id FROM public.domains WHERE slug = 'product-management')),
  ('Product Mgmt', (SELECT id FROM public.domains WHERE slug = 'product-management')),
  ('Product Management', (SELECT id FROM public.domains WHERE slug = 'product-management')),
  ('Finance', (SELECT id FROM public.domains WHERE slug = 'finance')),
  ('Finance / PE / VC', (SELECT id FROM public.domains WHERE slug = 'finance')),
  ('PE', (SELECT id FROM public.domains WHERE slug = 'finance')),
  ('VC', (SELECT id FROM public.domains WHERE slug = 'finance')),
  ('Data', (SELECT id FROM public.domains WHERE slug = 'data')),
  ('Data Analytics', (SELECT id FROM public.domains WHERE slug = 'data')),
  ('Data Science', (SELECT id FROM public.domains WHERE slug = 'data')),
  ('Marketing', (SELECT id FROM public.domains WHERE slug = 'marketing')),
  ('Digital Marketing', (SELECT id FROM public.domains WHERE slug = 'marketing')),
  ('Sales', (SELECT id FROM public.domains WHERE slug = 'sales')),
  ('Business Development', (SELECT id FROM public.domains WHERE slug = 'sales')),
  ('BD', (SELECT id FROM public.domains WHERE slug = 'sales')),
  ('FOCOS', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('FO', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('FO/COS', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('Founder Office', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('Founder''s Office', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('Chief of Staff', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('COS', (SELECT id FROM public.domains WHERE slug = 'fo-cos')),
  ('Supply Chain', (SELECT id FROM public.domains WHERE slug = 'supply-operations')),
  ('Operations', (SELECT id FROM public.domains WHERE slug = 'supply-operations')),
  ('Supply & Ops', (SELECT id FROM public.domains WHERE slug = 'supply-operations')),
  ('Supply & Operations', (SELECT id FROM public.domains WHERE slug = 'supply-operations')),
  ('Supply Chain & Operations', (SELECT id FROM public.domains WHERE slug = 'supply-operations')),
  ('HR', (SELECT id FROM public.domains WHERE slug = 'hr')),
  ('Human Resources', (SELECT id FROM public.domains WHERE slug = 'hr')),
  ('People', (SELECT id FROM public.domains WHERE slug = 'hr')),
  ('Talent', (SELECT id FROM public.domains WHERE slug = 'hr'));

-- =============================================
-- STUDENTS TABLE
-- =============================================
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  roll_no text UNIQUE,
  name text NOT NULL,
  email text,
  phone text,
  cohort text,
  primary_domain text,
  secondary_domain text,
  actual_domain text,
  other_domains text,
  keywords text,
  behavioral numeric(5,2) DEFAULT 0,
  composite_primary numeric(5,2) DEFAULT 0,
  composite_secondary numeric(5,2) DEFAULT 0,
  mock_score numeric(5,2) DEFAULT 0,
  resume_score numeric(5,2) DEFAULT 0,
  practicum numeric(5,2) DEFAULT 0,
  video_cv numeric(5,2) DEFAULT 0,
  portfolio numeric(5,2) DEFAULT 0,
  beh_resume numeric(5,2) DEFAULT 0,
  placement_status text DEFAULT 'Unplaced',
  internship text,
  live_project text,
  mentor_primary text,
  mentor_secondary text,
  iv_attempts integer DEFAULT 0,
  interview_risk_flag text,
  sync_source text DEFAULT 'sheet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view students" ON public.students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage students" ON public.students FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- LMP PROCESSES TABLE
-- =============================================
CREATE TABLE public.lmp_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_row_id text,
  company text NOT NULL,
  role text NOT NULL,
  domain_id uuid REFERENCES public.domains(id),
  domain_raw text,
  status text NOT NULL DEFAULT 'Not Started',
  type text,
  date text,
  closing_date text,
  admin_owner text,
  allocator text,
  prep_poc text,
  support_poc text,
  outreach_poc text,
  daily_progress text,
  prep_progress text,
  placement_progress text,
  r1_shortlisted text,
  r2_shortlisted text,
  r3_shortlisted text,
  final_convert text,
  convert_names text,
  prep_doc text,
  remarks text,
  mentor_aligned text,
  assignment_review text,
  one_to_one_mock text,
  behavioral_status text,
  sync_source text DEFAULT 'sheet',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company, role)
);

ALTER TABLE public.lmp_processes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lmp_processes" ON public.lmp_processes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage lmp_processes" ON public.lmp_processes FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_lmp_processes_updated_at BEFORE UPDATE ON public.lmp_processes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- LMP_STUDENTS JUNCTION TABLE
-- =============================================
CREATE TABLE public.lmp_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lmp_id uuid NOT NULL REFERENCES public.lmp_processes(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  role_in_process text,
  status text DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lmp_id, student_id)
);

ALTER TABLE public.lmp_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view lmp_students" ON public.lmp_students FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage lmp_students" ON public.lmp_students FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- =============================================
-- POC PROFILES TABLE
-- =============================================
CREATE TABLE public.poc_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approved_user_id uuid REFERENCES public.approved_users(id) ON DELETE SET NULL,
  name text NOT NULL,
  email text,
  role_type text NOT NULL DEFAULT 'prep_poc',
  primary_domain text,
  domain_tags text[] NOT NULL DEFAULT '{}',
  active_load integer NOT NULL DEFAULT 0,
  historical_load integer NOT NULL DEFAULT 0,
  ongoing_count integer NOT NULL DEFAULT 0,
  converted_count integer NOT NULL DEFAULT 0,
  offer_received_count integer NOT NULL DEFAULT 0,
  dormant_count integer NOT NULL DEFAULT 0,
  closed_count integer NOT NULL DEFAULT 0,
  on_hold_count integer NOT NULL DEFAULT 0,
  cross_domain_count integer NOT NULL DEFAULT 0,
  conversion_rate numeric(5,2) NOT NULL DEFAULT 0,
  mentor_coverage numeric(5,2) NOT NULL DEFAULT 0,
  prep_coverage numeric(5,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  last_activity_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.poc_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view poc_profiles" ON public.poc_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage poc_profiles" ON public.poc_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_poc_profiles_updated_at BEFORE UPDATE ON public.poc_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- UNMAPPED ITEMS TABLE
-- =============================================
CREATE TABLE public.unmapped_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_type text NOT NULL, -- 'domain' or 'user'
  raw_value text NOT NULL,
  source_tab text,
  source_field text,
  source_record_id text,
  resolved boolean NOT NULL DEFAULT false,
  resolved_to text,
  resolved_at timestamptz,
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(item_type, raw_value, source_tab, source_field)
);

ALTER TABLE public.unmapped_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage unmapped_items" ON public.unmapped_items FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view unmapped_items" ON public.unmapped_items FOR SELECT TO authenticated USING (true);
