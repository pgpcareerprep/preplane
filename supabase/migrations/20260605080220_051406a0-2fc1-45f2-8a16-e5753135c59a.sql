
-- 1. Views: enable security_invoker so they respect caller RLS.
ALTER VIEW public.students_with_load  SET (security_invoker = true);
ALTER VIEW public.lmp_full_view       SET (security_invoker = true);
ALTER VIEW public.mentors_union_view  SET (security_invoker = true);

-- 2. Revoke EXECUTE from anon on every SECURITY DEFINER function in public.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM anon, public',
                   r.proname, r.args);
    -- keep authenticated + service_role able to call them
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, r.args);
  END LOOP;
END $$;

-- 3. Drop duplicate sweeper cron job (keep the canonical 'sheets-retry-sweeper').
DO $$
BEGIN
  PERFORM cron.unschedule('sheets-retry-sweeper-every-2min');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'sheets-retry-sweeper-every-2min not scheduled: %', SQLERRM;
END $$;
