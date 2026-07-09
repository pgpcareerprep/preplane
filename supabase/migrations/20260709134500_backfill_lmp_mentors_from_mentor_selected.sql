-- Backfill lmp_mentors rows for LMPs that have mentor_selected text (often from
-- sheet sync or a failed POC align before resolve_or_create_mentor allowed POC)
-- but no matching assigned row in lmp_mentors. Global Mentors tab and the Data
-- Sources assignments modal read lmp_mentors, not mentor_selected alone.

DO $$
DECLARE
  r record;
  v_name text;
  v_mentor_id uuid;
  v_match_count integer;
BEGIN
  FOR r IN
    SELECT lp.id AS lmp_id, lp.mentor_selected
    FROM public.lmp_processes lp
    WHERE NULLIF(trim(lp.mentor_selected), '') IS NOT NULL
  LOOP
    FOR v_name IN
      SELECT trim(part)
      FROM unnest(string_to_array(r.mentor_selected, ',')) AS part
      WHERE trim(part) <> ''
    LOOP
      -- Already linked for this LMP under this display name.
      IF EXISTS (
        SELECT 1
        FROM public.lmp_mentors lm
        WHERE lm.lmp_id = r.lmp_id
          AND lm.status = 'assigned'
          AND lower(trim(COALESCE(lm.mentor_name, ''))) = lower(v_name)
      ) THEN
        CONTINUE;
      END IF;

      -- Resolve mentor id by unique case-insensitive name match only.
      SELECT count(*)::integer
      INTO v_match_count
      FROM public.mentors m
      WHERE lower(trim(m.name)) = lower(v_name);

      IF v_match_count <> 1 THEN
        CONTINUE;
      END IF;

      SELECT m.id
      INTO v_mentor_id
      FROM public.mentors m
      WHERE lower(trim(m.name)) = lower(v_name)
      LIMIT 1;

      IF v_mentor_id IS NULL THEN
        CONTINUE;
      END IF;

      -- Skip if this mentor is already assigned on the LMP under a different name row.
      IF EXISTS (
        SELECT 1
        FROM public.lmp_mentors lm
        WHERE lm.lmp_id = r.lmp_id
          AND lm.mentor_id = v_mentor_id
          AND lm.status = 'assigned'
      ) THEN
        CONTINUE;
      END IF;

      INSERT INTO public.lmp_mentors (
        lmp_id,
        mentor_id,
        mentor_name,
        mentor_source,
        status,
        sync_source,
        assigned_at
      )
      SELECT
        r.lmp_id,
        v_mentor_id,
        v_name,
        COALESCE(NULLIF(trim(m.source), ''), 'EXT'),
        'assigned',
        'mentor_selected_backfill',
        now()
      FROM public.mentors m
      WHERE m.id = v_mentor_id
      ON CONFLICT (lmp_id, mentor_id) DO UPDATE SET
        mentor_name   = EXCLUDED.mentor_name,
        mentor_source = EXCLUDED.mentor_source,
        status        = 'assigned',
        sync_source   = 'mentor_selected_backfill',
        assigned_at   = COALESCE(public.lmp_mentors.assigned_at, EXCLUDED.assigned_at);
      -- trg_lmp_mentors_recompute keeps mentor_selected in sync.
    END LOOP;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
