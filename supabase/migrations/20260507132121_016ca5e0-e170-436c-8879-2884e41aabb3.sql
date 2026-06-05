
-- 1. POC Allocation Mappings table (admin-editable domain→POC mappings)
CREATE TABLE public.poc_allocation_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_slug TEXT NOT NULL,
  poc_id UUID REFERENCES public.poc_registry(id) ON DELETE CASCADE,
  poc_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(domain_slug, poc_id)
);

ALTER TABLE public.poc_allocation_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage poc_allocation_mappings"
  ON public.poc_allocation_mappings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated can view poc_allocation_mappings"
  ON public.poc_allocation_mappings FOR SELECT TO authenticated
  USING (true);

CREATE TRIGGER update_poc_allocation_mappings_updated_at
  BEFORE UPDATE ON public.poc_allocation_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add allocation metadata columns to lmp_processes
ALTER TABLE public.lmp_processes
  ADD COLUMN IF NOT EXISTS allocation_path TEXT,
  ADD COLUMN IF NOT EXISTS match_tag TEXT,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS allocation_reason TEXT;
