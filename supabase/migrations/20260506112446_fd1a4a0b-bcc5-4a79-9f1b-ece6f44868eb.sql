
-- Create poc_registry table for live POC data
CREATE TABLE public.poc_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  initials text NOT NULL DEFAULT '',
  label text NOT NULL DEFAULT '',
  color text NOT NULL DEFAULT 'bg-orange-200 text-orange-600',
  poc_type text NOT NULL DEFAULT 'prep' CHECK (poc_type IN ('prep', 'outreach', 'behavioral')),
  domains text[] NOT NULL DEFAULT '{}',
  skill_tags text[] NOT NULL DEFAULT '{}',
  max_threshold integer NOT NULL DEFAULT 8,
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'on_leave', 'deactivated')),
  behavioral_pool_member boolean NOT NULL DEFAULT false,
  company_experience text[] NOT NULL DEFAULT '{}',
  recruiter_ownership text[] NOT NULL DEFAULT '{}',
  last_assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name, poc_type)
);

-- Enable RLS
ALTER TABLE public.poc_registry ENABLE ROW LEVEL SECURITY;

-- All authenticated can view
CREATE POLICY "Authenticated can view POCs"
  ON public.poc_registry FOR SELECT
  TO authenticated USING (true);

-- Admins can manage
CREATE POLICY "Admins can manage POCs"
  ON public.poc_registry FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow anon read for edge functions
CREATE POLICY "Anon can read POCs"
  ON public.poc_registry FOR SELECT
  TO anon USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_poc_registry_updated_at
  BEFORE UPDATE ON public.poc_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
