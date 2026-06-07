-- Fix: when the app (sync_source='app') only updates outreach_poc (not prep/support),
-- do a targeted outreach-only re-resolve instead of a full re-resolve.
-- Previously, a full re-resolve would overwrite prep_poc_id from stale sheet-imported
-- prep_poc text, causing the Prep POC to appear to change after setting an Outreach POC.

CREATE OR REPLACE FUNCTION public.trg_resolve_lmp_links()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Targeted outreach-only path: fires when app updated only outreach_poc,
  -- leaving prep_poc and support_poc text unchanged.
  IF TG_OP = 'UPDATE'
     AND (NEW.sync_source = 'app')
     AND (NEW.prep_poc    IS NOT DISTINCT FROM OLD.prep_poc)
     AND (NEW.support_poc IS NOT DISTINCT FROM OLD.support_poc)
  THEN
    -- Deactivate only the outreach links; keep prep/support links intact.
    UPDATE public.lmp_poc_links
      SET is_active = false, removed_at = now()
      WHERE lmp_id = NEW.id AND role = 'outreach' AND is_active = true;

    IF NEW.outreach_poc IS NOT NULL THEN
      INSERT INTO public.lmp_poc_links
        (lmp_id, poc_id, role, is_active, assigned_at, assignment_source, raw_sheet_value)
      SELECT NEW.id, p.id, 'outreach', true, now(), 'app', NEW.outreach_poc
      FROM regexp_split_to_table(NEW.outreach_poc, '\s*[,/&]\s*') AS raw
      JOIN public.poc_profiles p
        ON lower(trim(raw)) = ANY(p.aliases)
        OR lower(trim(p.name)) = lower(trim(raw))
      WHERE trim(raw) <> ''
      ON CONFLICT DO NOTHING;
    END IF;

    -- Snapshot only outreach_poc_ids; leave prep_poc_id / support_poc_id untouched.
    UPDATE public.lmp_processes
      SET outreach_poc_ids = COALESCE(
        (SELECT array_agg(poc_id)
         FROM public.lmp_poc_links
         WHERE lmp_id = NEW.id AND role = 'outreach' AND is_active = true),
        '{}'::uuid[]
      )
      WHERE id = NEW.id;

    RETURN NEW;
  END IF;

  -- Default: full re-resolve (sheet sync, prep/support changes, or INSERT).
  PERFORM public.resolve_lmp_poc_links(NEW.id);
  RETURN NEW;
END;
$$;
