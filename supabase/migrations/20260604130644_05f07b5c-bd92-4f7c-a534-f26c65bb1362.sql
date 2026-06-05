
CREATE OR REPLACE FUNCTION public.post_lmp_comment(
  _lmp_id uuid,
  _author_name text,
  _author_initials text,
  _author_color text,
  _body text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _trimmed text := btrim(_body);
  _now timestamptz := now();
  _stamp text;
  _prev text;
  _next text;
  _new_id uuid;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _trimmed = '' THEN
    RAISE EXCEPTION 'Empty comment';
  END IF;

  INSERT INTO public.lmp_comments(
    lmp_id, author_user_id, author_name, author_initials, author_color, body, source, ts
  ) VALUES (
    _lmp_id, _uid, _author_name, _author_initials, _author_color, _trimmed, 'app', _now
  )
  RETURNING id INTO _new_id;

  _stamp := '— ' || _author_name || ' (' ||
            lpad(extract(hour from _now at time zone 'Asia/Kolkata')::int::text, 2, '0') || ':' ||
            lpad(extract(minute from _now at time zone 'Asia/Kolkata')::int::text, 2, '0') ||
            '): ' || _trimmed;

  SELECT comments INTO _prev FROM public.lmp_processes WHERE id = _lmp_id;
  _next := CASE WHEN coalesce(_prev,'') = '' THEN _stamp ELSE _stamp || E'\n' || _prev END;

  UPDATE public.lmp_processes
     SET comments = _next, sync_source = 'app', updated_at = _now
   WHERE id = _lmp_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_lmp_comment(uuid, text, text, text, text) TO authenticated;
