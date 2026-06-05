
-- Create poc_lmp_assignments table for normalized POC-LMP mapping
CREATE TABLE public.poc_lmp_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lmp_id UUID NOT NULL,
  poc_name TEXT NOT NULL,
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('primary', 'secondary', 'outreach', 'allocator', 'admin_owner')),
  domain TEXT,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT DEFAULT 'Not Started',
  raw_cell_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for fast lookup by poc_name and lmp_id
CREATE INDEX idx_poc_lmp_assignments_poc_name ON public.poc_lmp_assignments(poc_name);
CREATE INDEX idx_poc_lmp_assignments_lmp_id ON public.poc_lmp_assignments(lmp_id);
CREATE INDEX idx_poc_lmp_assignments_type ON public.poc_lmp_assignments(assignment_type);

-- Enable RLS
ALTER TABLE public.poc_lmp_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage poc_lmp_assignments"
ON public.poc_lmp_assignments
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated can view poc_lmp_assignments"
ON public.poc_lmp_assignments
FOR SELECT
TO authenticated
USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_poc_lmp_assignments_updated_at
BEFORE UPDATE ON public.poc_lmp_assignments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
