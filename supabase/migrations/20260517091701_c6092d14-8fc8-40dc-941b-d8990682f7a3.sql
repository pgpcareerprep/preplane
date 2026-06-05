
CREATE TABLE public.lmp_process_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_by_name text,
  step smallint NOT NULL DEFAULT 1,
  company text,
  role text,
  domain text,
  type text DEFAULT 'Non-Legacy',
  jd_text text,
  jd_file_name text,
  selected_candidates jsonb NOT NULL DEFAULT '[]'::jsonb,
  parsed_jd jsonb,
  selection jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lmp_process_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own drafts"
  ON public.lmp_process_drafts FOR ALL
  TO authenticated
  USING (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_lmp_process_drafts_owner ON public.lmp_process_drafts(created_by, updated_at DESC);

CREATE TRIGGER trg_lmp_process_drafts_updated_at
  BEFORE UPDATE ON public.lmp_process_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
