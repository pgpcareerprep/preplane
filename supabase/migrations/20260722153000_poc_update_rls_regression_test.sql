-- =============================================================================
-- Regression tripwire: an unassigned POC must never be able to silently
-- update an lmp_processes row they're not linked to.
--
-- This project has no pgTAP / DB-connected CI job (checked supabase/config.toml,
-- supabase/migrations, and .github/workflows/quality.yml before writing this —
-- none exist). The existing convention for this kind of check is an inline
-- DO block inside a migration (see 20260611150000_fix_poc_status_trigger_tests.sql),
-- reported via RAISE NOTICE/WARNING without aborting the migration. This
-- follows that pattern, but unlike that file's pure-expression tests, this one
-- exercises the real trigger + RLS policy against a real (unassigned) POC and
-- a real LMP, because "does an unauthorized UPDATE get blocked" can't be
-- verified as a boolean expression — it has to actually attempt the write.
--
-- Runs as the migration role by default, which would bypass RLS (table owner)
-- but NOT the BEFORE UPDATE trigger (triggers always fire regardless of
-- ownership). So this SET LOCAL ROLE authenticated + fakes the JWT sub claim
-- to make auth.uid() resolve to a real, currently-unassigned POC, which also
-- makes RLS apply for real (not bypassed) for the duration of this block.
-- Everything runs inside a nested BEGIN...EXCEPTION...END (PL/pgSQL's only
-- subtransaction mechanism) that's forced to roll back regardless of outcome.
--
-- Test subject: Mansi Jain (profiles.role = 'poc', approved, active — verified
-- 2026-07-22) attempting to update Sciens Logistics / Product Manager, an LMP
-- she has no prep/support/outreach/lmp_poc_links relationship to (verified
-- 2026-07-22). If either fact has drifted by the time this runs, the block
-- skips instead of asserting, so it can't produce a false pass/fail.
-- =============================================================================

DO $$
DECLARE
  v_test_poc_user_id uuid := '3f036166-836d-4b5d-9d90-0baac19e10d1'; -- Mansi Jain
  v_test_poc_id       uuid := '523379ca-639c-43d2-80f9-0f7a2158dd50';
  v_test_lmp_id       uuid := '832f4840-4e04-435c-affb-1d681f4aa8a6'; -- Sciens Logistics / Product Manager
  v_precondition_ok   boolean;
  v_row_count         int;
  v_blocked_by        text := null; -- 'trigger' | 'rls' | null (= not blocked)
BEGIN
  -- ── Re-verify the precondition at runtime (don't trust the comment above) ──
  SELECT
    pr.role = 'poc'
    AND COALESCE(pr.access_status, 'approved') = 'approved'
    AND COALESCE(pr.is_active, true) = true
    AND NOT EXISTS (
      SELECT 1 FROM public.lmp_processes l
      WHERE l.id = v_test_lmp_id
        AND (
          l.prep_poc_id = v_test_poc_id
          OR l.support_poc_id = v_test_poc_id
          OR v_test_poc_id = ANY (COALESCE(l.outreach_poc_ids, '{}'::uuid[]))
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.lmp_poc_links k
      WHERE k.lmp_id = v_test_lmp_id AND k.poc_id = v_test_poc_id AND k.is_active
    )
  INTO v_precondition_ok
  FROM public.profiles pr
  WHERE pr.user_id = v_test_poc_user_id;

  IF v_precondition_ok IS NOT TRUE THEN
    RAISE NOTICE 'SKIP: poc_update_rls regression test — precondition no longer holds (test POC/LMP data has drifted). Update the IDs in this migration''s successor if this recurs.';
    RETURN;
  END IF;

  BEGIN
    -- Impersonate the test POC: real RLS applies (not bypassed) because we
    -- drop out of the migration-owner role; the BEFORE UPDATE trigger applies
    -- regardless of role. PL/pgSQL has no explicit SAVEPOINT/ROLLBACK TO —
    -- a nested BEGIN...EXCEPTION...END is itself the only subtransaction
    -- mechanism, so we deliberately raise at the end of this block to force
    -- its rollback (undoing the role/GUC change and any accidental row
    -- effect), then swallow that specific exception below. v_blocked_by /
    -- v_row_count survive because PL/pgSQL variables aren't part of the
    -- database rollback.
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', v_test_poc_user_id::text, true);

    BEGIN
      UPDATE public.lmp_processes
      SET status = status -- no-op value; the update should never reach this far
      WHERE id = v_test_lmp_id;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      IF v_row_count = 0 THEN
        v_blocked_by := 'rls'; -- silent no-op: RLS's USING/WITH CHECK excluded the row
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_blocked_by := 'trigger'; -- enforce_poc_lmp_operational_fields (or RLS raising) rejected it
    END;

    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '__poc_update_rls_test_discard__';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> '__poc_update_rls_test_discard__' THEN
      RAISE;
    END IF;
  END;

  IF v_blocked_by IS NOT NULL THEN
    RAISE NOTICE 'PASS: unassigned POC update was blocked (mechanism: %)', v_blocked_by;
  ELSE
    RAISE WARNING 'FAIL: unassigned POC update SILENTLY SUCCEEDED (% row(s) affected) — RLS/trigger regression!', v_row_count;
  END IF;
END $$;
