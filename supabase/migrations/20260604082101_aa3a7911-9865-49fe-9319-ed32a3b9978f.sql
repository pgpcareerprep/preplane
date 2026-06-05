DROP TRIGGER IF EXISTS trg_sync_profile_to_poc ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_to_poc();