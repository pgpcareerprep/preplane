-- Batch-recompute final_converted_* once per affected LMP per statement,
-- instead of once per row. Bulk candidate upserts were timing out because
-- FOR EACH ROW ran a full lmp_candidates scan + lmp_processes UPDATE (and its
-- cascade) for every inserted row.
--
-- Postgres limits on transition tables:
--   - cannot combine multiple events on one trigger
--   - cannot combine with UPDATE OF <column list>
-- So: separate INSERT / UPDATE / DELETE statement triggers; UPDATE is plain
-- AFTER UPDATE (no column list). Still one recompute per statement, not per row.
--
-- recompute_lmp_convert(uuid) itself is unchanged. End-of-statement values are
-- all that matter; nothing reads mid-batch convert fields.

CREATE OR REPLACE FUNCTION public._recompute_lmp_convert_for_ids(p_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN;
  END IF;
  FOREACH v_id IN ARRAY p_ids LOOP
    IF v_id IS NOT NULL THEN
      PERFORM public.recompute_lmp_convert(v_id);
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_lmp_convert_ins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._recompute_lmp_convert_for_ids(
    ARRAY(SELECT DISTINCT lmp_id FROM new_rows WHERE lmp_id IS NOT NULL)
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_lmp_convert_upd()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._recompute_lmp_convert_for_ids(
    ARRAY(
      SELECT DISTINCT lmp_id FROM (
        SELECT lmp_id FROM new_rows WHERE lmp_id IS NOT NULL
        UNION
        SELECT lmp_id FROM old_rows WHERE lmp_id IS NOT NULL
      ) x
    )
  );
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recompute_lmp_convert_del()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._recompute_lmp_convert_for_ids(
    ARRAY(SELECT DISTINCT lmp_id FROM old_rows WHERE lmp_id IS NOT NULL)
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS lmp_candidates_recompute_convert ON public.lmp_candidates;
DROP TRIGGER IF EXISTS lmp_candidates_recompute_convert_ins ON public.lmp_candidates;
DROP TRIGGER IF EXISTS lmp_candidates_recompute_convert_upd ON public.lmp_candidates;
DROP TRIGGER IF EXISTS lmp_candidates_recompute_convert_del ON public.lmp_candidates;

CREATE TRIGGER lmp_candidates_recompute_convert_ins
  AFTER INSERT ON public.lmp_candidates
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recompute_lmp_convert_ins();

CREATE TRIGGER lmp_candidates_recompute_convert_upd
  AFTER UPDATE ON public.lmp_candidates
  REFERENCING NEW TABLE AS new_rows OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recompute_lmp_convert_upd();

CREATE TRIGGER lmp_candidates_recompute_convert_del
  AFTER DELETE ON public.lmp_candidates
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.trg_recompute_lmp_convert_del();

COMMENT ON FUNCTION public._recompute_lmp_convert_for_ids(uuid[]) IS
  'Deduped statement-level recompute of final_converted_* for the given LMP ids.';
