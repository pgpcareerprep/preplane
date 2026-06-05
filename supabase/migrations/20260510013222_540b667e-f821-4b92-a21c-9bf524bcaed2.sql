
CREATE TABLE public.alumni_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_name text NOT NULL,
  cohort text,
  mu_email_id text,
  linkedin_profile text,
  industry text,
  domain_1 text,
  domain_2 text,
  current_company text,
  current_role_title text,
  source_file_name text,
  uploaded_by_admin_id uuid,
  uploaded_by_admin_email text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX alumni_records_email_uniq
  ON public.alumni_records (lower(mu_email_id))
  WHERE mu_email_id IS NOT NULL AND mu_email_id <> '';
CREATE UNIQUE INDEX alumni_records_linkedin_uniq
  ON public.alumni_records (lower(linkedin_profile))
  WHERE linkedin_profile IS NOT NULL AND linkedin_profile <> '';

ALTER TABLE public.alumni_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view alumni_records" ON public.alumni_records
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage alumni_records" ON public.alumni_records
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_alumni_records_updated_at
  BEFORE UPDATE ON public.alumni_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.data_source_sync_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL CHECK (source_type IN ('mentor_union','alumni_db')),
  file_name text,
  uploaded_by_admin_id uuid,
  uploaded_by_admin_email text,
  total_rows integer NOT NULL DEFAULT 0,
  inserted_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  error_rows integer NOT NULL DEFAULT 0,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','partial_success')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX data_source_sync_history_src_created_idx
  ON public.data_source_sync_history (source_type, created_at DESC);

ALTER TABLE public.data_source_sync_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view sync history" ON public.data_source_sync_history
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can insert sync history" ON public.data_source_sync_history
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins can manage sync history" ON public.data_source_sync_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.data_source_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type text NOT NULL UNIQUE CHECK (source_type IN ('mentor_union','alumni_db')),
  current_status text NOT NULL DEFAULT 'awaiting_first_sync'
    CHECK (current_status IN ('synced','awaiting_first_sync','failed')),
  total_records integer NOT NULL DEFAULT 0,
  last_uploaded_by_admin_id uuid,
  last_uploaded_by_admin_email text,
  last_uploaded_at timestamptz,
  last_file_name text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.data_source_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view data_source_status" ON public.data_source_status
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage data_source_status" ON public.data_source_status
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO public.data_source_status (source_type, current_status, total_records)
VALUES ('mentor_union','awaiting_first_sync',0),('alumni_db','awaiting_first_sync',0)
ON CONFLICT (source_type) DO NOTHING;

CREATE OR REPLACE FUNCTION public.refresh_data_source_status(_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
  _last record;
BEGIN
  IF _source = 'mentor_union' THEN
    SELECT count(*) INTO _count FROM public.mentors;
  ELSIF _source = 'alumni_db' THEN
    SELECT count(*) INTO _count FROM public.alumni_records;
  ELSE
    RETURN;
  END IF;

  SELECT uploaded_by_admin_id, uploaded_by_admin_email, file_name, created_at, status
    INTO _last
    FROM public.data_source_sync_history
    WHERE source_type = _source
    ORDER BY created_at DESC LIMIT 1;

  INSERT INTO public.data_source_status (source_type, current_status, total_records,
    last_uploaded_by_admin_id, last_uploaded_by_admin_email, last_uploaded_at, last_file_name, updated_at)
  VALUES (_source,
    CASE WHEN _last.status = 'failed' THEN 'failed'
         WHEN _count > 0 THEN 'synced'
         ELSE 'awaiting_first_sync' END,
    _count, _last.uploaded_by_admin_id, _last.uploaded_by_admin_email,
    _last.created_at, _last.file_name, now())
  ON CONFLICT (source_type) DO UPDATE SET
    current_status = EXCLUDED.current_status,
    total_records = EXCLUDED.total_records,
    last_uploaded_by_admin_id = EXCLUDED.last_uploaded_by_admin_id,
    last_uploaded_by_admin_email = EXCLUDED.last_uploaded_by_admin_email,
    last_uploaded_at = EXCLUDED.last_uploaded_at,
    last_file_name = EXCLUDED.last_file_name,
    updated_at = now();
END;
$$;
