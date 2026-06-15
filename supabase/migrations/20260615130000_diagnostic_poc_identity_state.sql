-- =============================================================================
-- DIAGNOSTIC ONLY — no data changes.
-- Prints the complete poc_profiles + lmp_processes identity state to logs.
-- Run: supabase db push --linked and read the NOTICE output.
-- =============================================================================

DO $$
DECLARE r record;
BEGIN
  RAISE NOTICE '=== poc_profiles rows ===';
  FOR r IN
    SELECT id, name, email, approved_user_id, status, role_type, access_level
    FROM public.poc_profiles
    ORDER BY name
  LOOP
    RAISE NOTICE 'poc_profiles | id=% | name=% | email=% | approved_user_id=%',
      r.id, r.name, COALESCE(r.email, 'NULL'), COALESCE(r.approved_user_id::text, 'NULL');
  END LOOP;

  RAISE NOTICE '=== lmp_processes POC columns ===';
  FOR r IN
    SELECT
      lmp_code, company, role,
      prep_poc, prep_poc_id,
      support_poc, support_poc_id,
      outreach_poc, outreach_poc_ids
    FROM public.lmp_processes
    WHERE is_archived IS NOT TRUE
    ORDER BY company, role
  LOOP
    RAISE NOTICE 'lmp | % | %@% | prep_poc=% (id=%) | support_poc=% (id=%) | outreach_poc=% (ids=%)',
      r.lmp_code,
      COALESCE(r.role, '-'),
      COALESCE(r.company, '-'),
      COALESCE(r.prep_poc, 'NULL'),
      COALESCE(r.prep_poc_id::text, 'NULL'),
      COALESCE(r.support_poc, 'NULL'),
      COALESCE(r.support_poc_id::text, 'NULL'),
      COALESCE(r.outreach_poc, 'NULL'),
      COALESCE(array_to_string(r.outreach_poc_ids, ','), 'NULL');
  END LOOP;

  RAISE NOTICE '=== Cross-check: lmp *_poc_id → poc_profiles.name ===';
  FOR r IN
    SELECT
      lp.lmp_code,
      lp.prep_poc       AS text_prep,
      pp_prep.name      AS id_prep_name,
      lp.support_poc    AS text_supp,
      pp_supp.name      AS id_supp_name
    FROM public.lmp_processes lp
    LEFT JOIN public.poc_profiles pp_prep ON pp_prep.id = lp.prep_poc_id
    LEFT JOIN public.poc_profiles pp_supp ON pp_supp.id = lp.support_poc_id
    WHERE lp.is_archived IS NOT TRUE
      AND (
        lp.prep_poc IS NOT NULL OR lp.support_poc IS NOT NULL
      )
    ORDER BY lp.company
  LOOP
    RAISE NOTICE 'cross | % | prep: text=% id_name=% | supp: text=% id_name=%',
      r.lmp_code,
      COALESCE(r.text_prep, 'NULL'),
      COALESCE(r.id_prep_name, 'NO_MATCH'),
      COALESCE(r.text_supp, 'NULL'),
      COALESCE(r.id_supp_name, 'NO_MATCH');
  END LOOP;
END $$;
