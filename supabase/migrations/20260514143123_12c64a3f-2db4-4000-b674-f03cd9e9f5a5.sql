
CREATE OR REPLACE FUNCTION public.resolve_lmp_poc_links(_lmp_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_prep uuid;
  v_support uuid;
  v_outreach uuid[];
BEGIN
  SELECT prep_poc, support_poc, outreach_poc INTO r
  FROM public.lmp_processes WHERE id = _lmp_id;

  UPDATE public.lmp_poc_links
    SET is_active = false, removed_at = now()
    WHERE lmp_id = _lmp_id AND is_active = true;

  IF r.prep_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
    SELECT _lmp_id, p.id, 'prep', true, now(), 'sheet', r.prep_poc
    FROM regexp_split_to_table(r.prep_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_profiles p
      ON lower(trim(raw)) = ANY(p.aliases) OR lower(trim(p.name)) = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT (lmp_id, role, poc_id) DO UPDATE
      SET is_active = true, removed_at = NULL, assigned_at = now(),
          raw_sheet_value = EXCLUDED.raw_sheet_value;
  END IF;

  IF r.support_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
    SELECT _lmp_id, p.id, 'support', true, now(), 'sheet', r.support_poc
    FROM regexp_split_to_table(r.support_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_profiles p
      ON lower(trim(raw)) = ANY(p.aliases) OR lower(trim(p.name)) = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT (lmp_id, role, poc_id) DO UPDATE
      SET is_active = true, removed_at = NULL, assigned_at = now(),
          raw_sheet_value = EXCLUDED.raw_sheet_value;
  END IF;

  IF r.outreach_poc IS NOT NULL THEN
    INSERT INTO public.lmp_poc_links (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
    SELECT _lmp_id, p.id, 'outreach', true, now(), 'sheet', r.outreach_poc
    FROM regexp_split_to_table(r.outreach_poc, '\s*[,/&]\s*') AS raw
    JOIN public.poc_profiles p
      ON lower(trim(raw)) = ANY(p.aliases) OR lower(trim(p.name)) = lower(trim(raw))
    WHERE trim(raw) <> ''
    ON CONFLICT (lmp_id, role, poc_id) DO UPDATE
      SET is_active = true, removed_at = NULL, assigned_at = now(),
          raw_sheet_value = EXCLUDED.raw_sheet_value;
  END IF;

  SELECT poc_id INTO v_prep FROM public.lmp_poc_links
    WHERE lmp_id=_lmp_id AND role='prep' AND is_active=true ORDER BY assigned_at LIMIT 1;
  SELECT poc_id INTO v_support FROM public.lmp_poc_links
    WHERE lmp_id=_lmp_id AND role='support' AND is_active=true ORDER BY assigned_at LIMIT 1;
  SELECT array_agg(poc_id) INTO v_outreach FROM public.lmp_poc_links
    WHERE lmp_id=_lmp_id AND role='outreach' AND is_active=true;

  UPDATE public.lmp_processes
    SET prep_poc_id = v_prep,
        support_poc_id = v_support,
        outreach_poc_ids = COALESCE(v_outreach, '{}'::uuid[])
    WHERE id = _lmp_id;
END;
$$;

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.lmp_processes LOOP
    PERFORM public.resolve_lmp_poc_links(r.id);
  END LOOP;
END $$;
