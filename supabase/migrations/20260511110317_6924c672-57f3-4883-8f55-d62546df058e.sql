CREATE UNIQUE INDEX IF NOT EXISTS students_roll_no_key
  ON public.students (roll_no) WHERE roll_no IS NOT NULL AND roll_no <> '';

CREATE UNIQUE INDEX IF NOT EXISTS students_email_key
  ON public.students (lower(email)) WHERE email IS NOT NULL AND email <> '';

CREATE OR REPLACE FUNCTION public.refresh_data_source_status(_source text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
  _last record;
BEGIN
  IF _source = 'mentor_union' THEN
    SELECT count(*) INTO _count FROM public.mentors;
  ELSIF _source = 'alumni_db' THEN
    SELECT count(*) INTO _count FROM public.alumni_records;
  ELSIF _source = 'student_db' THEN
    SELECT count(*) INTO _count FROM public.students;
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
$function$;