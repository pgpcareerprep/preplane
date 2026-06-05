
UPDATE public.poc_profiles SET email = 'abhinav.arora@mastersunion.org' WHERE name = 'Abhinav';
UPDATE public.poc_profiles SET email = 'goel.vidhu@mastersunion.org' WHERE name = 'Vidhu';
UPDATE public.poc_profiles SET email = 'gopika.kumar@mastersunion.org' WHERE name = 'Dr. Gopika';
UPDATE public.poc_profiles SET email = 'vidit.vishal@mastersunion.org' WHERE name = 'Vidit';
UPDATE public.poc_profiles SET email = 'sonali.awasthi@mastersunion.org' WHERE name = 'Sonali';
UPDATE public.poc_profiles SET email = 'siddharth.jangir@mastersunion.org' WHERE name = 'Siddharth';
UPDATE public.poc_profiles SET email = 'radhika.goyal1@mastersunion.org' WHERE name = 'Radhika';
UPDATE public.poc_profiles SET email = 'santanu.goswami@mastersunion.org' WHERE name = 'Santanu';
UPDATE public.poc_profiles SET email = 'kriti.sharma2@mastersunion.org' WHERE name = 'Kriti';
UPDATE public.poc_profiles SET email = 'shubham.gupta1@mastersunion.org' WHERE name = 'Shubham';
UPDATE public.poc_profiles SET email = 'namita.bhatia@mastersunion.org' WHERE name = 'Namita';
UPDATE public.poc_profiles SET email = 'riti.marwah@mastersunion.org' WHERE name = 'Riti';
UPDATE public.poc_profiles SET email = 'mansi.bhargava@mastersunion.org' WHERE name = 'Mansi';

CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
);
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage system_settings" ON public.system_settings FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view system_settings" ON public.system_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anon can view system_settings" ON public.system_settings FOR SELECT TO anon USING (true);

INSERT INTO public.system_settings (key, value) VALUES (
  'reminder_schedule',
  '{"time": "11:00", "timezone": "Asia/Kolkata", "days": ["monday","tuesday","wednesday","thursday","friday"], "enabled": true}'::jsonb
) ON CONFLICT (key) DO NOTHING;
