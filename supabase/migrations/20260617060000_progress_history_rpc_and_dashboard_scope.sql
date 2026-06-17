-- Scoped fix: transactional daily-progress history edit/delete.
-- Keeps DB as source of truth and lets the existing lmp_processes update
-- trigger enqueue the Sheet mirror after aggregate daily_progress changes.

CREATE OR REPLACE FUNCTION public._progress_entry_authorized(
  p_log public.lmp_daily_logs,
  p_lmp public.lmp_processes
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_poc_id uuid := public.current_poc_id();
  v_profile_email text;
  v_author_user_id uuid;
  v_author_poc_id uuid;
  v_author_email text;
  v_is_assigned boolean;
  v_is_author boolean;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN true;
  END IF;

  IF v_uid IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(v_uid, 'admin'::public.app_role)
     OR public.has_role(v_uid, 'allocator'::public.app_role) THEN
    RETURN true;
  END IF;

  v_author_user_id := NULLIF(p_log.metadata->>'author_user_id', '')::uuid;
  v_author_poc_id := NULLIF(p_log.metadata->>'author_poc_id', '')::uuid;
  v_author_email := lower(NULLIF(COALESCE(p_log.author_email, p_log.metadata->>'author_email'), ''));

  SELECT lower(NULLIF(email, ''))
  INTO v_profile_email
  FROM public.profiles
  WHERE user_id = v_uid
  LIMIT 1;

  v_is_assigned :=
    v_poc_id IS NOT NULL
    AND (
      p_lmp.prep_poc_id = v_poc_id
      OR p_lmp.support_poc_id = v_poc_id
      OR v_poc_id = ANY(COALESCE(p_lmp.outreach_poc_ids, '{}'::uuid[]))
      OR EXISTS (
        SELECT 1
        FROM public.lmp_poc_links k
        WHERE k.lmp_id = p_lmp.id
          AND k.is_active = true
          AND k.poc_id = v_poc_id
      )
    );

  v_is_author :=
    v_author_user_id = v_uid
    OR (v_poc_id IS NOT NULL AND v_author_poc_id = v_poc_id)
    OR (
      v_profile_email IS NOT NULL
      AND v_author_email IS NOT NULL
      AND v_profile_email = v_author_email
    );

  RETURN v_is_assigned AND v_is_author;
END;
$$;

CREATE OR REPLACE FUNCTION public._replace_daily_progress_line(
  p_daily_progress text,
  p_old_text text,
  p_new_text text,
  p_created_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lines text[];
  v_out text[] := '{}';
  v_line text;
  v_replaced boolean := false;
  v_old text := btrim(COALESCE(p_old_text, ''));
  v_new text := btrim(COALESCE(p_new_text, ''));
  v_prefix text;
  v_date_prefix text := '[' || to_char(p_created_at AT TIME ZONE 'Asia/Kolkata', 'DD/MM') || ']';
BEGIN
  IF COALESCE(p_daily_progress, '') = '' OR v_old = '' THEN
    RETURN p_daily_progress;
  END IF;

  v_lines := string_to_array(p_daily_progress, E'\n');

  FOREACH v_line IN ARRAY v_lines LOOP
    IF NOT v_replaced
       AND (
         btrim(v_line) = v_old
         OR (position(v_old in v_line) > 0 AND left(btrim(v_line), length(v_date_prefix)) = v_date_prefix)
         OR position(v_old in v_line) > 0
       ) THEN
      v_prefix := substring(v_line from '^\[[^\]]+\]\s*');
      v_out := v_out || (COALESCE(v_prefix, '') || v_new);
      v_replaced := true;
    ELSE
      v_out := v_out || v_line;
    END IF;
  END LOOP;

  RETURN array_to_string(v_out, E'\n');
END;
$$;

CREATE OR REPLACE FUNCTION public._remove_daily_progress_line(
  p_daily_progress text,
  p_old_text text,
  p_created_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_lines text[];
  v_out text[] := '{}';
  v_line text;
  v_removed boolean := false;
  v_old text := btrim(COALESCE(p_old_text, ''));
  v_date_prefix text := '[' || to_char(p_created_at AT TIME ZONE 'Asia/Kolkata', 'DD/MM') || ']';
BEGIN
  IF COALESCE(p_daily_progress, '') = '' OR v_old = '' THEN
    RETURN p_daily_progress;
  END IF;

  v_lines := string_to_array(p_daily_progress, E'\n');

  FOREACH v_line IN ARRAY v_lines LOOP
    IF NOT v_removed
       AND (
         btrim(v_line) = v_old
         OR (position(v_old in v_line) > 0 AND left(btrim(v_line), length(v_date_prefix)) = v_date_prefix)
         OR position(v_old in v_line) > 0
       ) THEN
      v_removed := true;
    ELSE
      v_out := v_out || v_line;
    END IF;
  END LOOP;

  RETURN NULLIF(array_to_string(v_out, E'\n'), '');
END;
$$;

CREATE OR REPLACE FUNCTION public.update_lmp_daily_progress_entry(
  p_entry_id uuid,
  p_text text
)
RETURNS public.lmp_daily_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log public.lmp_daily_logs;
  v_lmp public.lmp_processes;
  v_trimmed text := btrim(COALESCE(p_text, ''));
  v_next_meta jsonb;
  v_updated public.lmp_daily_logs;
BEGIN
  IF public.request_is_view_as_read_only() THEN
    RAISE EXCEPTION 'VIEW_AS_READ_ONLY' USING ERRCODE = '42501';
  END IF;

  IF v_trimmed = '' THEN
    RAISE EXCEPTION 'Progress text cannot be blank' USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_log
  FROM public.lmp_daily_logs
  WHERE id = p_entry_id
    AND entry_type = 'progress'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progress entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_lmp
  FROM public.lmp_processes
  WHERE id = v_log.lmp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LMP not found for progress entry' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public._progress_entry_authorized(v_log, v_lmp) THEN
    RAISE EXCEPTION 'Not authorized to edit this progress entry' USING ERRCODE = '42501';
  END IF;

  v_next_meta :=
    COALESCE(v_log.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'edited_at', now(),
      'edited_by_user_id', auth.uid(),
      'previous_text', v_log.text
    );

  UPDATE public.lmp_daily_logs
  SET text = v_trimmed,
      metadata = v_next_meta
  WHERE id = v_log.id
  RETURNING * INTO v_updated;

  UPDATE public.lmp_timeline
  SET description = v_trimmed,
      metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('edited_at', now(), 'edited_by_user_id', auth.uid())
  WHERE lmp_id = v_log.lmp_id
    AND metadata->>'daily_log_id' = v_log.id::text;

  UPDATE public.lmp_processes
  SET daily_progress = public._replace_daily_progress_line(
        daily_progress,
        v_log.text,
        v_trimmed,
        v_log.created_at
      ),
      last_progress_updated_at = CASE
        WHEN last_progress_updated_at IS NULL OR v_log.created_at >= last_progress_updated_at
          THEN now()
        ELSE last_progress_updated_at
      END
  WHERE id = v_log.lmp_id;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_lmp_daily_progress_entry(
  p_entry_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_log public.lmp_daily_logs;
  v_lmp public.lmp_processes;
BEGIN
  IF public.request_is_view_as_read_only() THEN
    RAISE EXCEPTION 'VIEW_AS_READ_ONLY' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_log
  FROM public.lmp_daily_logs
  WHERE id = p_entry_id
    AND entry_type = 'progress'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Progress entry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT *
  INTO v_lmp
  FROM public.lmp_processes
  WHERE id = v_log.lmp_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'LMP not found for progress entry' USING ERRCODE = 'P0002';
  END IF;

  IF NOT public._progress_entry_authorized(v_log, v_lmp) THEN
    RAISE EXCEPTION 'Not authorized to delete this progress entry' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.lmp_timeline
  WHERE lmp_id = v_log.lmp_id
    AND metadata->>'daily_log_id' = v_log.id::text;

  DELETE FROM public.lmp_daily_logs
  WHERE id = v_log.id;

  UPDATE public.lmp_processes
  SET daily_progress = public._remove_daily_progress_line(
        daily_progress,
        v_log.text,
        v_log.created_at
      )
  WHERE id = v_log.lmp_id;
END;
$$;

REVOKE ALL ON FUNCTION public._progress_entry_authorized(public.lmp_daily_logs, public.lmp_processes) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._replace_daily_progress_line(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._remove_daily_progress_line(text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_lmp_daily_progress_entry(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_lmp_daily_progress_entry(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_lmp_daily_progress_entry(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_lmp_daily_progress_entry(uuid) TO authenticated, service_role;
