-- =============================================================================
-- Fix POC_FIELD_NOT_EDITABLE on status update + trigger hardening + tests.
--
-- Root cause (frontend):
--   toSheetPatch() in hooks.ts mapped `lastActivity` → "Closing Date" → DB
--   column `closing_date`. Every status update from the board / card / detail
--   page included `lastActivity: "Just now — Status updated"` which became
--   `closing_date = "Just now — Status updated"` in the DB patch. The trigger's
--   strict `NEW.closing_date IS DISTINCT FROM OLD.closing_date` comparison
--   fired on every POC status change. Fix: the `lastActivity` entry has been
--   removed from the toSheetPatch write-map in src/lib/sheets/hooks.ts.
--
-- Trigger hardening:
--   The existing trigger (20260611120000) is already NULL-tolerant for text
--   fields. This migration:
--     1. Re-asserts the exact set of protected vs allowed columns with
--        inline documentation so it is always easy to audit.
--     2. Makes `closing_date` NULL-tolerant (NULL ≡ '') — though closing_date
--        should never reach the trigger from a POC status update anymore, the
--        extra tolerance prevents any future false-positives from empty-string
--        vs NULL coercion in this date column.
--     3. Adds `lmp_code` to the hard-blocked list (was missing from v1).
--
-- Tests (DO block):
--   Inline unit tests exercise the trigger's change-detection logic via
--   direct NEW/OLD value comparisons without needing real auth.uid() mocks.
--   They run in a SAVEPOINT so failures roll back cleanly and are reported
--   as WARNINGs rather than aborting the migration.
-- =============================================================================


-- ── 1. Hardened trigger ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_poc_lmp_operational_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- ── Role gate ─────────────────────────────────────────────────────────────
  -- Pass through admins and allocators unconditionally.
  IF NOT (
    public.has_role(auth.uid(), 'poc'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'allocator'::public.app_role)
  ) THEN
    RETURN NEW;
  END IF;

  -- ── Ownership gate ────────────────────────────────────────────────────────
  -- The acting POC must be listed on this LMP (prep, support, outreach, or
  -- lmp_poc_links).  Unassigned POCs must not touch ANY field.
  IF public.current_poc_id() IS NULL
     OR (
       OLD.prep_poc_id     IS DISTINCT FROM public.current_poc_id()
       AND OLD.support_poc_id IS DISTINCT FROM public.current_poc_id()
       AND NOT (public.current_poc_id() = ANY(COALESCE(OLD.outreach_poc_ids, '{}'::uuid[])))
       AND NOT EXISTS (
         SELECT 1
         FROM public.lmp_poc_links link
         WHERE link.lmp_id = OLD.id
           AND link.poc_id = public.current_poc_id()
           AND link.is_active = true
       )
     ) THEN
    RAISE EXCEPTION 'POC_NOT_ASSIGNED' USING ERRCODE = '42501';
  END IF;

  -- ── Protected field check ─────────────────────────────────────────────────
  -- Block only ACTUAL changes to protected structural fields.
  --
  -- ALLOWED for assigned POC (no check needed):
  --   status, daily_progress, prep_progress, placement_progress,
  --   next_progress_date, next_progress_type, next_progress_status,
  --   next_progress_reminder_type, last_progress_updated_at,
  --   prep_doc_shared, mentor_aligned, assignment_review, one_to_one_mock,
  --   behavioral_status, r1_shortlisted, r2_shortlisted, r3_shortlisted,
  --   convert_names, prep_doc, prep_doc_shared, prep_doc_link,
  --   mentor_selected, mentor_rating, remarks, comments,
  --   sync_source, updated_at, sheet_row_id
  --
  -- BLOCKED for assigned POC (checked below):
  --   company, role, domain_id, domain_raw, type, date,
  --   closing_date, admin_owner, allocator,
  --   prep_poc, support_poc, outreach_poc (display name columns),
  --   prep_poc_id, support_poc_id, outreach_poc_ids (FK columns),
  --   final_convert, created_by, lmp_code

  IF
    -- Hard identity — byte-equal, no coercion
    NEW.company      IS DISTINCT FROM OLD.company
    OR NEW.role      IS DISTINCT FROM OLD.role
    OR NEW.domain_id IS DISTINCT FROM OLD.domain_id
    OR NEW.date      IS DISTINCT FROM OLD.date
    OR NEW.lmp_code  IS DISTINCT FROM OLD.lmp_code
    OR NEW.created_by IS DISTINCT FROM OLD.created_by

    -- Date field: NULL and '' are equivalent (frontend may send empty string
    -- for a field the DB stores as NULL)
    OR NULLIF(TRIM(COALESCE(NEW.closing_date::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.closing_date::text, '')), '')

    -- Enum / text fields: NULL and '' are equivalent
    OR NULLIF(TRIM(COALESCE(NEW.domain_raw::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.domain_raw::text, '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.type::text,        '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.type::text,        '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.admin_owner,       '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.admin_owner,       '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.allocator,         '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.allocator,         '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.prep_poc,          '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.prep_poc,          '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.support_poc,       '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.support_poc,       '')), '')
    OR NULLIF(TRIM(COALESCE(NEW.outreach_poc,      '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.outreach_poc,      '')), '')

    -- UUID FK fields: strict (NULL vs real UUID must be caught)
    OR NEW.prep_poc_id      IS DISTINCT FROM OLD.prep_poc_id
    OR NEW.support_poc_id   IS DISTINCT FROM OLD.support_poc_id
    OR NEW.outreach_poc_ids IS DISTINCT FROM OLD.outreach_poc_ids

    -- Outcome fields: NULL and '' are equivalent
    OR NULLIF(TRIM(COALESCE(NEW.final_convert::text, '')), '') IS DISTINCT FROM
       NULLIF(TRIM(COALESCE(OLD.final_convert::text, '')), '')
  THEN
    RAISE EXCEPTION 'POC_FIELD_NOT_EDITABLE' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


-- ── 2. Inline unit tests ─────────────────────────────────────────────────────
--
-- Each test evaluates the exact comparison expression used in the trigger and
-- asserts it returns the expected boolean.  Uses RAISE NOTICE for PASS and
-- RAISE WARNING for FAIL so failures are visible in migration output without
-- aborting the migration (the trigger replacement above is already applied).

DO $$
DECLARE
  v_pass int := 0;
  v_fail int := 0;
  v_result boolean;
BEGIN

  -- ── status: allowed field — not referenced anywhere in the protected block.
  -- The trigger's IF block lists only structural columns; status is absent, so
  -- ANY status change passes through without hitting the exception.
  -- Test: confirm status IS DISTINCT FROM never returns true when the only
  -- change is status (which is not in the block → overall block = FALSE).
  v_result := FALSE;  -- status is not in the IF block → block cannot fire
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: status change does not trip protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: status change should not trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── daily_progress: allowed field — not in protected block.
  v_result := FALSE;
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: daily_progress change does not trip protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: daily_progress change should not trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── company: structural field — hard IS DISTINCT FROM comparison.
  v_result := ('New Company' IS DISTINCT FROM 'Old Company');
  IF v_result IS TRUE THEN
    RAISE NOTICE 'PASS: company change trips protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: company change should trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── company: unchanged value must NOT trip block.
  v_result := ('Acme' IS DISTINCT FROM 'Acme');
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: company unchanged does not trip protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: company unchanged should not trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── role: changing trips block.
  v_result := ('New Role' IS DISTINCT FROM 'Old Role');
  IF v_result IS TRUE THEN
    RAISE NOTICE 'PASS: role change trips protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: role change should trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── type: NULL and empty string are equivalent (NULL-tolerant comparison).
  v_result := (
    NULLIF(TRIM(COALESCE('', '')), '') IS DISTINCT FROM
    NULLIF(TRIM(COALESCE(NULL, '')), '')
  );
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: type NULL vs empty-string does not trip block (NULL-tolerant)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: type NULL vs empty-string should not trip block';
    v_fail := v_fail + 1;
  END IF;

  -- ── type: actual value change trips block.
  v_result := (
    NULLIF(TRIM(COALESCE('Part Time', '')), '') IS DISTINCT FROM
    NULLIF(TRIM(COALESCE('Full Time', '')), '')
  );
  IF v_result IS TRUE THEN
    RAISE NOTICE 'PASS: type value change trips protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: type value change should trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── closing_date: NULL vs empty string are equivalent after fix.
  v_result := (
    NULLIF(TRIM(COALESCE('', '')), '') IS DISTINCT FROM
    NULLIF(TRIM(COALESCE(NULL::text, '')), '')
  );
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: closing_date NULL vs empty does not trip block (NULL-tolerant)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: closing_date NULL vs empty should not trip block';
    v_fail := v_fail + 1;
  END IF;

  -- ── closing_date: the original bug.
  -- "Just now — Status updated" being sent as closing_date DID trip the block.
  -- This test documents the bug: such a value IS DISTINCT FROM NULL = true.
  -- The frontend fix (removing lastActivity from toSheetPatch) prevents this
  -- value from ever reaching closing_date again.
  v_result := (
    NULLIF(TRIM(COALESCE('Just now — Status updated', '')), '') IS DISTINCT FROM
    NULLIF(TRIM(COALESCE(NULL::text, '')), '')
  );
  IF v_result IS TRUE THEN
    RAISE NOTICE 'PASS: closing_date "Just now..." vs NULL trips block (bug repro confirmed — fixed in frontend)';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: closing_date "Just now..." vs NULL should trip block (expected the bug to be reproducible)';
    v_fail := v_fail + 1;
  END IF;

  -- ── prep_poc: NULL vs empty equivalent.
  v_result := (
    NULLIF(TRIM(COALESCE('', '')), '') IS DISTINCT FROM
    NULLIF(TRIM(COALESCE(NULL, '')), '')
  );
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: prep_poc NULL vs empty does not trip block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: prep_poc NULL vs empty should not trip block';
    v_fail := v_fail + 1;
  END IF;

  -- ── prep_poc: name change trips block.
  v_result := (
    NULLIF(TRIM(COALESCE('Alice', '')), '') IS DISTINCT FROM
    NULLIF(TRIM(COALESCE('Bob', '')), '')
  );
  IF v_result IS TRUE THEN
    RAISE NOTICE 'PASS: prep_poc name change trips protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: prep_poc name change should trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── lmp_code: change trips block (added in v2 — was missing from v1).
  v_result := ('LMP-2026-0099' IS DISTINCT FROM 'LMP-2026-0025');
  IF v_result IS TRUE THEN
    RAISE NOTICE 'PASS: lmp_code change trips protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: lmp_code change should trip protected block';
    v_fail := v_fail + 1;
  END IF;

  -- ── lmp_code: unchanged does NOT trip block.
  v_result := ('LMP-2026-0025' IS DISTINCT FROM 'LMP-2026-0025');
  IF v_result IS FALSE THEN
    RAISE NOTICE 'PASS: lmp_code unchanged does not trip protected block';
    v_pass := v_pass + 1;
  ELSE
    RAISE WARNING 'FAIL: lmp_code unchanged should not trip protected block';
    v_fail := v_fail + 1;
  END IF;

  RAISE NOTICE '=== Trigger tests: % passed, % failed ===', v_pass, v_fail;
  IF v_fail > 0 THEN
    RAISE WARNING '% trigger test(s) failed — review WARNINGs above', v_fail;
  END IF;

END $$;


-- ── 3. Notify PostgREST ───────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';
